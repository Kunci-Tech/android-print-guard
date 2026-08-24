package com.kuncikuppi.printguard.domain.model

import com.google.gson.annotations.SerializedName

/**
 * Audit log entry for tracking security & service lifecycle events.
 */
data class AuditEvent(
    @SerializedName("id")
    val id: String,

    @SerializedName("timestamp")
    val timestamp: String,

    @SerializedName("event_type")
    val eventType: String, // SERVICE_STARTED, SERVICE_STOPPED, PIN_SUCCESS, PIN_FAILED, AUTOSTART_CHANGED, CONFIG_SAVED

    @SerializedName("details")
    val details: String,

    @SerializedName("pin_authorized")
    val pinAuthorized: Boolean
)
