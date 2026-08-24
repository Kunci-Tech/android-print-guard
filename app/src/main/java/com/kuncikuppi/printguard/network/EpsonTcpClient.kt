package com.kuncikuppi.printguard.network

import android.util.Log
import com.kuncikuppi.printguard.domain.transport.PrinterTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

data class EpsonHardwareStatus(
    val isOnline: Boolean,
    val paperStatus: String = "Normal",
    val coverOpen: Boolean = false,
    val rawStatusByte: Int = 0
)

class EpsonTcpClient : PrinterTransport {

    companion object {
        private const val TAG = "EpsonTcpClient"
        private const val BUFFER_SIZE = 8192
    }

    override suspend fun testConnection(host: String, port: Int, timeoutMs: Int): Result<Boolean> =
        withContext(Dispatchers.IO) {
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                    Result.success(socket.isConnected)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Test connection to Epson ($host:$port) failed: ${e.message}")
                Result.failure(e)
            }
        }

    suspend fun queryPrinterStatus(host: String, port: Int, timeoutMs: Int = 4000): EpsonHardwareStatus =
        withContext(Dispatchers.IO) {
            val tcpCheck = testConnection(host, port, timeoutMs)
            if (tcpCheck.isFailure || !tcpCheck.getOrDefault(false)) {
                return@withContext EpsonHardwareStatus(isOnline = false, paperStatus = "Offline / Unreachable")
            }

            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                    socket.soTimeout = timeoutMs
                    val out = socket.getOutputStream()
                    val input = socket.getInputStream()

                    // Send DLE EOT 1 (Real-time status transmission)
                    out.write(byteArrayOf(0x10, 0x04, 0x01))
                    out.flush()

                    val buffer = ByteArray(16)
                    val read = input.read(buffer)
                    if (read > 0) {
                        val statusByte = buffer[0].toInt() and 0xFF
                        val coverOpen = (statusByte and 0x20) != 0
                        val paperLow = (statusByte and 0x0C) != 0

                        val paperText = if (paperLow) "Paper Low / Near End" else "Normal"
                        EpsonHardwareStatus(
                            isOnline = true,
                            paperStatus = paperText,
                            coverOpen = coverOpen,
                            rawStatusByte = statusByte
                        )
                    } else {
                        EpsonHardwareStatus(isOnline = true, paperStatus = "Normal")
                    }
                }
            } catch (e: Exception) {
                // If DLE EOT status query is unsupported by model, report online based on TCP connection success
                EpsonHardwareStatus(isOnline = true, paperStatus = "Online (Normal)")
            }
        }

    suspend fun sendRawBytes(host: String, port: Int, payload: ByteArray, timeoutMs: Int = 5000): Result<Boolean> =
        withContext(Dispatchers.IO) {
            try {
                Socket().use { socket ->
                    socket.tcpNoDelay = true
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                    socket.soTimeout = timeoutMs
                    val out = socket.getOutputStream()
                    out.write(payload)
                    out.flush()
                    Result.success(true)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send raw bytes to Epson ($host:$port): ${e.message}")
                Result.failure(e)
            }
        }

    override suspend fun forwardBidirectional(
        posInput: InputStream,
        posOutput: OutputStream,
        printerInput: InputStream,
        printerOutput: OutputStream,
        onByteChunkCopied: (ByteArray, Int) -> Unit
    ) {
        withContext(Dispatchers.IO) {
            val buffer = ByteArray(BUFFER_SIZE)
            var totalForwarded = 0L

            try {
                var bytesRead: Int
                while (posInput.read(buffer).also { bytesRead = it } != -1) {
                    if (bytesRead > 0) {
                        printerOutput.write(buffer, 0, bytesRead)
                        printerOutput.flush()

                        totalForwarded += bytesRead
                        onByteChunkCopied(buffer, bytesRead)

                        if (printerInput.available() > 0) {
                            val responseBuffer = ByteArray(BUFFER_SIZE)
                            val respRead = printerInput.read(responseBuffer)
                            if (respRead > 0) {
                                posOutput.write(responseBuffer, 0, respRead)
                                posOutput.flush()
                            }
                        }
                    }
                }
            } catch (e: SocketTimeoutException) {
                Log.d(TAG, "Socket read timeout reached after forwarding $totalForwarded bytes")
            } catch (e: Exception) {
                Log.e(TAG, "Error during forwarding: ${e.message}", e)
            }
        }
    }
}
