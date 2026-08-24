package com.kuncikuppi.printguard.data

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import com.kuncikuppi.printguard.domain.model.AuditEvent
import com.kuncikuppi.printguard.domain.repository.AuditRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class DiskAuditRepository(context: Context) : AuditRepository {

    companion object {
        private const val TAG = "DiskAuditRepository"
        private const val AUDIT_FILE_NAME = "audit_events.json"
        private const val MAX_AUDIT_LOGS = 500
    }

    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()
    private val auditFile = File(context.filesDir, AUDIT_FILE_NAME)
    private val _eventsState = MutableStateFlow<List<AuditEvent>>(emptyList())

    init {
        loadEventsFromDisk()
    }

    override fun getAllAuditEvents(): Flow<List<AuditEvent>> = _eventsState.asStateFlow()

    override fun getAuditLogFile(): File = auditFile

    override suspend fun logEvent(
        eventType: String,
        details: String,
        pinAuthorized: Boolean
    ) {
        withContext(Dispatchers.IO) {
            val now = Date()
            val timestampIso = getIsoTimestamp(now)
            val eventId = "audit_${System.currentTimeMillis()}"

            val newEvent = AuditEvent(
                id = eventId,
                timestamp = timestampIso,
                eventType = eventType,
                details = details,
                pinAuthorized = pinAuthorized
            )

            val currentList = _eventsState.value.toMutableList()
            currentList.add(0, newEvent)

            val boundedList = if (currentList.size > MAX_AUDIT_LOGS) {
                currentList.take(MAX_AUDIT_LOGS)
            } else {
                currentList
            }

            try {
                FileOutputStream(auditFile).use { fos ->
                    fos.write(gson.toJson(boundedList).toByteArray(Charsets.UTF_8))
                    fos.flush()
                }
                _eventsState.value = boundedList
                Log.i(TAG, "Audit Log recorded: $eventType ($details)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to write audit event: ${e.message}", e)
            }
        }
    }

    private fun loadEventsFromDisk() {
        if (!auditFile.exists()) {
            _eventsState.value = emptyList()
            return
        }

        try {
            val content = auditFile.readText(Charsets.UTF_8)
            val type = object : TypeToken<List<AuditEvent>>() {}.type
            val list: List<AuditEvent>? = gson.fromJson(content, type)
            _eventsState.value = list?.sortedByDescending { it.timestamp } ?: emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing audit log file", e)
            _eventsState.value = emptyList()
        }
    }

    private fun getIsoTimestamp(date: Date): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
        sdf.timeZone = TimeZone.getDefault()
        return sdf.format(date)
    }
}
