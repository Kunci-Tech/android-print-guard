package com.kuncikuppi.printguard.receiver

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.kuncikuppi.printguard.service.PrintGuardService

/**
 * Watchdog receiver triggered by AlarmManager setExactAndAllowWhileIdle.
 * Wakes up CPU in deep Doze mode and verifies PrintGuardService is alive.
 *
 * BUG FIX #3: The alarm is now SELF-RESCHEDULING from inside onReceive().
 * Previously, the alarm was only rescheduled from inside the running Service's
 * coroutine loop. If Huawei EMUI/PowerGenie killed the Service process entirely,
 * no coroutine was alive to reschedule the next alarm — and the watchdog died forever.
 * Now the alarm perpetuates itself independently of the Service's lifecycle.
 */
class WatchdogReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WatchdogReceiver"
        const val ACTION_WATCHDOG_TICK = "com.kuncikuppi.printguard.ACTION_WATCHDOG_TICK"
        private const val WATCHDOG_INTERVAL_MS = 60_000L // 1 minute

        fun scheduleNextAlarm(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(context, WatchdogReceiver::class.java).apply {
                    action = ACTION_WATCHDOG_TICK
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    9100,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val triggerAtMs = SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS

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
                Log.d(TAG, "Next watchdog alarm scheduled in ${WATCHDOG_INTERVAL_MS / 1000}s")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule next watchdog alarm: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        Log.d(TAG, "Watchdog heartbeat tick received")

        // STEP 1: Self-reschedule immediately before doing anything else.
        // This guarantees perpetual operation even if the next steps fail or the service is dead.
        scheduleNextAlarm(context)

        // STEP 2: Acquire temporary 5-second wake lock to guarantee CPU execution
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "KunciPrintGuard::WatchdogTickWakeLock"
        )
        wakeLock.acquire(5000L)

        try {
            // STEP 3: Check if PrintGuardService is running. If suspended or killed, restart it!
            if (!PrintGuardService.isServiceRunning) {
                Log.w(TAG, "Watchdog detected PrintGuardService was stopped. Reviving service now...")
                PrintGuardService.startService(context)
            } else {
                // Service is running — send a heartbeat to keep it alive on Huawei
                val serviceIntent = Intent(context, PrintGuardService::class.java).apply {
                    action = PrintGuardService.ACTION_START
                }
                context.startService(serviceIntent)
                Log.d(TAG, "Watchdog heartbeat: Service is alive and running.")
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
