package com.voltfitness.healthbridge.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OperationFeedbackTest {
    @Test fun failedSyncRemainsVisibleAfterPermissionRefreshAndReopening() {
        val feedback = OperationFeedback()
        feedback.begin("Читаем Health Connect…")
        feedback.finish("Ошибка синхронизации: VOLT API: HTTP 400")
        val refreshed = feedback.text("Последняя успешная синхронизация: ещё не выполнялась")
        assertTrue(refreshed.contains("HTTP 400"))
        assertTrue(refreshed.contains("ещё не выполнялась"))
        assertTrue(OperationFeedback(feedback.result).text("Полная история: разрешена").contains("HTTP 400"))
    }

    @Test fun successfulSyncKeepsItsCountsWhenStatusChanges() {
        val feedback = OperationFeedback()
        feedback.begin("Отправляем…")
        feedback.finish("Синхронизация завершена\nНовых: 50, обновлено: 0")
        assertTrue(feedback.text("Полная история: разрешена").contains("Новых: 50"))
        assertFalse(feedback.busy)
    }

    @Test fun statusRefreshKeepsProgressAndCannotStartAnotherOperation() {
        val feedback = OperationFeedback()
        assertTrue(feedback.begin("Читаем…"))
        feedback.updateProgress("Отправка пакета 2 из 10")
        assertFalse(feedback.begin("Повторная отправка"))
        assertTrue(feedback.text("Устройство привязано").contains("пакета 2 из 10"))
        feedback.finish("Ошибка сети; уже принято 50 записей")
        assertTrue(feedback.begin("Повторяем…"))
        assertFalse(feedback.text("Устройство привязано").contains("Ошибка сети"))
    }
}
