package com.voltfitness.healthbridge.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Show validation field names/codes, never the rejected health values. */
fun apiFailureMessage(status: Int, response: JsonObject): String {
    val error = (response["error"] as? JsonPrimitive)?.content ?: "Ошибка запроса"
    val fields = (response["issues"] as? JsonArray).orEmpty().take(3).mapNotNull { issue ->
        val objectValue = issue as? JsonObject ?: return@mapNotNull null
        val path = (objectValue["path"] as? JsonPrimitive)?.content ?: return@mapNotNull null
        val code = (objectValue["code"] as? JsonPrimitive)?.content ?: return@mapNotNull null
        "$path ($code)"
    }
    return "VOLT API: HTTP $status. $error" +
        if (fields.isEmpty()) "" else "\nПоля: ${fields.joinToString()}"
}
