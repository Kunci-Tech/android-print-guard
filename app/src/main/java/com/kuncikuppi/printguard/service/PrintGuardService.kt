package com.kuncikuppi.printguard.service

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import com.kuncikuppi.printguard.cloud.S3Uploader
import com.kuncikuppi.printguard.data.DiskAuditRepository
import com.kuncikuppi.printguard.data.DiskCaptureRepository
import com.kuncikuppi.printguard.data.SettingsDataStore
import com.kuncikuppi.printguard.network.LocalTcpPrintProxyServer
import com.kuncikuppi.printguard.receiver.WatchdogReceiver
import com.kuncikuppi.printguard.spooler.PrintSpoolerEngine
import com.kuncikuppi.printguard.ui.MainActivity
import com.kuncikuppi.printguard.web.EmbeddedWebServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class PrintGuardService : Service() {

    companion object {
        private const val TAG = "PrintGuardService"
        private const val NOTIFICATION_ID = 9100
        private const val CHANNEL_ID = "print_guard_high_priority_channel"

        const val ACTION_START = "com.kuncikuppi.printguard.ACTION_START"
        const val ACTION_STOP = "com.kuncikuppi.printguard.ACTION_STOP"
        const val ACTION_RESTART = "com.kuncikuppi.printguard.ACTION_RESTART"

        @Volatile
        var isServiceRunning = false
            private set

        @JvmStatic
        fun startService(context: Context) {
            val intent = Intent(context, PrintGuardService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        @JvmStatic
        fun stopService(context: Context) {
            val intent = Intent(context, PrintGuardService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private lateinit var settingsDataStore: SettingsDataStore
    private lateinit var captureRepository: DiskCaptureRepository
    private lateinit var auditRepository: DiskAuditRepository
    private lateinit var spoolerEngine: PrintSpoolerEngine
    private lateinit var proxyServer: LocalTcpPrintProxyServer
    private lateinit var webServer: EmbeddedWebServer

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var proxyObserverJob: Job? = null
    private var watchdogJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "PrintGuardService onCreate")

        settingsDataStore = SettingsDataStore(applicationContext)
        captureRepository = DiskCaptureRepository(applicationContext)
        auditRepository = DiskAuditRepository(applicationContext)
        spoolerEngine = PrintSpoolerEngine(applicationContext)
        proxyServer = LocalTcpPrintProxyServer(captureRepository, spoolerEngine)
        webServer = EmbeddedWebServer(applicationContext, captureRepository, settingsDataStore)

        acquireBackgroundLocks()
        bindProcessToWifiNetwork()
        createNotificationChannel()
        startWatchdogHeartbeat()

        webServer.start()
    }

    private fun bindProcessToWifiNetwork() {
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()

            connectivityManager.requestNetwork(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            connectivityManager.bindProcessToNetwork(network)
                        } else {
                            @Suppress("DEPRECATION")
                            ConnectivityManager.setProcessDefaultNetwork(network)
                        }
                        Log.i(TAG, "Process successfully bound to TRANSPORT_WIFI network")
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not bind process to Wi-Fi network: ${e.message}")
                    }
                }

                override fun onLost(network: Network) {
                    Log.w(TAG, "Wi-Fi network connection lost. Print Guard waiting for auto-reconnect...")
                }
            })
        } catch (e: Exception) {
            Log.w(TAG, "Error requesting Wi-Fi network binding: ${e.message}")
        }
    }

    private fun acquireBackgroundLocks() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "KunciPrintGuard::ProxyWakeLock"
            ).apply {
                acquire(10 * 365 * 24 * 3600 * 1000L)
            }

            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiLockMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                @Suppress("DEPRECATION")
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wifiManager.createWifiLock(wifiLockMode, "KunciPrintGuard::LowLatencyWifiLock").apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.i(TAG, "Background WakeLock and Low-Latency WifiLock successfully acquired.")
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire background locks: ${e.message}")
        }
    }

    private fun releaseBackgroundLocks() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
            Log.i(TAG, "Background locks released.")
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing background locks: ${e.message}")
        }
    }

    private fun startWatchdogHeartbeat() {
        watchdogJob?.cancel()
        watchdogJob = serviceScope.launch(Dispatchers.IO) {
            var lastDailyCheckDate = ""
            while (isActive) {
                delay(15000L)
                scheduleNextExactAlarm()
                val config = settingsDataStore.configFlow.first()
                spoolerEngine.start(config.epsonIp, config.epsonPort)
                if (isServiceRunning && !proxyServer.statusState.value.isRunning) {
                    Log.w(TAG, "Watchdog detected proxy engine stopped unexpectedly. Auto-restarting proxy...")
                    proxyServer.start(config.localProxyPort, config.epsonIp, config.epsonPort)
                }

                // Check 20:00 Daily S3 Backup and 7-Day Auto-Purge
                val calendar = Calendar.getInstance()
                val hour = calendar.get(Calendar.HOUR_OF_DAY)
                val currentDateStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.time)

                if (hour >= 20 && lastDailyCheckDate != currentDateStr) {
                    lastDailyCheckDate = currentDateStr
                    performScheduledDailyBackupAndPurge()
                }
            }
        }
    }

    private suspend fun performScheduledDailyBackupAndPurge() {
        withContext(Dispatchers.IO) {
            try {
                captureRepository.purgeCapturesOlderThan(7)
                if (S3Uploader.isConfigured()) {
                    val exportsDir = File(cacheDir, "exports")
                    captureRepository.exportAllCapturesZip()
                    val zipFilter = java.io.FilenameFilter { _, name -> name.endsWith(".zip") }
                    val latestZip = exportsDir.listFiles(zipFilter)?.maxByOrNull { it.lastModified() }

                    if (latestZip != null && latestZip.exists()) {
                        val result = S3Uploader.uploadZipArchive(latestZip)
                        if (result.isSuccess) {
                            auditRepository.logEvent("S3_BACKUP_SUCCESS", "Automated 20:00 daily S3 backup uploaded: ${result.getOrNull()}")
                        } else {
                            auditRepository.logEvent("S3_BACKUP_FAILED", "Automated 20:00 S3 backup failed: ${result.exceptionOrNull()?.message}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error performing daily backup/purge: ${e.message}", e)
            }
            Unit
        }
    }

    private fun scheduleNextExactAlarm() {
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(this, WatchdogReceiver::class.java).apply {
                action = WatchdogReceiver.ACTION_WATCHDOG_TICK
            }
            val pendingIntent = PendingIntent.getBroadcast(
                this,
                9100,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerAtMs = SystemClock.elapsedRealtime() + 60000L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAtMs,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAtMs,
                    pendingIntent
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error scheduling Watchdog AlarmManager: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        Log.i(TAG, "onStartCommand action: $action")

        when (action) {
            ACTION_START, ACTION_RESTART -> {
                isServiceRunning = true
                startForegroundWithNotification("Initializing Print Guard Zero-Latency Engine...")
                startProxyEngine()
                scheduleNextExactAlarm()
                serviceScope.launch {
                    auditRepository.logEvent("SERVICE_STARTED", "Print Guard TCP proxy server started (Spooler & Web 9101 Active)")
                }
            }
            ACTION_STOP -> {
                watchdogJob?.cancel()
                stopProxyEngine()
                spoolerEngine.stop()
                webServer.stop()
                isServiceRunning = false
                releaseBackgroundLocks()
                serviceScope.launch {
                    auditRepository.logEvent("SERVICE_STOPPED", "Print Guard TCP proxy server stopped by Admin")
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_STICKY
    }

    private fun startProxyEngine() {
        proxyObserverJob?.cancel()
        proxyObserverJob = serviceScope.launch {
            val config = settingsDataStore.configFlow.first()
            val notificationText = "Listening on port ${config.localProxyPort} -> Epson: ${config.epsonIp}:${config.epsonPort} | Web: 9101"
            updateNotification(notificationText)

            spoolerEngine.start(config.epsonIp, config.epsonPort)
            proxyServer.start(
                localPort = config.localProxyPort,
                epsonIp = config.epsonIp,
                epsonPort = config.epsonPort
            )

            proxyServer.statusState.collect { status ->
                if (status.lastError != null) {
                    updateNotification("Error: ${status.lastError}")
                } else if (status.isRunning) {
                    updateNotification("Active: 0.0.0.0:${status.localPort} -> Epson: ${status.targetEpsonIp}:${status.targetEpsonPort}")
                }
            }
        }
    }

    private fun stopProxyEngine() {
        proxyObserverJob?.cancel()
        proxyServer.stop()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Kunci Print Guard Priority Channel",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Shows real-time status of receipt proxy service"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kunci Print Guard is active")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun startForegroundWithNotification(statusText: String) {
        val notification = buildNotification(statusText)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(statusText: String) {
        val notification = buildNotification(statusText)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        Log.i(TAG, "PrintGuardService onDestroy")
        watchdogJob?.cancel()
        stopProxyEngine()
        spoolerEngine.stop()
        webServer.stop()
        releaseBackgroundLocks()
        isServiceRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
