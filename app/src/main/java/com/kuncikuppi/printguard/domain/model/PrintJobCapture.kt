package com.kuncikuppi.printguard.domain.model

import com.google.gson.annotations.SerializedName

/**
 * Metadata record for a single intercepted print job capture.
 */
data class PrintJobCapture(
    @SerializedName("id")
    val id: String,

    @SerializedName("captured_at")
    val capturedAt: String,

    @SerializedName("source_address")
    val sourceAddress: String,

    @SerializedName("printer_ip")
    val printerIp: String,

    @SerializedName("printer_port")
    val printerPort: Int,

    @SerializedName("bytes")
    val byteCount: Long,

    @SerializedName("sha256")
    val sha256: String,

    @SerializedName("raw_filename")
    val rawFilename: String
)
