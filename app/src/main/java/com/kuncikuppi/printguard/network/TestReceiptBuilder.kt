package com.kuncikuppi.printguard.network

import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object TestReceiptBuilder {

    fun buildTestReceiptPayload(proxyPort: Int, targetIp: String): ByteArray {
        val out = ByteArrayOutputStream()

        // ESC @ (Initialize printer)
        out.write(byteArrayOf(0x1B, 0x40))

        // ESC a 1 (Center alignment)
        out.write(byteArrayOf(0x1B, 0x61, 0x01))

        // ESC E 1 (Bold ON) & Double Height
        out.write(byteArrayOf(0x1B, 0x45, 0x01))
        out.write(byteArrayOf(0x1D, 0x21, 0x10))
        out.write("KUNCI PRINT GUARD\n".toByteArray(Charsets.US_ASCII))

        // Reset formatting
        out.write(byteArrayOf(0x1D, 0x21, 0x00))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))

        out.write("--------------------------------\n".toByteArray(Charsets.US_ASCII))
        out.write("PHYSICAL TEST RECEIPT OK\n".toByteArray(Charsets.US_ASCII))
        out.write("--------------------------------\n".toByteArray(Charsets.US_ASCII))

        // ESC a 0 (Left alignment)
        out.write(byteArrayOf(0x1B, 0x61, 0x00))

        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
        out.write("Timestamp  : $timestamp\n".toByteArray(Charsets.US_ASCII))
        out.write("Proxy Port : $proxyPort\n".toByteArray(Charsets.US_ASCII))
        out.write("Target IP  : $targetIp:9100\n".toByteArray(Charsets.US_ASCII))
        out.write("Web Server : Port 9101\n".toByteArray(Charsets.US_ASCII))
        out.write("Status     : OPERATIONAL 24/7\n".toByteArray(Charsets.US_ASCII))

        out.write("--------------------------------\n".toByteArray(Charsets.US_ASCII))

        // ESC a 1 (Center alignment)
        out.write(byteArrayOf(0x1B, 0x61, 0x01))
        out.write("Kunci Kuppi Tech - Enterprise\n\n\n".toByteArray(Charsets.US_ASCII))

        // GS V 66 0 (Cut paper)
        out.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00))

        return out.toByteArray()
    }
}
