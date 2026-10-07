package com.voltfitness.healthbridge.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.time.Instant

class ModelsTest {
    private val start=Instant.parse("2026-08-09T07:00:00Z")
    private val end=Instant.parse("2026-08-09T08:00:00Z")

    @Test fun permissionStateReportsUnavailableAndMissingPermissions(){
        val state=PermissionSnapshot(false,setOf(PermissionKey.EXERCISE),false,false)
        assertFalse(state.available)
        assertTrue(PermissionKey.HEART_RATE in state.missing)
    }

    @Test fun dataOriginPreservesGarminAndOtherPackages(){
        assertTrue(SourceOrigin("com.garmin.android.apps.connectmobile","Connect").isGarmin)
        assertFalse(SourceOrigin("com.example.health","Example").isGarmin)
    }

    @Test fun stableIdUsesMetadataAndHasDeterministicFallback(){
        assertEquals("record-42",stableExternalId("record-42","garmin",RecordType.EXERCISE,start,end,"bike"))
        assertEquals(stableExternalId(null,"garmin",RecordType.EXERCISE,start,end,"bike"),stableExternalId(null,"garmin",RecordType.EXERCISE,start,end,"bike"))
    }

    @Test fun exerciseWithoutDistanceStaysNull(){
        val metrics=ExerciseMetrics("biking",null,3600,null,400.0,132,158)
        assertNull(metrics.distanceMeters)
        val record=NormalizedRecord(SourceOrigin("garmin","Garmin"),"1",RecordType.EXERCISE,start,end,null,metrics)
        assertTrue(record.toJson().toString().contains("\"distanceMeters\":null"))
    }

    @Test fun sleepWithoutStagesSerializesEmptyArray(){
        val record=NormalizedRecord(SourceOrigin("garmin","Garmin"),"sleep",RecordType.SLEEP,start,end,null,SleepMetrics(3600,null,emptyList()))
        assertTrue(record.toJson().toString().contains("\"stages\":[]"))
    }

    @Test fun identicalRecordProducesIdenticalBatchPayload(){
        val record=NormalizedRecord(SourceOrigin("garmin","Garmin"),"same",RecordType.STEPS,start,end,null,StepsMetrics(1000))
        val diagnostics=SyncDiagnostics(true,setOf(PermissionKey.STEPS),true,false,setOf(RecordType.STEPS),setOf(record.origin))
        assertEquals(syncBatchJson(end,diagnostics,listOf(record)),syncBatchJson(end,diagnostics,listOf(record)))
    }

    @Test fun syncBatchesRespectRecordAndByteLimits(){
        val origin=SourceOrigin("com.garmin.android.apps.connectmobile","Garmin Connect")
        val diagnostics=SyncDiagnostics(true,setOf(PermissionKey.STEPS),true,false,setOf(RecordType.STEPS),setOf(origin))
        val records=(1..3).map{NormalizedRecord(origin,"record-$it",RecordType.STEPS,start,end,null,StepsMetrics(it.toLong()))}
        val batches=syncBatchPayloads(end,diagnostics,records,maxRecords=2,maxBytes=10_000)
        assertEquals(2,batches.size)
        assertTrue(batches.all{it.toString().toByteArray().size<=10_000})
    }
}
