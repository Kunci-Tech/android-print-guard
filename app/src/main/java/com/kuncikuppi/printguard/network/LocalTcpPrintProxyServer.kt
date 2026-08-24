package com.kuncikuppi.printguard.network

import android.util.Log
import com.kuncikuppi.printguard.domain.repository.CaptureRepository
import com.kuncikuppi.printguard.spooler.PrintSpoolerEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class ProxyServerStatus(
    val isRunning: Boolean = false,
    val localPort: Int = 9100,
    val targetEpsonIp: String = "192.168.8.225",
    val targetEpsonPort: Int = 9100,
    val lastPrintTimestamp: String? = null,
    val lastPrintBytes: Long = 0,
    val lastError: String? = null
)

class LocalTcpPrintProxyServer(
    private val captureRepository: CaptureRepository,
    private val spoolerEngine: PrintSpoolerEngine? = null
) {
    companion object {
        private const val TAG = "LocalTcpPrintProxy"
        private const val SOCKET_TIMEOUT_MS = 10000
        private const val ACCEPT_TIMEOUT_MS = 3000
        private const val SERVER_BACKLOG = 100
    }

    private val epsonTcpClient = EpsonTcpClient()

    // BUG FIX #1: Use SupervisorJob() instead of Job().
    // With a plain Job(), any uncaught exception in a child coroutine (handlePrintSession)
    // propagates upward and KILLS the entire scope — including the accept loop.
    // SupervisorJob() isolates child failures so the accept loop always stays alive.
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null

    private val _statusState = MutableStateFlow(ProxyServerStatus())
    val statusState: StateFlow<ProxyServerStatus> = _statusState.asStateFlow()

    @Synchronized
    fun start(localPort: Int = 9100, epsonIp: String = "192.168.8.225", epsonPort: Int = 9100) {
        val currentStatus = _statusState.value
        if (currentStatus.isRunning &&
            currentStatus.localPort == localPort &&
            currentStatus.targetEpsonIp == epsonIp &&
            currentStatus.targetEpsonPort == epsonPort &&
            serverSocket?.isClosed == false
        ) {
            Log.d(TAG, "Proxy server is already running with matching configuration.")
            return
        }

        stop()

        serverJob = scope.launch {
            runProxyServer(localPort, epsonIp, epsonPort)
        }
    }

    @Synchronized
    fun stop() {
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing server socket: ${e.message}")
        }
        serverJob?.cancel()
        serverSocket = null

        _statusState.value = _statusState.value.copy(
            isRunning = false,
            lastError = null
        )
        Log.i(TAG, "Proxy stopped")
    }

    private suspend fun runProxyServer(localPort: Int, epsonIp: String, epsonPort: Int) =
        withContext(Dispatchers.IO) {
            try {
                val socket = ServerSocket(localPort, SERVER_BACKLOG, InetAddress.getByName("0.0.0.0"))
                socket.reuseAddress = true
                // 3s accept timeout prevents Huawei OS from freezing the thread in deep idle
                socket.soTimeout = ACCEPT_TIMEOUT_MS
                serverSocket = socket

                _statusState.value = _statusState.value.copy(
                    isRunning = true,
                    localPort = localPort,
                    targetEpsonIp = epsonIp,
                    targetEpsonPort = epsonPort,
                    lastError = null
                )

                Log.i(TAG, "Proxy started. Listening on 0.0.0.0:$localPort -> Forwarding to Epson $epsonIp:$epsonPort")

                while (isActive && !socket.isClosed) {
                    try {
                        val posSocket = socket.accept()
                        posSocket.tcpNoDelay = true
                        posSocket.keepAlive = true
                        posSocket.soTimeout = SOCKET_TIMEOUT_MS
                        posSocket.receiveBufferSize = 65536
                        posSocket.sendBufferSize = 65536

                        val clientAddress = posSocket.remoteSocketAddress.toString()
                        Log.i(TAG, "Incoming print connection from $clientAddress")

                        // Each session is launched under SupervisorJob scope —
                        // exceptions in handlePrintSession will NOT kill the accept loop
                        scope.launch(Dispatchers.IO) {
                            handlePrintSession(posSocket, clientAddress, epsonIp, epsonPort)
                        }
                    } catch (_: SocketTimeoutException) {
                        // Expected 3s accept timeout cycle - keeps thread active on Huawei
                    } catch (e: Exception) {
                        if (!socket.isClosed) {
                            Log.e(TAG, "Error accepting POS connection: ${e.message}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Fatal error running Proxy Server: ${e.message}", e)
                _statusState.value = _statusState.value.copy(
                    isRunning = false,
                    lastError = e.localizedMessage ?: "Failed to bind port $localPort"
                )
            }
        }

    private suspend fun handlePrintSession(
        posSocket: Socket,
        clientAddress: String,
        epsonIp: String,
        epsonPort: Int
    ) = withContext(Dispatchers.IO) {
        var epsonSocket: Socket? = null
        val captureBuffer = ByteArrayOutputStream()

        try {
            Log.d(TAG, "Connecting to Epson $epsonIp:$epsonPort...")
            epsonSocket = Socket()
            epsonSocket.tcpNoDelay = true
            epsonSocket.keepAlive = true
            epsonSocket.receiveBufferSize = 65536
            epsonSocket.sendBufferSize = 65536

            epsonSocket.connect(InetSocketAddress(epsonIp, epsonPort), SOCKET_TIMEOUT_MS)
            epsonSocket.soTimeout = SOCKET_TIMEOUT_MS
            Log.i(TAG, "Connected to Epson $epsonIp:$epsonPort")

            val posIn = posSocket.getInputStream()
            val posOut = posSocket.getOutputStream()
            val epsonIn = epsonSocket.getInputStream()
            val epsonOut = epsonSocket.getOutputStream()

            try {
                epsonTcpClient.forwardBidirectional(
                    posInput = posIn,
                    posOutput = posOut,
                    printerInput = epsonIn,
                    printerOutput = epsonOut,
                    onByteChunkCopied = { bytes, length ->
                        captureBuffer.write(bytes, 0, length)
                    }
                )
            } catch (e: Exception) {
                Log.d(TAG, "Forwarding loop finished: ${e.message}")
            }

            val capturedBytes = captureBuffer.toByteArray()
            val byteCount = capturedBytes.size.toLong()

            if (byteCount > 0) {
                Log.i(TAG, "Received $byteCount bytes and forwarded $byteCount bytes successfully")

                scope.launch(Dispatchers.IO) {
                    try {
                        val capture = captureRepository.saveCapture(
                            sourceAddress = clientAddress,
                            printerIp = epsonIp,
                            printerPort = epsonPort,
                            payloadBytes = capturedBytes
                        )
                        Log.i(TAG, "Capture stored: ${capture.rawFilename}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to save capture asynchronously: ${e.message}", e)
                    }
                }

                val timestampStr = SimpleDateFormat("HH:mm:ss (dd MMM)", Locale.getDefault()).format(Date())
                _statusState.value = _statusState.value.copy(
                    lastPrintTimestamp = timestampStr,
                    lastPrintBytes = byteCount,
                    lastError = null
                )
            }

            Log.i(TAG, "Connection completed successfully")

        } catch (e: Exception) {
            val bytesCapturedSoFar = captureBuffer.size()
            if (bytesCapturedSoFar == 0) {
                Log.w(TAG, "Epson unreachable. Attempting offline spooler capture...")
                try {
                    val posIn = posSocket.getInputStream()
                    val fallbackBuffer = ByteArrayOutputStream()
                    val buf = ByteArray(8192)
                    var read: Int
                    while (posIn.read(buf).also { read = it } != -1) {
                        if (read > 0) fallbackBuffer.write(buf, 0, read)
                    }
                    val posBytes = fallbackBuffer.toByteArray()
                    if (posBytes.isNotEmpty()) {
                        spoolerEngine?.enqueueFailedPrint(clientAddress, posBytes)
                        captureRepository.saveCapture(clientAddress, epsonIp, epsonPort, posBytes)
                        Log.i(TAG, "Offline spooler saved ${posBytes.size} bytes for background auto-flush")
                    }
                } catch (spoolEx: Exception) {
                    Log.e(TAG, "Failed offline spooler fallback: ${spoolEx.message}")
                }

                _statusState.value = _statusState.value.copy(
                    lastError = "Epson offline (Receipt Spooled in Queue)"
                )
            } else {
                Log.i(TAG, "Print session finished ($bytesCapturedSoFar bytes forwarded)")
            }
        } finally {
            try { posSocket.close() } catch (_: Exception) {}
            try { epsonSocket?.close() } catch (_: Exception) {}
        }
    }
}
