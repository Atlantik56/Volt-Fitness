package com.voltfitness.healthbridge.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import java.security.MessageDigest
import java.time.Instant

enum class PermissionKey(val wireName: String) {
    HEART_RATE("heart_rate"), RESTING_HEART_RATE("resting_heart_rate"), HEART_RATE_VARIABILITY("heart_rate_variability"),
    SLEEP("sleep"), WEIGHT("weight"), EXERCISE("exercise"), STEPS("steps"),
    TOTAL_CALORIES("total_calories"), ACTIVE_CALORIES("active_calories")
}

enum class RecordType(val wireName: String) {
    EXERCISE("exercise"), SLEEP("sleep"), HEART_RATE("heart_rate"), RESTING_HEART_RATE("resting_heart_rate"),
    HEART_RATE_VARIABILITY("heart_rate_variability"), WEIGHT("weight"), STEPS("steps"),
    TOTAL_CALORIES("total_calories"), ACTIVE_CALORIES("active_calories")
}

data class SourceOrigin(val packageName: String, val name: String, val isGarmin: Boolean = isGarminOrigin(packageName, name))
data class PermissionSnapshot(val available: Boolean, val granted: Set<PermissionKey>, val historyAvailable: Boolean, val historyGranted: Boolean) {
    val missing: Set<PermissionKey> get() = PermissionKey.entries.toSet() - granted
}
data class HeartSample(val time: Instant, val bpm: Int)
data class SleepStage(val type: String, val start: Instant, val end: Instant)

sealed interface NormalizedMetrics
data class ExerciseMetrics(val exerciseType:String,val title:String?,val durationSeconds:Long,val distanceMeters:Double?,val caloriesKcal:Double?,val averageHeartRate:Int?,val maxHeartRate:Int?):NormalizedMetrics
data class SleepMetrics(val durationSeconds:Long,val title:String?,val stages:List<SleepStage>):NormalizedMetrics
data class HeartRateMetrics(val sampleCount:Int,val minimumBpm:Int?,val averageBpm:Int?,val maximumBpm:Int?,val samples:List<HeartSample>):NormalizedMetrics
data class RestingHeartRateMetrics(val bpm:Int):NormalizedMetrics
data class HrvMetrics(val rmssdMillis:Double):NormalizedMetrics
data class WeightMetrics(val kilograms:Double):NormalizedMetrics
data class StepsMetrics(val count:Long):NormalizedMetrics
data class CaloriesMetrics(val kilocalories:Double):NormalizedMetrics

data class NormalizedRecord(
    val origin:SourceOrigin,
    val externalRecordId:String,
    val recordType:RecordType,
    val startTime:Instant,
    val endTime:Instant,
    val sourceModifiedAt:Instant?,
    val metrics:NormalizedMetrics,
)

data class SyncDiagnostics(
    val healthConnectAvailable:Boolean,
    val grantedPermissions:Set<PermissionKey>,
    val historyAccessAvailable:Boolean,
    val historyAccessGranted:Boolean,
    val discoveredRecordTypes:Set<RecordType>,
    val origins:Set<SourceOrigin>,
)

fun isGarminOrigin(packageName:String,name:String=""):Boolean =
    packageName.contains("garmin",ignoreCase=true)||name.contains("garmin",ignoreCase=true)

fun stableExternalId(metadataId:String?,origin:String,recordType:RecordType,start:Instant,end:Instant,values:String):String {
    if(!metadataId.isNullOrBlank())return metadataId.take(240)
    val canonical=listOf(origin,recordType.wireName,start.toString(),end.toString(),values).joinToString("|")
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray()).joinToString(""){"%02x".format(it)}
}

private fun nullable(value:Number?):kotlinx.serialization.json.JsonElement=value?.let{JsonPrimitive(it)}?:JsonNull
private fun nullable(value:String?):kotlinx.serialization.json.JsonElement=value?.let{JsonPrimitive(it)}?:JsonNull
private fun NormalizedMetrics.toJson():JsonObject=when(this){
    is ExerciseMetrics->buildJsonObject { put("exerciseType",JsonPrimitive(exerciseType));put("title",nullable(title));put("durationSeconds",JsonPrimitive(durationSeconds));put("distanceMeters",nullable(distanceMeters));put("caloriesKcal",nullable(caloriesKcal));put("averageHeartRate",nullable(averageHeartRate));put("maxHeartRate",nullable(maxHeartRate)) }
    is SleepMetrics->buildJsonObject { put("durationSeconds",JsonPrimitive(durationSeconds));put("title",nullable(title));put("stages",buildJsonArray { stages.forEach { add(buildJsonObject { put("stageType",JsonPrimitive(it.type));put("startTime",JsonPrimitive(it.start.toString()));put("endTime",JsonPrimitive(it.end.toString())) }) } }) }
    is HeartRateMetrics->buildJsonObject { put("sampleCount",JsonPrimitive(sampleCount));put("minimumBpm",nullable(minimumBpm));put("averageBpm",nullable(averageBpm));put("maximumBpm",nullable(maximumBpm));put("samples",buildJsonArray { samples.take(2_000).forEach { add(buildJsonObject { put("time",JsonPrimitive(it.time.toString()));put("bpm",JsonPrimitive(it.bpm)) }) } }) }
    is RestingHeartRateMetrics->buildJsonObject { put("bpm",JsonPrimitive(bpm)) }
    is HrvMetrics->buildJsonObject { put("rmssdMillis",JsonPrimitive(rmssdMillis)) }
    is WeightMetrics->buildJsonObject { put("kilograms",JsonPrimitive(kilograms)) }
    is StepsMetrics->buildJsonObject { put("count",JsonPrimitive(count)) }
    is CaloriesMetrics->buildJsonObject { put("kilocalories",JsonPrimitive(kilocalories)) }
}

fun NormalizedRecord.toJson():JsonObject=buildJsonObject {
    put("source",JsonPrimitive("health_connect"));put("sourceOrigin",JsonPrimitive(origin.packageName));put("sourceOriginName",JsonPrimitive(origin.name));put("externalRecordId",JsonPrimitive(externalRecordId));put("recordType",JsonPrimitive(recordType.wireName));put("startTime",JsonPrimitive(startTime.toString()));put("endTime",JsonPrimitive(endTime.toString()));put("sourceModifiedAt",sourceModifiedAt?.let{JsonPrimitive(it.toString())}?:JsonNull);put("metrics",metrics.toJson())
}

fun syncBatchJson(syncedAt:Instant,diagnostics:SyncDiagnostics,records:List<NormalizedRecord>):JsonObject=buildJsonObject {
    put("syncedAt",JsonPrimitive(syncedAt.toString()))
    put("diagnostics",buildJsonObject {
        put("healthConnectAvailable",JsonPrimitive(diagnostics.healthConnectAvailable));put("grantedPermissions",JsonArray(diagnostics.grantedPermissions.sortedBy{it.wireName}.map{JsonPrimitive(it.wireName)}));put("historyAccessAvailable",JsonPrimitive(diagnostics.historyAccessAvailable));put("historyAccessGranted",JsonPrimitive(diagnostics.historyAccessGranted));put("discoveredRecordTypes",JsonArray(diagnostics.discoveredRecordTypes.sortedBy{it.wireName}.map{JsonPrimitive(it.wireName)}));put("origins",JsonArray(diagnostics.origins.sortedBy{it.packageName}.map{buildJsonObject { put("packageName",JsonPrimitive(it.packageName));put("name",JsonPrimitive(it.name));put("isGarmin",JsonPrimitive(it.isGarmin)) }}))
    })
    put("records",JsonArray(records.map{it.toJson()}))
}

fun syncBatchPayloads(
    syncedAt:Instant,
    diagnostics:SyncDiagnostics,
    records:List<NormalizedRecord>,
    maxRecords:Int=50,
    maxBytes:Int=256_000,
):List<JsonObject>{
    require(maxRecords>0&&maxBytes>0)
    if(records.isEmpty())return listOf(syncBatchJson(syncedAt,diagnostics,emptyList()))
    val payloads=mutableListOf<JsonObject>()
    var pending=mutableListOf<NormalizedRecord>()
    for(record in records){
        val candidate=pending+record
        val candidatePayload=syncBatchJson(syncedAt,diagnostics,candidate)
        if(pending.isNotEmpty()&&(candidate.size>maxRecords||candidatePayload.toString().toByteArray(Charsets.UTF_8).size>maxBytes)){
            payloads+=syncBatchJson(syncedAt,diagnostics,pending)
            pending=mutableListOf(record)
        }else pending=candidate.toMutableList()
        require(syncBatchJson(syncedAt,diagnostics,pending).toString().toByteArray(Charsets.UTF_8).size<=maxBytes){"Одна Health Connect запись превышает лимит пакета"}
    }
    if(pending.isNotEmpty())payloads+=syncBatchJson(syncedAt,diagnostics,pending)
    return payloads
}
