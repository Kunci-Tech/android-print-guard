package com.kuncikuppi.printguard.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "print_guard_settings")

data class PrintGuardConfig(
    val epsonIp: String = "192.168.8.225",
    val epsonPort: Int = 9100,
    val localProxyPort: Int = 9100,
    val adminPin: String = "1011",
    val autoStartOnBoot: Boolean = true,
    val isServiceExplicitlyStopped: Boolean = false
)

class SettingsDataStore(private val context: Context) {

    companion object {
        private val KEY_EPSON_IP = stringPreferencesKey("epson_ip")
        private val KEY_EPSON_PORT = intPreferencesKey("epson_port")
        private val KEY_LOCAL_PROXY_PORT = intPreferencesKey("local_proxy_port")
        private val KEY_ADMIN_PIN = stringPreferencesKey("admin_pin")
        private val KEY_AUTO_START_ON_BOOT = booleanPreferencesKey("auto_start_on_boot")
        private val KEY_EXPLICITLY_STOPPED = booleanPreferencesKey("explicitly_stopped")
    }

    val configFlow: Flow<PrintGuardConfig> = context.dataStore.data
        .map { preferences ->
            val savedIp = preferences[KEY_EPSON_IP] ?: "192.168.8.225"
            val validIp = if (savedIp.endsWith(".255")) "192.168.8.225" else savedIp

            PrintGuardConfig(
                epsonIp = validIp,
                epsonPort = preferences[KEY_EPSON_PORT] ?: 9100,
                localProxyPort = preferences[KEY_LOCAL_PROXY_PORT] ?: 9100,
                adminPin = preferences[KEY_ADMIN_PIN] ?: "1011",
                autoStartOnBoot = preferences[KEY_AUTO_START_ON_BOOT] ?: true,
                isServiceExplicitlyStopped = preferences[KEY_EXPLICITLY_STOPPED] ?: false
            )
        }

    suspend fun updateConfig(epsonIp: String, epsonPort: Int, localProxyPort: Int) {
        context.dataStore.edit { preferences ->
            preferences[KEY_EPSON_IP] = epsonIp.trim()
            preferences[KEY_EPSON_PORT] = epsonPort
            preferences[KEY_LOCAL_PROXY_PORT] = localProxyPort
        }
    }

    suspend fun updateSecurityAndBoot(adminPin: String, autoStartOnBoot: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[KEY_ADMIN_PIN] = adminPin.trim()
            preferences[KEY_AUTO_START_ON_BOOT] = autoStartOnBoot
        }
    }

    suspend fun setServiceExplicitlyStopped(stopped: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[KEY_EXPLICITLY_STOPPED] = stopped
        }
    }
}
