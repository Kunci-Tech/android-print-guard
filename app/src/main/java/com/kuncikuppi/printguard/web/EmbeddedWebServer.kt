package com.kuncikuppi.printguard.web

import android.content.Context
import android.util.Log
import com.kuncikuppi.printguard.data.DiskCaptureRepository
import com.kuncikuppi.printguard.data.SettingsDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder

class EmbeddedWebServer(
    private val context: Context,
    private val captureRepository: DiskCaptureRepository,
    private val settingsDataStore: SettingsDataStore
) {
    companion object {
        private const val TAG = "EmbeddedWebServer"
        const val DEFAULT_WEB_PORT = 9101
    }

    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    fun start(port: Int = DEFAULT_WEB_PORT) {
        if (serverSocket?.isClosed == false && serverSocket != null) return

        serverJob = scope.launch {
            try {
                val socket = ServerSocket(port, 50, InetAddress.getByName("0.0.0.0"))
                socket.reuseAddress = true
                serverSocket = socket
                Log.i(TAG, "Embedded Web Dashboard listening on http://0.0.0.0:$port")

                while (isActive && !socket.isClosed) {
                    try {
                        val clientSocket = socket.accept()
                        scope.launch {
                            handleClientRequest(clientSocket)
                        }
                    } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error running Embedded Web Server on port $port: ${e.message}")
            }
        }
    }

    fun stop() {
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverJob?.cancel()
        serverSocket = null
        Log.i(TAG, "Embedded Web Dashboard stopped")
    }

    private suspend fun handleClientRequest(clientSocket: Socket) = withContext(Dispatchers.IO) {
        try {
            clientSocket.soTimeout = 5000
            val input = clientSocket.getInputStream()
            val output = clientSocket.getOutputStream()
            val reader = BufferedReader(InputStreamReader(input, Charsets.UTF_8))

            val requestLine = reader.readLine() ?: return@withContext
            val parts = requestLine.split(" ")
            val method = parts.getOrNull(0) ?: "GET"
            val rawPath = parts.getOrNull(1) ?: "/"

            val path = rawPath.split("?")[0]
            val queryString = if (rawPath.contains("?")) rawPath.split("?")[1] else ""

            when {
                path == "/api/update-pin" -> {
                    handlePinUpdate(method, queryString, reader, input, output)
                }
                path == "/api/export-zip" -> {
                    serveZipDownload(output)
                }
                path == "/api/status" -> {
                    serveStatusJson(output)
                }
                else -> {
                    serveDashboardHtml(output)
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "HTTP client request finished: ${e.message}")
        } finally {
            try { clientSocket.close() } catch (_: Exception) {}
        }
    }

    private suspend fun handlePinUpdate(
        method: String,
        queryString: String,
        reader: BufferedReader,
        input: java.io.InputStream,
        output: OutputStream
    ) {
        var paramsMap = parseParams(queryString)
        if (method == "POST") {
            var contentLength = 0
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (line.isNullOrBlank()) break
                if (line!!.lowercase().startsWith("content-length:")) {
                    contentLength = line!!.split(":")[1].trim().toIntOrNull() ?: 0
                }
            }
            if (contentLength > 0) {
                val bodyChars = CharArray(contentLength)
                reader.read(bodyChars, 0, contentLength)
                val bodyStr = String(bodyChars)
                paramsMap = paramsMap + parseParams(bodyStr)
            }
        }

        val currentPinInput = paramsMap["current_pin"] ?: ""
        val newPinInput = paramsMap["new_pin"] ?: ""

        val config = settingsDataStore.configFlow.first()
        if (currentPinInput == config.adminPin && newPinInput.trim().isNotEmpty()) {
            settingsDataStore.updateSecurityAndBoot(newPinInput.trim(), config.autoStartOnBoot)
            val json = """{"status":"SUCCESS","message":"Admin PIN updated successfully"}"""
            serveJsonResponse(output, 200, json)
        } else {
            val json = """{"status":"FAILED","message":"Incorrect current Admin PIN or invalid new PIN"}"""
            serveJsonResponse(output, 400, json)
        }
    }

    private fun parseParams(query: String): Map<String, String> {
        val map = mutableMapOf<String, String>()
        if (query.isEmpty()) return map
        val pairs = query.split("&")
        for (pair in pairs) {
            val idx = pair.indexOf("=")
            if (idx > 0) {
                val key = URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                val value = URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                map[key] = value
            }
        }
        return map
    }

    private fun serveJsonResponse(output: OutputStream, statusCode: Int, json: String) {
        val bytes = json.toByteArray(Charsets.UTF_8)
        val statusMsg = if (statusCode == 200) "200 OK" else "400 Bad Request"
        val headers = "HTTP/1.1 $statusMsg\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        output.write(headers.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private suspend fun serveDashboardHtml(output: OutputStream) {
        val config = settingsDataStore.configFlow.first()
        val captures = captureRepository.getAllCaptures().first()

        val tableRows = StringBuilder()
        captures.take(20).forEach { job ->
            tableRows.append("""
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #334155;">${job.id}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #334155;">${job.capturedAt.take(19).replace("T", " ")}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #334155;">${job.byteCount} Bytes</td>
                    <td style="padding: 10px; border-bottom: 1px solid #334155; font-family: monospace; font-size: 11px;">${job.sha256.take(12)}...</td>
                </tr>
            """.trimIndent())
        }

        val html = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Kunci Print Guard - Web Remote Audit</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
                    .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
                    h1 { color: #38bdf8; font-size: 22px; margin-top: 0; }
                    .badge { background: #10b981; color: #000; font-weight: bold; padding: 4px 10px; border-radius: 20px; font-size: 12px; }
                    .btn { background: #10b981; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; cursor: pointer; }
                    .input { background: #0f172a; border: 1px solid #334155; color: #fff; padding: 8px 12px; border-radius: 6px; margin-right: 8px; }
                    table { width: 100%; border-collapse: collapse; text-align: left; }
                    th { padding: 10px; background: #334155; color: #94a3b8; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>🛡️ Kunci Print Guard Remote Dashboard</h1>
                    <p><span class="badge">ACTIVE 24/7</span> Proxy Port: <strong>${config.localProxyPort}</strong> | Target Epson: <strong>${config.epsonIp}:${config.epsonPort}</strong></p>
                    <a href="/api/export-zip" class="btn">📦 Download ALL Captures & Audit Logs (.ZIP)</a>
                </div>

                <div class="card">
                    <h3>🔐 Remote Admin PIN Administration</h3>
                    <p style="font-size: 13px; color: #94a3b8;">Modify the Admin Protection PIN remotely over local Wi-Fi:</p>
                    <form method="POST" action="/api/update-pin" style="margin-top: 10px;">
                        <input type="password" name="current_pin" placeholder="Current PIN" class="input" required />
                        <input type="password" name="new_pin" placeholder="New Admin PIN" class="input" required />
                        <button type="submit" class="btn" style="background: #38bdf8; color: #000;">Update Admin PIN</button>
                    </form>
                </div>

                <div class="card">
                    <h3>Recent Intercepted Receipts (${captures.size} Total)</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Job ID</th>
                                <th>Timestamp</th>
                                <th>Payload Size</th>
                                <th>SHA256 Hash</th>
                            </tr>
                        </thead>
                        <tbody>
                            $tableRows
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        """.trimIndent()

        val bytes = html.toByteArray(Charsets.UTF_8)
        val headers = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        output.write(headers.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private suspend fun serveStatusJson(output: OutputStream) {
        val config = settingsDataStore.configFlow.first()
        val captures = captureRepository.getAllCaptures().first()
        val json = """{"status":"ACTIVE","proxy_port":${config.localProxyPort},"epson_ip":"${config.epsonIp}","epson_port":${config.epsonPort},"total_captures":${captures.size}}"""
        val bytes = json.toByteArray(Charsets.UTF_8)
        val headers = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        output.write(headers.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private suspend fun serveZipDownload(output: OutputStream) {
        captureRepository.exportAllCapturesZip()
        val exportsDir = File(context.cacheDir, "exports")
        val latestZip = exportsDir.listFiles { _, name -> name.endsWith(".zip") }
            ?.maxByOrNull { it.lastModified() }

        if (latestZip != null && latestZip.exists()) {
            val headers = "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Disposition: attachment; filename=\"${latestZip.name}\"\r\nContent-Length: ${latestZip.length()}\r\nConnection: close\r\n\r\n"
            output.write(headers.toByteArray(Charsets.UTF_8))
            output.flush()

            FileInputStream(latestZip).use { fis ->
                val buffer = ByteArray(8192)
                var count: Int
                while (fis.read(buffer).also { count = it } != -1) {
                    output.write(buffer, 0, count)
                }
            }
            output.flush()
        } else {
            val msg = "ZIP archive not available".toByteArray(Charsets.UTF_8)
            val headers = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: ${msg.size}\r\nConnection: close\r\n\r\n"
            output.write(headers.toByteArray(Charsets.UTF_8))
            output.write(msg)
            output.flush()
        }
    }
}
