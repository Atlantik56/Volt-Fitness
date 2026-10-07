package com.voltfitness.healthbridge.core

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class AppRelease(val versionCode:Long,val version:String,val bytes:Long,val sha256:String) {
    fun isNewerThan(installedCode:Long)=versionCode>installedCode
}

fun parseAppRelease(json:JsonObject):AppRelease {
    fun value(name:String)=(json[name] as? JsonPrimitive)?.content?:error("В описании обновления отсутствует $name")
    require(value("applicationId")=="com.voltfitness.healthbridge"){"Обновление для другого приложения"}
    require(value("downloadPath")=="/api/health-connect/apk"){"Недопустимый адрес обновления"}
    val code=value("versionCode").toLong()
    val bytes=value("bytes").toLong()
    val version=value("version")
    val sha=value("sha256")
    require(code>0&&bytes in 1..64L*1024*1024){"Некорректный размер или версия обновления"}
    require(version.length in 1..40&&sha.matches(Regex("[a-f0-9]{64}"))){"Некорректная контрольная сумма обновления"}
    return AppRelease(code,version,bytes,sha)
}
