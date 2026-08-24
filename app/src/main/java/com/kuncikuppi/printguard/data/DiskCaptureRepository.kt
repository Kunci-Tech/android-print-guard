package com.kuncikuppi.printguard.data

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.kuncikuppi.printguard.domain.model.PrintJobCapture
import com.kuncikuppi.printguard.domain.repository.CaptureRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class DiskCaptureRepository(private val context: Context) : CaptureRepository {

    companion object {
        private const val TAG = "DiskCaptureRepository"
        private const val CAPTURES_DIR = "captures"
        private const val EXPORTS_DIR = "exports"
        private const val MAX_JOBS = 100
        private const val MAX_BYTES_LIMIT = 25 * 1024 * 1024L // 25 MB
    }

    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()
    private val captureDir: File = File(context.filesDir, CAPTURES_DIR).apply {
        if (!exists()) {
            mkdirs()
        }
    }

    private val exportDir: File = File(context.cacheDir, EXPORTS_DIR).apply {
        if (!exists()) {
            mkdirs()
        }
    }

    private val _capturesState = MutableStateFlow<List<PrintJobCapture>>(emptyList())

    init {
        loadCapturesFromDisk()
    }

    override fun getAllCaptures(): Flow<List<PrintJobCapture>> {
        loadCapturesFromDisk()
        return _capturesState.asStateFlow()
    }

    override fun refreshFromDisk() {
        loadCapturesFromDisk()
    }

    override suspend fun getLatestCapture(): PrintJobCapture? = withContext(Dispatchers.IO) {
        _capturesState.value.firstOrNull()
    }

    override suspend fun getTodayCaptureCount(): Int = withContext(Dispatchers.IO) {
        val todayStr = SimpleDateFormat("yyyyMMdd", Locale.US).format(Date())
        _capturesState.value.count { capture ->
            capture.id.startsWith("job_$todayStr")
        }
    }

    override suspend fun saveCapture(
        sourceAddress: String,
        printerIp: String,
        printerPort: Int,
        payloadBytes: ByteArray
    ): PrintJobCapture = withContext(Dispatchers.IO) {
        val now = Date()
        val timestampIso = getIsoTimestamp(now)
        val fileStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(now)
        val jobId = "job_${fileStamp}_${System.currentTimeMillis() % 10000}"

        val rawFileName = "receipt_$fileStamp.raw"
        val rawFile = File(captureDir, rawFileName)
        val jsonFile = File(captureDir, "receipt_$fileStamp.json")

        // 1. Write RAW byte payload
        FileOutputStream(rawFile).use { fos ->
            fos.write(payloadBytes)
            fos.flush()
        }

        // 2. Compute SHA-256
        val sha256 = computeSha256(payloadBytes)

        // 3. Create metadata model
        val captureModel = PrintJobCapture(
            id = jobId,
            capturedAt = timestampIso,
            sourceAddress = sourceAddress,
            printerIp = printerIp,
            printerPort = printerPort,
            byteCount = payloadBytes.size.toLong(),
            sha256 = sha256,
            rawFilename = rawFileName
        )

        // 4. Write JSON metadata
        FileOutputStream(jsonFile).use { fos ->
            fos.write(gson.toJson(captureModel).toByteArray(Charsets.UTF_8))
            fos.flush()
        }

        Log.d(TAG, "Capture stored: $rawFileName (${payloadBytes.size} bytes, SHA256: ${sha256.take(12)}...)")

        // 5. Enforce bounded storage (Max 100 jobs or 25 MB)
        enforceStorageLimits()

        // 6. Reload updated capture list
        loadCapturesFromDisk()

        captureModel
    }

    override suspend fun getAsciiPreview(jobId: String): String = withContext(Dispatchers.IO) {
        val rawFile = getRawFileForJob(jobId) ?: return@withContext "No capture raw file found for $jobId."
        if (!rawFile.exists()) return@withContext "File does not exist."

        val bytes = rawFile.readBytes()
        val sb = StringBuilder()

        for (b in bytes) {
            val unsigned = b.toInt() and 0xFF
            when (unsigned) {
                0x0A -> { // Linefeed \n
                    sb.append('\n')
                }
                0x0D -> { /* Carriage return - ignore */ }
                0x09 -> { // Tab \t
                    sb.append("    ")
                }
                in 0x20..0x7E -> { // Printable ASCII
                    sb.append(unsigned.toChar())
                }
                else -> {
                    // Filter non-printable bytes
                }
            }
        }

        val result = sb.toString().trim()
        if (result.isEmpty()) {
            "[RAW Payload contains no readable ASCII text (likely raster graphic ESC/POS data)]"
        } else {
            result
        }
    }

    override suspend fun getHexPreview(jobId: String): String = withContext(Dispatchers.IO) {
        val rawFile = getRawFileForJob(jobId) ?: return@withContext "No capture file found."
        if (!rawFile.exists()) return@withContext "File does not exist."

        val bytes = rawFile.readBytes()
        val sb = StringBuilder()
        val chunkSize = 16

        for (i in bytes.indices step chunkSize) {
            val offsetStr = String.format(Locale.US, "%04X: ", i)
            sb.append(offsetStr)

            val slice = bytes.sliceArray(i until minOf(i + chunkSize, bytes.size))
            for (b in slice) {
                sb.append(String.format(Locale.US, "%02X ", b.toInt() and 0xFF))
            }

            if (slice.size < chunkSize) {
                for (k in 0 until (chunkSize - slice.size)) {
                    sb.append("   ")
                }
            }

            sb.append(" | ")
            for (b in slice) {
                val unsigned = b.toInt() and 0xFF
                if (unsigned in 0x20..0x7E) {
                    sb.append(unsigned.toChar())
                } else {
                    sb.append('.')
                }
            }
            sb.append('\n')
        }

        sb.toString()
    }

    override fun getShareableUri(jobId: String): Uri? {
        val rawFile = getRawFileForJob(jobId) ?: return null
        if (!rawFile.exists()) return null

        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            rawFile
        )
    }

    override suspend fun exportAllCapturesZip(): Uri? = withContext(Dispatchers.IO) {
        val allFiles = captureDir.listFiles()?.toMutableList() ?: mutableListOf()
        val auditFile = File(context.filesDir, "audit_events.json")
        if (auditFile.exists()) {
            allFiles.add(auditFile)
        }

        if (allFiles.isEmpty()) return@withContext null

        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val zipFileName = "kunci_print_guard_captures_$timeStamp.zip"
        val zipFile = File(exportDir, zipFileName)

        try {
            ZipOutputStream(BufferedOutputStream(FileOutputStream(zipFile))).use { zos ->
                val buffer = ByteArray(8192)
                for (file in allFiles) {
                    if (file.isFile) {
                        val entry = ZipEntry(file.name)
                        entry.time = file.lastModified()
                        zos.putNextEntry(entry)

                        BufferedInputStream(FileInputStream(file)).use { bis ->
                            var count: Int
                            while (bis.read(buffer).also { count = it } != -1) {
                                zos.write(buffer, 0, count)
                            }
                        }
                        zos.closeEntry()
                    }
                }
            }

            Log.i(TAG, "All captures and audit logs zipped into ${zipFile.name} (${zipFile.length()} bytes)")

            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                zipFile
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create bulk captures ZIP export: ${e.message}", e)
            null
        }
    }

    private fun getRawFileForJob(jobId: String): File? {
        val capture = _capturesState.value.find { it.id == jobId } ?: return null
        return File(captureDir, capture.rawFilename)
    }

    private fun loadCapturesFromDisk() {
        val jsonFiles = captureDir.listFiles { _, name -> name.endsWith(".json") } ?: emptyArray()
        val list = mutableListOf<PrintJobCapture>()

        for (file in jsonFiles) {
            try {
                val content = file.readText(Charsets.UTF_8)
                val model = gson.fromJson(content, PrintJobCapture::class.java)
                if (model != null) {
                    list.add(model)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing capture metadata file ${file.name}", e)
            }
        }

        list.sortByDescending { it.capturedAt }
        _capturesState.value = list
    }

    private fun enforceStorageLimits() {
        val jsonFiles = captureDir.listFiles { _, name -> name.endsWith(".json") } ?: return
        val rawFiles = captureDir.listFiles { _, name -> name.endsWith(".raw") } ?: return

        var totalSizeBytes = (jsonFiles.sumOf { it.length() }) + (rawFiles.sumOf { it.length() })
        var totalJobs = jsonFiles.size

        if (totalJobs <= MAX_JOBS && totalSizeBytes <= MAX_BYTES_LIMIT) {
            return
        }

        Log.w(TAG, "Storage limits exceeded ($totalJobs jobs, $totalSizeBytes bytes). Purging oldest captures...")

        val sortedJson = jsonFiles.sortedBy { it.lastModified() }

        for (jsonFile in sortedJson) {
            if (totalJobs <= MAX_JOBS && totalSizeBytes <= MAX_BYTES_LIMIT) {
                break
            }

            try {
                val rawFileName = jsonFile.name.replace(".json", ".raw")
                val rawFile = File(captureDir, rawFileName)

                val freedBytes = jsonFile.length() + (if (rawFile.exists()) rawFile.length() else 0L)

                jsonFile.delete()
                if (rawFile.exists()) {
                    rawFile.delete()
                }

                totalSizeBytes -= freedBytes
                totalJobs -= 1
                Log.i(TAG, "Deleted old capture ${jsonFile.name} (freed $freedBytes bytes)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to delete old capture ${jsonFile.name}", e)
            }
        }
    }

    private fun computeSha256(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data)
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun getIsoTimestamp(date: Date): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
        sdf.timeZone = TimeZone.getDefault()
        return sdf.format(date)
    }
}
