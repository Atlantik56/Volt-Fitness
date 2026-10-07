package com.voltfitness.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
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
import com.voltfitness.healthbridge.core.HeartRateMetrics
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
import java.time.ZoneId
import androidx.health.connect.client.request.AggregateRequest
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
        if(PermissionKey.SLEEP in permissions.granted)readAll(SleepSessionRecord::class,since,now).forEach{record->
            val sleepSeconds=client!!.aggregate(AggregateRequest(setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),TimeRangeFilter.between(record.startTime,record.endTime),setOf(record.metadata.dataOrigin)))[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.seconds?:0L
            if(sleepSeconds<=0)return@forEach
            val origin=origin(record.metadata.dataOrigin);records+=NormalizedRecord(origin,stable(record.metadata.id,origin,RecordType.SLEEP,record.startTime,record.endTime,record.title.orEmpty()),RecordType.SLEEP,record.startTime,record.endTime,record.metadata.lastModifiedTime,SleepMetrics(sleepSeconds,record.title,record.stages.map{SleepStage("stage_${it.stage}",it.startTime,it.endTime)}))
        }
        if(PermissionKey.RESTING_HEART_RATE in permissions.granted)readAll(RestingHeartRateRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.RESTING_HEART_RATE,RestingHeartRateMetrics(record.beatsPerMinute.toInt()),record.beatsPerMinute.toString())}
        if(PermissionKey.HEART_RATE_VARIABILITY in permissions.granted)readAll(HeartRateVariabilityRmssdRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.HEART_RATE_VARIABILITY,HrvMetrics(record.heartRateVariabilityMillis),record.heartRateVariabilityMillis.toString())}
        if(PermissionKey.WEIGHT in permissions.granted)readAll(WeightRecord::class,since,now).forEach{record->point(records,record.metadata.id,record.metadata.dataOrigin,record.time,record.metadata.lastModifiedTime,RecordType.WEIGHT,WeightMetrics(record.weight.inKilograms),record.weight.inKilograms.toString())}
        val zone=ZoneId.systemDefault()
        val aggregateOrigin=SourceOrigin("health_connect.aggregate","Health Connect")
        val contributingOrigins=mutableSetOf<SourceOrigin>()
        val today=now.atZone(zone).toLocalDate()
        for(offset in 0L..29L){
            val date=today.minusDays(offset)
            val start=date.atStartOfDay(zone).toInstant()
            val end=minOf(date.plusDays(1).atStartOfDay(zone).toInstant(),now)
            if(!start.isBefore(end))continue
            suspend fun aggregateSteps(){
                val result=client!!.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL),TimeRangeFilter.between(start,end)))
                contributingOrigins+=result.dataOrigins.map{origin(it)}
                val value=result[StepsRecord.COUNT_TOTAL]?:return
                records+=NormalizedRecord(aggregateOrigin,"daily:$date:steps",RecordType.STEPS,start,end,now,StepsMetrics(value))
            }
            suspend fun aggregateCalories(active:Boolean){
                val metric=if(active)ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL else TotalCaloriesBurnedRecord.ENERGY_TOTAL
                var result=client!!.aggregate(AggregateRequest(setOf(metric),TimeRangeFilter.between(start,end)))
                // Calories may combine writers. Pick one writer instead of adding copies.
                val sources=result.dataOrigins.sortedWith(compareBy<DataOrigin>{if(it.packageName.contains("garmin",true))0 else 1}.thenBy{it.packageName})
                if(sources.size>1)result=client!!.aggregate(AggregateRequest(setOf(metric),TimeRangeFilter.between(start,end),setOf(sources.first())))
                contributingOrigins+=result.dataOrigins.map{origin(it)}
                val value=result[metric]?.inKilocalories?:return
                val type=if(active)RecordType.ACTIVE_CALORIES else RecordType.TOTAL_CALORIES
                records+=NormalizedRecord(aggregateOrigin,"daily:$date:${type.wireName}",type,start,end,now,CaloriesMetrics(value))
            }
            if(PermissionKey.HEART_RATE in permissions.granted){
                val metrics=setOf(HeartRateRecord.BPM_AVG,HeartRateRecord.BPM_MIN,HeartRateRecord.BPM_MAX,HeartRateRecord.MEASUREMENTS_COUNT)
                var result=client!!.aggregate(AggregateRequest(metrics,TimeRangeFilter.between(start,end)))
                val sources=result.dataOrigins.sortedWith(compareBy<DataOrigin>{if(it.packageName.contains("garmin",true))0 else 1}.thenBy{it.packageName})
                if(sources.size>1)result=client!!.aggregate(AggregateRequest(metrics,TimeRangeFilter.between(start,end),setOf(sources.first())))
                contributingOrigins+=result.dataOrigins.map{origin(it)}
                val average=result[HeartRateRecord.BPM_AVG]?.toInt()
                if(average!=null)records+=NormalizedRecord(aggregateOrigin,"daily:$date:heart_rate",RecordType.HEART_RATE,start,end,now,HeartRateMetrics((result[HeartRateRecord.MEASUREMENTS_COUNT]?:0L).toInt(),result[HeartRateRecord.BPM_MIN]?.toInt(),average,result[HeartRateRecord.BPM_MAX]?.toInt(),emptyList()))
            }
            if(PermissionKey.STEPS in permissions.granted)aggregateSteps()
            if(PermissionKey.TOTAL_CALORIES in permissions.granted)aggregateCalories(false)
            if(PermissionKey.ACTIVE_CALORIES in permissions.granted)aggregateCalories(true)
        }
        val origins=records.map{it.origin}.toSet()+contributingOrigins
        return HealthCollection(records.distinctBy{listOf(it.origin.packageName,it.recordType.wireName,it.externalRecordId)},SyncDiagnostics(true,permissions.granted,permissions.historyAvailable,permissions.historyGranted,records.map{it.recordType}.toSet(),origins,zone.id,BuildConfig.VERSION_NAME))
    }

    private fun point(target:MutableList<NormalizedRecord>,id:String,source:DataOrigin,time:Instant,modified:Instant,type:RecordType,metrics:com.voltfitness.healthbridge.core.NormalizedMetrics,values:String){
        val origin=origin(source);target+=NormalizedRecord(origin,stable(id,origin,type,time,time,values),type,time,time,modified,metrics)
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
