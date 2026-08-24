package com.kuncikuppi.printguard.cloud

import android.util.Log
import com.kuncikuppi.printguard.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object S3Uploader {

    private const val TAG = "S3Uploader"

    fun isConfigured(): Boolean {
        return BuildConfig.S3_ENDPOINT.isNotBlank() &&
                BuildConfig.S3_ACCESS_KEY_ID.isNotBlank() &&
                BuildConfig.S3_SECRET_ACCESS_KEY.isNotBlank() &&
                BuildConfig.S3_BUCKET_NAME.isNotBlank()
    }

    suspend fun uploadZipArchive(zipFile: File): Result<String> = withContext(Dispatchers.IO) {
        if (!isConfigured()) {
            Log.i(TAG, "S3 backup skipped: S3 credentials are not configured.")
            return@withContext Result.failure(Exception("S3 credentials not configured."))
        }

        if (!zipFile.exists() || zipFile.length() == 0L) {
            return@withContext Result.failure(Exception("ZIP archive file is missing or empty."))
        }

        try {
            val endpoint = BuildConfig.S3_ENDPOINT.trimEnd('/')
            val bucket = BuildConfig.S3_BUCKET_NAME
            val prefix = BuildConfig.S3_FOLDER_PREFIX.trim('/')

            val timestampStr = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val objectName = "backup_$timestampStr.zip"
            val s3PathKey = if (prefix.isNotEmpty()) "$prefix/$objectName" else objectName

            val host = URL(endpoint).host
            val uploadUrlStr = "$endpoint/$bucket/$s3PathKey"
            val url = URL(uploadUrlStr)

            val payloadHash = hex(sha256(zipFile.readBytes()))

            val amzDate = SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(Date())
            val dateStamp = amzDate.substring(0, 8)

            val region = BuildConfig.S3_REGION.ifBlank { "us-east-1" }
            val service = "s3"

            // Canonical Request
            val canonicalUri = "/$bucket/$s3PathKey"
            val canonicalHeaders = "host:$host\nx-amz-content-sha256:$payloadHash\nx-amz-date:$amzDate\n"
            val signedHeaders = "host;x-amz-content-sha256;x-amz-date"
            val canonicalRequest = "PUT\n$canonicalUri\n\n$canonicalHeaders\n$signedHeaders\n$payloadHash"

            // String to Sign
            val algorithm = "AWS4-HMAC-SHA256"
            val credentialScope = "$dateStamp/$region/$service/aws4_request"
            val stringToSign = "$algorithm\n$amzDate\n$credentialScope\n${hex(sha256(canonicalRequest.toByteArray(Charsets.UTF_8)))}"

            // Signature Computation
            val signingKey = getSignatureKey(BuildConfig.S3_SECRET_ACCESS_KEY, dateStamp, region, service)
            val signature = hex(hmacSha256(signingKey, stringToSign))

            val authorizationHeader = "$algorithm Credential=${BuildConfig.S3_ACCESS_KEY_ID}/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature"

            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "PUT"
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("Host", host)
            conn.setRequestProperty("x-amz-date", amzDate)
            conn.setRequestProperty("x-amz-content-sha256", payloadHash)
            conn.setRequestProperty("Authorization", authorizationHeader)
            conn.setRequestProperty("Content-Type", "application/zip")
            conn.setFixedLengthStreamingMode(zipFile.length())

            conn.outputStream.use { os ->
                FileInputStream(zipFile).use { fis ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    while (fis.read(buffer).also { count -> read = count } != -1) {
                        os.write(buffer, 0, read)
                    }
                }
            }

            val responseCode = conn.responseCode
            if (responseCode in 200..299) {
                Log.i(TAG, "S3 Upload Success: $uploadUrlStr")
                Result.success(uploadUrlStr)
            } else {
                val errorMsg = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $responseCode"
                Log.e(TAG, "S3 Upload Failed ($responseCode): $errorMsg")
                Result.failure(Exception("S3 Upload Failed ($responseCode): $errorMsg"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "S3 Upload Exception: ${e.message}", e)
            Result.failure(e)
        }
    }

    private fun sha256(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(data)

    private fun hmacSha256(key: ByteArray, data: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8))
    }

    private fun getSignatureKey(key: String, dateStamp: String, regionName: String, serviceName: String): ByteArray {
        val kSecret = ("AWS4$key").toByteArray(Charsets.UTF_8)
        val kDate = hmacSha256(kSecret, dateStamp)
        val kRegion = hmacSha256(kDate, regionName)
        val kService = hmacSha256(kRegion, serviceName)
        return hmacSha256(kService, "aws4_request")
    }

    private fun hex(data: ByteArray): String =
        data.joinToString("") { "%02x".format(it) }
}
