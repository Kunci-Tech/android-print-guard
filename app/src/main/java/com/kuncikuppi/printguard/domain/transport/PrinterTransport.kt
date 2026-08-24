package com.kuncikuppi.printguard.domain.transport

import java.io.InputStream
import java.io.OutputStream

/**
 * Abstraction for communicating with the target receipt printer.
 * Supports bidirectional TCP byte streaming and testing connectivity.
 */
interface PrinterTransport {

    /**
     * Tests basic socket connection reachability to the specified target.
     */
    suspend fun testConnection(host: String, port: Int, timeoutMs: Int = 3000): Result<Boolean>

    /**
     * Performs direct, zero-delay TCP byte forwarding between client POS socket
     * and target printer socket, yielding copied bytes for background capture storage.
     *
     * @param posInput Stream coming from Luna POS
     * @param posOutput Stream back to Luna POS (for printer status responses)
     * @param printerInput Stream from Epson printer (for status feedback)
     * @param printerOutput Stream to Epson printer
     * @param onByteChunkCopied Lambda invoked when raw byte chunks are forwarded
     */
    suspend fun forwardBidirectional(
        posInput: InputStream,
        posOutput: OutputStream,
        printerInput: InputStream,
        printerOutput: OutputStream,
        onByteChunkCopied: (ByteArray, Int) -> Unit
    )
}
