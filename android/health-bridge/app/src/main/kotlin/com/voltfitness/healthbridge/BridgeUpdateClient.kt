package com.voltfitness.healthbridge

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.PackageInfo
import com.voltfitness.healthbridge.core.AppRelease
import com.voltfitness.healthbridge.core.apiFailureMessage
import com.voltfitness.healthbridge.core.copyVerifiedUpdate
import com.voltfitness.healthbridge.core.parseAppRelease
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection
import kotlin.coroutines.coroutineContext

class BridgeUpdateClient(private val context:Context,private val baseUrl:String) {
    init{require(URI(baseUrl).scheme=="https"){"Обновления требуют HTTPS"}}

    suspend fun latest(token:String):AppRelease=withContext(Dispatchers.IO) {
        val connection=connection("/api/health-connect/release",token)
        try {
            val status=connection.responseCode
            val input=if(status in 200..299)connection.inputStream else connection.errorStream
            val output=ByteArrayOutputStream()
            input?.use {
                val buffer=ByteArray(1024)
                while(true){val read=it.read(buffer);if(read<0)break;require(output.size()+read<=8192){"Описание обновления слишком большое"};output.write(buffer,0,read)}
            }
            val json=runCatching{Json.parseToJsonElement(output.toString("UTF-8")).jsonObject}.getOrDefault(JsonObject(emptyMap()))
            if(status !in 200..299)error(apiFailureMessage(status,json))
            parseAppRelease(json)
        }finally{connection.disconnect()}
    }

    suspend fun download(token:String,release:AppRelease,onProgress:(Int)->Unit):File=withContext(Dispatchers.IO) {
        require(release.isNewerThan(BuildConfig.VERSION_CODE.toLong())){"Установлена актуальная версия"}
        val directory=File(context.cacheDir,"updates").apply{mkdirs()}
        val part=File(directory,"update.part")
        val target=File(directory,"health-bridge-${release.versionCode}.apk")
        val connection=connection("/api/health-connect/apk",token)
        try {
            val status=connection.responseCode
            require(status==200){"Не удалось скачать обновление: HTTP $status"}
            connection.inputStream.use{input->
                val operationContext=coroutineContext
                copyVerifiedUpdate(input,part,release){percent->operationContext.ensureActive();onProgress(percent)}
            }
            verifyArchive(part,release)
            target.delete()
            require(part.renameTo(target)){"Не удалось сохранить обновление"}
            target
        }finally{part.delete();connection.disconnect()}
    }

    fun verifyArchive(file:File,release:AppRelease) {
        @Suppress("DEPRECATION")
        val archive=context.packageManager.getPackageArchiveInfo(file.path,PackageManager.GET_SIGNING_CERTIFICATES)?:error("Файл не является APK")
        @Suppress("DEPRECATION")
        val installed=context.packageManager.getPackageInfo(context.packageName,PackageManager.GET_SIGNING_CERTIFICATES)
        require(archive.packageName==context.packageName&&archive.longVersionCode==release.versionCode){"APK не соответствует версии VOLT Health Bridge"}
        val expected=signers(installed)
        require(expected.isNotEmpty()&&signers(archive)==expected){"Подпись обновления отличается от установленного приложения"}
    }

    private fun signers(info:PackageInfo):Set<String> = info.signingInfo?.apkContentsSigners.orEmpty().map { signature ->
        MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString(""){"%02x".format(it)}
    }.toSet()

    private fun connection(path:String,token:String)=(URL(baseUrl.trimEnd('/')+path).openConnection() as HttpsURLConnection).apply {
        instanceFollowRedirects=false;requestMethod="GET";connectTimeout=15_000;readTimeout=30_000
        setRequestProperty("authorization","Bearer $token")
    }
}
