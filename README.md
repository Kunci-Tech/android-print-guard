# 🛡️ Kunci Print Guard

> **Production-ready Android Local TCP Print Proxy, RAW ESC/POS Receipt Capture Engine, and Offline Spooler Failover Suite.**

[![Android License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Kotlin](https://img.shields.io/badge/Kotlin-1.9.0-purple.svg)](https://kotlinlang.org/)
[![Android API](https://img.shields.io/badge/API-24%2B-green.svg)](https://developer.android.com)

**Kunci Print Guard** is a lightweight, high-performance Android application designed to run 24/7 on POS Android tablets (e.g. Huawei, Xiaomi, Samsung). It acts as an in-line TCP proxy between Point-of-Sale (POS) applications (e.g. Luna POS) and ESC/POS thermal receipt printers (e.g. Epson TM-T82XII).

It intercepts, logs, and verifies every printed receipt in real-time, providing visual receipt previews, offline print queue failover, security audit logs, and an embedded web dashboard.

---

## 🌟 Key Features

- **⚡ Zero-Latency TCP Proxy (`:9100`)**: Disables Nagle's algorithm (`tcpNoDelay = true`) for instantaneous, 0ms buffer receipt output.
- **🧾 ESC/POS Stream Interpreter & Virtual Receipt Preview**: Parses raw binary ESC/POS formatting (`ESC E` bold, `ESC a` alignment, `GS V` paper cut) into a pixel-perfect Virtual Thermal Paper Receipt Card.
- **🛡️ Offline Spooler & Queue Failover**: Safely holds receipt payloads when the printer is offline or out of paper, automatically flushing queued jobs in exact order when the printer recovers.
- **🌐 Embedded Web Management Dashboard (`:9101`)**: Access live telemetry, inspect receipts, and download bulk `.ZIP` diagnostic archives remotely from any phone or laptop browser on the local Wi-Fi.
- **📦 One-Click Bulk Export (.ZIP)**: Bundles all captured `.raw` payloads, `.json` metadata files, and security audit logs (`audit_events.json`) into a single shareable `.zip` file for forensic investigation.
- **🔒 PIN-Protected Administration & Device Admin**: Admin PIN protection (`1011`) for stopping service or changing policies. Device Admin integration prevents unauthorized uninstallation.
- **🔄 24/7 Background Self-Healing**: Powered by Android `WIFI_MODE_FULL_LOW_LATENCY` locks, `TRANSPORT_WIFI` socket binding, a 15s Watchdog loop, and `AlarmManager.setExactAndAllowWhileIdle()` wakeup ticks.

---

## 📐 Network Architecture

```text
                                [ Internet ]
                                     │
                           [ Xiaomi Modem/Router ]
                                     │
                             (Wi-Fi / Ethernet)
                                     │
                    ┌────────────────▼────────────────┐
                    │ GL.iNet Router (GL-MT300N-V2)   │
                    │ Subnet: 192.168.8.x             │
                    └────────┬───────────────┬────────┘
                             │               │
                     (Wi-Fi 2.4GHz)       (Ethernet LAN)
                             │               │
                      [ Huawei Tab ]    [ Epson TM-T82XII ]
                      192.168.8.178     192.168.8.225:9100
                      (Luna POS +       
                       Print Guard)
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Android Studio Hedgehog (2023.1.1+) or JDK 17.
- Android device running API 24 (Android 7.0) or higher.
- Epson TM-T82XII (or compatible ESC/POS network thermal printer).

### Building from Source

```bash
# Clone repository
git clone https://github.com/your-username/android-print-guard.git
cd android-print-guard

# Set environment variables for Android CLI
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"

# Assemble Debug APK
./gradlew assembleDebug
```

### Installation via ADB

```bash
# 1. Install APK onto connected Android device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 2. Enable Device Administrator Mode (Prevents accidental uninstallation)
adb shell dpm set-active-admin com.kuncikuppi.printguard/.receiver.AdminReceiver

# 3. (Xiaomi MIUI/HyperOS Devices) Exclude app from battery saver & grant background permissions
adb shell "dumpsys deviceidle whitelist +com.kuncikuppi.printguard"
adb shell "cmd appops set com.kuncikuppi.printguard RUN_IN_BACKGROUND allow"
adb shell "cmd appops set com.kuncikuppi.printguard RUN_ANY_IN_BACKGROUND allow"

# 4. (Huawei EMUI/HarmonyOS Devices) Exclude app from battery optimization & PowerGenie
adb shell "dumpsys deviceidle whitelist +com.kuncikuppi.printguard"
adb shell "cmd appops set com.kuncikuppi.printguard RUN_IN_BACKGROUND allow"
adb shell "pm disable-user --user 0 com.huawei.powergenie"
```

---

## 📖 Configuration & Administration

1. **Default Settings**:
   - **Target Epson Printer IP**: `192.168.8.225`
   - **Target Printer Port**: `9100`
   - **Local Proxy Listening Port**: `9100`
   - **Web Dashboard Port**: `9101`
   - **Default Admin PIN**: `1011`

2. **Luna POS Setup**:
   In Luna POS settings, change the target printer IP from `192.168.8.225` to `127.0.0.1` (or the tablet's local Wi-Fi IP `192.168.8.xxx`). All print jobs will route through Kunci Print Guard seamlessly.

---

## 🛠️ Vendor-Specific Battery Optimization Setup

### Huawei (EMUI / HarmonyOS)
1. Go to **Settings -> Battery -> App Launch** *(Peluncuran Aplikasi)*.
2. Find **Kunci Print Guard** -> Change from *"Manage Automatically"* to **"Manage Manually"**.
3. Enable **Auto-launch**, **Secondary launch**, and **Run in background**.
4. Go to **Settings -> Apps -> Special Access -> Battery Optimization** -> Set Kunci Print Guard to **"Don't Allow / Excluded"**.

### Xiaomi (MIUI / HyperOS)
1. Go to **Settings -> Apps -> Manage Apps -> Kunci Print Guard**.
2. Enable **Autostart**.
3. Change **Battery Saver** from *"Smart saving"* to **"No restrictions"**.

---

## 📚 Technical Documentation

For in-depth architectural details, refer to [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
