package com.voltfitness.healthbridge.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith

class AppReleaseTest {
    private fun metadata(code:Int=3,path:String="/api/health-connect/apk",bytes:Long=12_000_000)=Json.parseToJsonElement("""{"applicationId":"com.voltfitness.healthbridge","downloadPath":"$path","versionCode":$code,"version":"0.1.2","bytes":$bytes,"sha256":"${"a".repeat(64)}"}""").jsonObject
    @Test fun onlyHigherVersionCodesOfferAnUpdate() {
        assertTrue(parseAppRelease(metadata()).isNewerThan(2))
        assertFalse(parseAppRelease(metadata()).isNewerThan(3))
        assertFalse(parseAppRelease(metadata()).isNewerThan(4))
    }
    @Test fun metadataCannotRedirectDeviceCredentialsOrRequestUnboundedDownloads() {
        assertFailsWith<IllegalArgumentException>{parseAppRelease(metadata(path="https://other.example/app.apk"))}
        assertFailsWith<IllegalArgumentException>{parseAppRelease(metadata(bytes=65L*1024*1024))}
        assertFailsWith<IllegalArgumentException>{parseAppRelease(metadata(bytes=-1))}
    }
}
