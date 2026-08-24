package com.kuncikuppi.printguard.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * DeviceAdminReceiver enabling Device Owner / Device Admin uninstall protection via ADB.
 */
class AdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "AdminReceiver"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device Admin / Uninstall Protection Enabled")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Kunci Print Guard is required for POS receipt printing. Disabling protection will disrupt printing service."
    }
}
