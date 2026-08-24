package com.kuncikuppi.printguard.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.kuncikuppi.printguard.data.SettingsDataStore
import com.kuncikuppi.printguard.service.PrintGuardService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Receiver to automatically start Print Guard proxy service upon tablet reboot.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(TAG, "Received broadcast intent: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val pendingResult = goAsync()
            val scope = CoroutineScope(Dispatchers.IO)

            scope.launch {
                try {
                    val settingsDataStore = SettingsDataStore(context.applicationContext)
                    val config = settingsDataStore.configFlow.first()

                    if (config.autoStartOnBoot) {
                        Log.i(TAG, "Auto-starting Kunci Print Guard Service on boot...")
                        PrintGuardService.startService(context.applicationContext)
                    } else {
                        Log.i(TAG, "Auto-start on boot is disabled in settings.")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to auto-start service on boot: ${e.message}", e)
                } finally {
                    pendingResult.finish()
                }
            }
        }
    }
}
