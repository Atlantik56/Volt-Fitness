package com.voltfitness.healthbridge

import com.voltfitness.healthbridge.core.NormalizedRecord
import com.voltfitness.healthbridge.core.SyncDiagnostics
import com.voltfitness.healthbridge.core.syncBatchPayloads
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.net.URL
import java.time.Instant
import javax.net.ssl.HttpsURLConnection

data class PairResult(val deviceToken:String,val deviceId:Long)
data class UploadResult(val created:Int,val updated:Int,val total:Int)

class BridgeApiClient(private val baseUrl:String){
    init{require(URI(baseUrl).scheme=="https"){"VOLT backend must use HTTPS"}}
    suspend fun pair(pairingToken:String,deviceName:String):PairResult=withContext(Dispatchers.IO){
        val body=buildJsonObject{put("pairingToken",JsonPrimitive(pairingToken));put("deviceName",JsonPrimitive(deviceName))}.toString()
        val json=request("/api/health-connect/pair",body,null)
        PairResult(json["deviceToken"]?.jsonPrimitive?.content?:error("Сервер не вернул device token"),json["deviceId"]?.jsonPrimitive?.content?.toLongOrNull()?:error("Сервер не вернул device id"))
    }
    suspend fun upload(deviceToken:String,diagnostics:SyncDiagnostics,records:List<NormalizedRecord>):UploadResult=withContext(Dispatchers.IO){
        var created=0;var updated=0;var total=0
        val payloads=syncBatchPayloads(Instant.now(),diagnostics,records)
        for(payload in payloads){
            val json=request("/api/health-connect/sync",payload.toString(),deviceToken)
            created+=json["created"]?.jsonPrimitive?.content?.toIntOrNull()?:0;updated+=json["updated"]?.jsonPrimitive?.content?.toIntOrNull()?:0;total+=json["total"]?.jsonPrimitive?.content?.toIntOrNull()?:0
        }
        UploadResult(created,updated,total)
    }
    private fun request(path:String,body:String,bearer:String?):kotlinx.serialization.json.JsonObject{
        require(body.toByteArray().size<=256_000){"Пакет синхронизации слишком большой"}
        val connection=(URL(baseUrl.trimEnd('/')+path).openConnection() as HttpsURLConnection).apply{
            instanceFollowRedirects=false;requestMethod="POST";connectTimeout=15_000;readTimeout=30_000;doOutput=true;setRequestProperty("content-type","application/json");setRequestProperty("accept","application/json");if(bearer!=null)setRequestProperty("authorization","Bearer $bearer")
        }
        try {
            connection.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))}
            val code=connection.responseCode
            val input=if(code in 200..299)connection.inputStream else connection.errorStream
            val response=input?.bufferedReader()?.use{it.readText().take(64_000)}?:"{}"
            val parsed=runCatching{Json.parseToJsonElement(response).jsonObject}.getOrDefault(buildJsonObject{})
            if(code !in 200..299)throw IllegalStateException(parsed["error"]?.jsonPrimitive?.content?:"VOLT API: HTTP $code")
            return parsed
        } finally { connection.disconnect() }
    }
}
