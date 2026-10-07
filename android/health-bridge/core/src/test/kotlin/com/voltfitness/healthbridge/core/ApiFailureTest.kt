package com.voltfitness.healthbridge.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ApiFailureTest {
    @Test fun validationFailureShowsTheRejectedFieldWithoutItsHealthValue() {
        val response = Json.parseToJsonElement("""{"error":"Некорректный формат Health Connect","issues":[{"path":"records.3.metrics.rmssdMillis","code":"too_big","input":999.123}]}""").jsonObject
        val message = apiFailureMessage(422, response)
        assertTrue(message.contains("HTTP 422"))
        assertTrue(message.contains("records.3.metrics.rmssdMillis (too_big)"))
        assertFalse(message.contains("999.123"))
    }

    @Test fun nonJsonOrAuthenticationFailureStillIdentifiesHttpStatus() {
        assertTrue(apiFailureMessage(502, Json.parseToJsonElement("{}").jsonObject).contains("HTTP 502"))
        val response = Json.parseToJsonElement("""{"error":"Устройство Health Bridge не авторизовано"}""").jsonObject
        assertTrue(apiFailureMessage(401, response).contains("не авторизовано"))
    }
}
