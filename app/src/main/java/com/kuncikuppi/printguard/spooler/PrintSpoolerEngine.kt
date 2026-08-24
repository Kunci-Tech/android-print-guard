package com.kuncikuppi.printguard.spooler

import android.content.Context
import android.util.Log
import com.kuncikuppi.printguard.network.EpsonTcpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PrintSpoolerEngine(private val context: Context) {

    companion object {
        private const val TAG = "PrintSpoolerEngine"
        private const val QUEUE_DIR = "spooler_queue"
        private const val FLUSH_INTERVAL_MS = 10000L // Retry flush every 10s
    }

    private val epsonClient = EpsonTcpClient()
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    private val queueDir: File = File(context.filesDir, QUEUE_DIR).apply {
        if (!exists()) {
            mkdirs()
        }
    }

    private val _spooledCountState = MutableStateFlow(0)
    val spooledCountState: StateFlow<Int> = _spooledCountState.asStateFlow()

    private var flushJob: Job? = null

    init {
        updateQueueCount()
    }

    fun start(epsonIp: String, epsonPort: Int) {
        flushJob?.cancel()
        flushJob = scope.launch {
            while (isActive) {
                delay(FLUSH_INTERVAL_MS)
                flushPendingQueue(epsonIp, epsonPort)
            }
        }
    }

    fun stop() {
        flushJob?.cancel()
    }

    suspend fun enqueueFailedPrint(
        clientAddress: String,
        payloadBytes: ByteArray
    ): File? = withContext(Dispatchers.IO) {
        if (payloadBytes.isEmpty()) return@withContext null

        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())
        val spoolFile = File(queueDir, "spool_$timeStamp.raw")

        try {
            FileOutputStream(spoolFile).use { fos ->
                fos.write(payloadBytes)
                fos.flush()
            }
            updateQueueCount()
            Log.w(TAG, "Offline Spooler: Print payload queued safely (${payloadBytes.size} bytes from $clientAddress)")
            spoolFile
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enqueue print payload: ${e.message}", e)
            null
        }
    }

    suspend fun flushPendingQueue(epsonIp: String, epsonPort: Int): Int = withContext(Dispatchers.IO) {
        val queuedFiles = queueDir.listFiles { _, name -> name.startsWith("spool_") && name.endsWith(".raw") }
            ?.sortedBy { it.lastModified() } ?: return@withContext 0

        if (queuedFiles.isEmpty()) {
            updateQueueCount()
            return@withContext 0
        }

        // Test printer connectivity before attempting queue flush
        val testRes = epsonClient.testConnection(epsonIp, epsonPort, timeoutMs = 3000)
        if (testRes.isFailure || !testRes.getOrDefault(false)) {
            Log.d(TAG, "Spooler flush skipped: Epson printer $epsonIp:$epsonPort is offline")
            return@withContext 0
        }

        Log.i(TAG, "Epson printer is online. Flushing ${queuedFiles.size} queued receipt(s)...")
        var flushedCount = 0

        for (file in queuedFiles) {
            try {
                val bytes = file.readBytes()
                val printRes = epsonClient.sendRawBytes(epsonIp, epsonPort, bytes)
                if (printRes.isSuccess && printRes.getOrDefault(false)) {
                    file.delete()
                    flushedCount++
                    Log.i(TAG, "Successfully flushed queued receipt ${file.name} to Epson")
                } else {
                    Log.w(TAG, "Epson printer rejected queued receipt ${file.name}. Halting flush loop.")
                    break
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error flushing spool file ${file.name}: ${e.message}")
                break
            }
        }

        updateQueueCount()
        flushedCount
    }

    private fun updateQueueCount() {
        val count = queueDir.listFiles { _, name -> name.startsWith("spool_") && name.endsWith(".raw") }?.size ?: 0
        _spooledCountState.value = count
    }
}
