package com.voltfitness.healthbridge.core

/** Permission/status refreshes must not hide an operation's result. */
class OperationFeedback(restoredResult: String? = null) {
    var busy: Boolean = false
        private set
    var result: String? = restoredResult
        private set
    private var progress: String? = null

    fun begin(message: String): Boolean {
        if (busy) return false
        busy = true
        progress = message
        result = null
        return true
    }

    fun updateProgress(message: String) {
        if (busy) progress = message
    }

    fun finish(message: String) {
        result = message
        progress = null
        busy = false
    }

    fun text(statusSummary: String): String =
        listOfNotNull(if (busy) progress else result, statusSummary).joinToString("\n\n")
}
