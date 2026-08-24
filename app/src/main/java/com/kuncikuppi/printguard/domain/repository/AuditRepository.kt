package com.kuncikuppi.printguard.domain.repository

import com.kuncikuppi.printguard.domain.model.AuditEvent
import kotlinx.coroutines.flow.Flow
import java.io.File

/**
 * Repository interface for managing security audit event logs.
 */
interface AuditRepository {

    /**
     * Records a new audit event.
     */
    suspend fun logEvent(eventType: String, details: String, pinAuthorized: Boolean = false)

    /**
     * Returns a flow of all recorded audit events, sorted descending by timestamp.
     */
    fun getAllAuditEvents(): Flow<List<AuditEvent>>

    /**
     * Returns the audit log file for ZIP export bundling.
     */
    fun getAuditLogFile(): File
}
