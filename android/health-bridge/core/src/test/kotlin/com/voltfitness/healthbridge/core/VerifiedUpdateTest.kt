package com.voltfitness.healthbridge.core

import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith

class VerifiedUpdateTest {
    private val bytes="signed APK fixture".toByteArray()
    private val sha=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private val release=AppRelease(3,"0.1.2",bytes.size.toLong(),sha)

    @Test fun validUpdateIsKeptAndReportsCompletion() {
        val dir=Files.createTempDirectory("volt-update-test").toFile()
        try {
            val target=dir.resolve("update.part");val progress=mutableListOf<Int>()
            copyVerifiedUpdate(ByteArrayInputStream(bytes),target,release){progress+=it}
            assertContentEquals(bytes,target.readBytes());assertEquals(100,progress.last())
        }finally{dir.deleteRecursively()}
    }

    @Test fun corruptTruncatedAndOversizedUpdatesAreDeletedBeforeInstallation() {
        val dir=Files.createTempDirectory("volt-update-test").toFile()
        try {
            for(payload in listOf(bytes.copyOf(bytes.size-1),bytes+byteArrayOf(1),ByteArray(bytes.size){7})) {
                val target=dir.resolve("update.part")
                assertFailsWith<IllegalArgumentException>{copyVerifiedUpdate(ByteArrayInputStream(payload),target,release)}
                assertFalse(target.exists())
            }
        }finally{dir.deleteRecursively()}
    }
}
