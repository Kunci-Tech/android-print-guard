package com.kuncikuppi.printguard.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import com.kuncikuppi.printguard.service.PrintGuardService

/**
 * Watchdog receiver triggered by AlarmManager setExactAndAllowWhileIdle.
 * Wakes up CPU in deep Doze mode and verifies PrintGuardService is alive.
 */
class WatchdogReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WatchdogReceiver"
        const val ACTION_WATCHDOG_TICK = "com.kuncikuppi.printguard.ACTION_WATCHDOG_TICK"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        Log.d(TAG, "Watchdog heartbeat tick received")

        // Acquire temporary 5-second wake lock to guarantee CPU execution
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "KunciPrintGuard::WatchdogTickWakeLock"
        )
        wakeLock.acquire(5000L)

        try {
            // Check if PrintGuardService is running. If suspended, restart it!
            if (!PrintGuardService.isServiceRunning) {
                Log.w(TAG, "Watchdog detected PrintGuardService was stopped. Reviving service now...")
                PrintGuardService.startService(context)
            } else {
                // Service is running, refresh foreground state
                val serviceIntent = Intent(context, PrintGuardService::class.java).apply {
                    action = PrintGuardService.ACTION_START
                }
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Watchdog failed to revive service: ${e.message}", e)
        } finally {
            if (wakeLock.isHeld) {
                wakeLock.release()
            }
        }
    }
}
