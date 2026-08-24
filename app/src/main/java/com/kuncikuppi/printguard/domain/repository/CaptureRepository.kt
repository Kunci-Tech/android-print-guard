package com.kuncikuppi.printguard.domain.repository

import android.net.Uri
import com.kuncikuppi.printguard.domain.model.PrintJobCapture
import kotlinx.coroutines.flow.Flow

/**
 * Abstraction for saving, querying, and managing receipt captures and raw binary payloads.
 */
interface CaptureRepository {

    /**
     * Saves a print job capture (metadata JSON + raw binary payload) and enforces bounded disk storage.
     */
    suspend fun saveCapture(
        sourceAddress: String,
        printerIp: String,
        printerPort: Int,
        payloadBytes: ByteArray
    ): PrintJobCapture

    /**
     * Retrieves a flow of all recorded capture metadata, sorted descending by capture timestamp.
     */
    fun getAllCaptures(): Flow<List<PrintJobCapture>>

    /**
     * Forces reloading capture files from disk to refresh UI state.
     */
    fun refreshFromDisk()

    /**
     * Retrieves the most recently captured print job.
     */
    suspend fun getLatestCapture(): PrintJobCapture?

    /**
     * Returns total job count captured today (local calendar date).
     */
    suspend fun getTodayCaptureCount(): Int

    /**
     * Generates a printable ASCII preview string from the raw capture payload without modifying the original bytes.
     */
    suspend fun getAsciiPreview(jobId: String): String

    /**
     * Generates a formatted Hex dump representation of the raw payload.
     */
    suspend fun getHexPreview(jobId: String): String

    /**
     * Returns a shareable content Uri for exporting a single .raw file via system share sheet.
     */
    fun getShareableUri(jobId: String): Uri?

    /**
     * Packages all captured .raw files and metadata .json files into a single ZIP archive for bulk export.
     */
    suspend fun exportAllCapturesZip(): Uri?
}
