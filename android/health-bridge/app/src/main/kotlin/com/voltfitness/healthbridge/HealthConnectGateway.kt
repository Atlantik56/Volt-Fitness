package com.voltfitness.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.voltfitness.healthbridge.core.CaloriesMetrics
import com.voltfitness.healthbridge.core.ExerciseMetrics
import com.voltfitness.healthbridge.core.HeartRateMetrics
import com.voltfitness.healthbridge.core.HeartSample
import com.voltfitness.healthbridge.core.HrvMetrics
import com.voltfitness.healthbridge.core.NormalizedRecord
import com.voltfitness.healthbridge.core.PermissionKey
import com.voltfitness.healthbridge.core.PermissionSnapshot
import com.voltfitness.healthbridge.core.RecordType
import com.voltfitness.healthbridge.core.RestingHeartRateMetrics
import com.voltfitness.healthbridge.core.SleepMetrics
import com.voltfitness.healthbridge.core.SleepStage
import com.voltfitness.healthbridge.core.SourceOrigin
import com.voltfitness.healthbridge.core.StepsMetrics
import com.voltfitness.healthbridge.core.SyncDiagnostics
import com.voltfitness.healthbridge.core.WeightMetrics
import com.voltfitness.healthbridge.core.stableExternalId
import java.time.Duration
import java.time.Instant
import kotlin.math.roundToInt
import kotlin.reflect.KClass

data class HealthCollection(val records:List<NormalizedRecord>,val diagnostics:SyncDiagnostics)

class HealthConnectGateway(private val context:Context){
    private val status=HealthConnectClient.getSdkStatus(context)
    val available:Boolean get()=status==HealthConnectClient.SDK_AVAILABLE
    private val client:HealthConnectClient? by lazy{if(available)HealthConnectClient.getOrCreate(context) else null}
    val permissionMap:Map<PermissionKey,String> = mapOf(
        PermissionKey.HEART_RATE to HealthPermission.getReadPermission(HeartRateRecord::class),
        PermissionKey.RESTING_HEART_RATE to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        PermissionKey.HEART_RATE_VARIABILITY to HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        PermissionKey.SLEEP to HealthPermission.getReadPermission(SleepSessionRecord::class),
        PermissionKey.WEIGHT to HealthPermission.getReadPermission(WeightRecord::class),
        PermissionKey.EXERCISE to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        PermissionKey.STEPS to HealthPermission.getReadPermission(StepsRecord::class),
        PermissionKey.TOTAL_CALORIES to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        PermissionKey.ACTIVE_CALORIES to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )
    val requiredPermissions:Set<String> get()=permissionMap.values.toSet()
    val historyPermission:String get()=HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY

    suspend fun permissionSnapshot():PermissionSnapshot{
        if(!available)return PermissionSnapshot(false,emptySet(),false,false)
        val granted=client!!.permissionController.getGrantedPermissions()
        val keys=permissionMap.filterValues{it in granted}.keys
        val historyAvailable=client!!.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)==HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        return PermissionSnapshot(true,keys,historyAvailable,historyPermission in granted)
    }

    suspend fun collect(now:Instant=Instant.now()):HealthCollection{
        val permissions=permissionSnapshot()
        if(!permissions.available)return HealthCollection(emptyList(),SyncDiagnostics(false,emptySet(),false,false,emptySet(),emptySet()))
        val since=now.minus(Duration.ofDays(30))
        val records=mutableListOf<NormalizedRecord>()
        if(PermissionKey.EXERCISE in permissions.granted)readAll(ExerciseSessionRecord::class,since,now).forEach{records+=exercise(it,permissions)}
        if(PermissionKey.SLEEP in permissions.granted)readAll(SleepSessionRecord::class,since,now).forEach{record->
            val origin=origin(record.metadata.dataOrigin);records+=NormalizedRecord(origin,stable(record.metadata.id,origin,RecordType.SLEEP,record.startTime,record.endTime,record.title.orEmpty()),RecordType.SLEEP,record.startTime,record.endTime,record.metadata.lastModifiedTime,SleepMetrics(Duration.between(record.startTime,record.endTime).seconds,record.title,record.stages.map{SleepStage("stage_${it.stage}",it.startTime,it.endTime)}))
        }
        if(PermissionKey.HEART_RATE in permissions.granted)readAll(HeartRateRecord::class,since,now).forEach{record->
            val samples=record.samples.map{HeartSample(it.time,it.beatsPerMinute.toInt())}
            val values=samples.map{it.bpm}
            val origin=origin(record.metadata.dataOrigin)
            records+=NormalizedRecord(origin,stable(record.metadata.id,origin,RecordType.HEART_RATE,record.startTime,record.endTime,values.joinToString(",")),RecordType.HEART_RATE,record.startTime,record.endTime,record.metadata.lastModifiedTime,HeartRateMetrics(samples.size,values.minOrNull(),values.takeIf{it.isNotEmpty()}?.average()?.roundToInt(),values.maxOrNull(),samples.take(2_000)))
        }
        if(PermissionKey.RESTING_HEART_RATE in permissions.granted)readAll(RestingHeartRateRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.RESTING_HEART_RATE,RestingHeartRateMetrics(record.beatsPerMinute.toInt()),record.beatsPerMinute.toString())}
        if(PermissionKey.HEART_RATE_VARIABILITY in permissions.granted)readAll(HeartRateVariabilityRmssdRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.HEART_RATE_VARIABILITY,HrvMetrics(record.heartRateVariabilityMillis),record.heartRateVariabilityMillis.toString())}
        if(PermissionKey.WEIGHT in permissions.granted)readAll(WeightRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.WEIGHT,WeightMetrics(record.weight.inKilograms),record.weight.inKilograms.toString())}
        if(PermissionKey.STEPS in permissions.granted)readAll(StepsRecord::class,since,now).forEach{record->interval(records,record.metadata.id,record.metadata.dataOrigin,record.startTime,record.endTime,record.metadata.lastModifiedTime,RecordType.STEPS,StepsMetrics(record.count),record.count.toString())}
        if(PermissionKey.TOTAL_CALORIES in permissions.granted)readAll(TotalCaloriesBurnedRecord::class,since,now).forEach{record->interval(records,record.metadata.id,record.metadata.dataOrigin,record.startTime,record.endTime,record.metadata.lastModifiedTime,RecordType.TOTAL_CALORIES,CaloriesMetrics(record.energy.inKilocalories),record.energy.inKilocalories.toString())}
        if(PermissionKey.ACTIVE_CALORIES in permissions.granted)readAll(ActiveCaloriesBurnedRecord::class,since,now).forEach{record->interval(records,record.metadata.id,record.metadata.dataOrigin,record.startTime,record.endTime,record.metadata.lastModifiedTime,RecordType.ACTIVE_CALORIES,CaloriesMetrics(record.energy.inKilocalories),record.energy.inKilocalories.toString())}
        val origins=records.map{it.origin}.toSet()
        return HealthCollection(records.distinctBy{listOf(it.origin.packageName,it.recordType.wireName,it.externalRecordId)},SyncDiagnostics(true,permissions.granted,permissions.historyAvailable,permissions.historyGranted,records.map{it.recordType}.toSet(),origins))
    }

    private suspend fun exercise(record:ExerciseSessionRecord,permissions:PermissionSnapshot):NormalizedRecord{
        val origin=origin(record.metadata.dataOrigin)
        val filter=setOf(record.metadata.dataOrigin)
        val heart=if(PermissionKey.HEART_RATE in permissions.granted)readAll(HeartRateRecord::class,record.startTime,record.endTime,filter).flatMap{it.samples}.map{it.beatsPerMinute.toInt()}else emptyList()
        // Distance intentionally remains null: Sprint 1 does not request READ_DISTANCE.
        val distance:Double?=null
        val calories=if(PermissionKey.TOTAL_CALORIES in permissions.granted)readAll(TotalCaloriesBurnedRecord::class,record.startTime,record.endTime,filter).sumOf{it.energy.inKilocalories}.takeIf{it>0}else null
        val type="health_connect_${record.exerciseType}"
        val duration=Duration.between(record.startTime,record.endTime).seconds.coerceAtLeast(1)
        return NormalizedRecord(origin,stable(record.metadata.id,origin,RecordType.EXERCISE,record.startTime,record.endTime,"$type|$duration|$distance"),RecordType.EXERCISE,record.startTime,record.endTime,record.metadata.lastModifiedTime,ExerciseMetrics(type,record.title,duration,distance,calories,heart.takeIf{it.isNotEmpty()}?.average()?.roundToInt(),heart.maxOrNull()))
    }

    private fun point(target:MutableList<NormalizedRecord>,id:String,source:DataOrigin,time:Instant,modified:Instant,type:RecordType,metrics:com.voltfitness.healthbridge.core.NormalizedMetrics,values:String){
        val origin=origin(source);target+=NormalizedRecord(origin,stable(id,origin,type,time,time,values),type,time,time,modified,metrics)
    }
    private fun interval(target:MutableList<NormalizedRecord>,id:String,source:DataOrigin,start:Instant,end:Instant,modified:Instant,type:RecordType,metrics:com.voltfitness.healthbridge.core.NormalizedMetrics,values:String){
        val origin=origin(source);target+=NormalizedRecord(origin,stable(id,origin,type,start,end,values),type,start,end,modified,metrics)
    }
    private fun stable(id:String,origin:SourceOrigin,type:RecordType,start:Instant,end:Instant,values:String)=stableExternalId(id,origin.packageName,type,start,end,values)
    private fun origin(value:DataOrigin):SourceOrigin{
        val name=runCatching{val info=context.packageManager.getApplicationInfo(value.packageName,0);context.packageManager.getApplicationLabel(info).toString()}.getOrDefault(value.packageName)
        return SourceOrigin(value.packageName,name)
    }
    private suspend fun <T:Record> readAll(type:KClass<T>,start:Instant,end:Instant,origins:Set<DataOrigin> = emptySet()):List<T>{
        val output=mutableListOf<T>();var token:String?=null
        do{val response=client!!.readRecords(ReadRecordsRequest(type,TimeRangeFilter.between(start,end),origins,true,500,token));output+=response.records;token=response.pageToken}while(token!=null)
        return output
    }
}
