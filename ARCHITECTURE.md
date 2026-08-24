# Kunci Print Guard - System Architecture & Technical Specification

## Overview

**Kunci Print Guard** is a production-grade, zero-latency local TCP print proxy, raw ESC/POS receipt capture engine, and offline spooler failover service built for Android (Kotlin / Jetpack Compose).

It acts as an invisible network intermediary between Point-of-Sale (POS) applications (e.g. Luna POS) and ESC/POS thermal receipt printers (e.g. Epson TM-T82XII).

```text
┌─────────────────┐           ┌─────────────────────────────────────┐           ┌──────────────────┐
│  Luna POS App   │           │     Kunci Print Guard (Android)     │           │  Epson Printer   │
│  (192.168.8.x)  │           │     Proxy Engine (Port 9100)        │           │ (192.168.8.225)  │
└────────┬────────┘           └──────────────────┬──────────────────┘           └────────┬─────────┘
         │                                       │                                       │
         │  1. TCP SYN :9100                     │                                       │
         ├──────────────────────────────────────►│                                       │
         │                                       │  2. Connect Socket :9100              │
         │                                       ├──────────────────────────────────────►│
         │                                       │                                       │
         │  3. RAW ESC/POS Bytes Payload         │  4. Forward Bytes + Copy to Storage   │
         ├──────────────────────────────────────►├──────────────────────────────────────►│
         │                                       │                                       │
         │  5. Printer Responses / FIN           │  6. Relay Response                    │
         │◄──────────────────────────────────────┼◄──────────────────────────────────────┘
```

---

## Key Technical Subsystems

### 1. Zero-Latency Proxy Core (`LocalTcpPrintProxyServer.kt`)
- **Nagle's Algorithm Disabled (`tcpNoDelay = true`)**: Eliminates TCP 200ms segment buffering delays to deliver instantaneous receipt output.
- **Buffer Allocation**: Uses 64 KB (`65,536 bytes`) socket send/receive buffers and a 100-connection TCP backlog queue.
- **Asynchronous Storage Yielding**: ByteArray payload capture is written asynchronously off the main thread so network forwarding speed is never degraded by disk I/O.

### 2. ESC/POS Stream Interpreter (`EscPosParser.kt`)
- Interprets raw ESC/POS binary command streams (`0x1B`, `0x1D`, `0x10` sequences).
- Extracts font styling (Bold, Double-Size), text alignment (Left, Center, Right), line feeds, and paper cuts (`GS V` / `ESC i`).
- Renders a styled **Virtual Thermal Paper Receipt Card** inside Jetpack Compose.

### 3. Persistent Offline Spooler Queue (`PrintSpoolerEngine.kt`)
- Handles printer outages (out-of-paper, disconnected Ethernet, or power loss) by capturing incoming POS payloads in private disk storage (`spooler_queue/`).
- Returns clean TCP responses to POS software to prevent POS crash/error dialogs.
- Background worker polls hardware every 10 seconds and automatically flushes queued receipts in exact chronological sequence upon recovery.

### 4. Embedded Web Management Server (`EmbeddedWebServer.kt`)
- Runs a 24/7 pure `ServerSocket` HTTP web server on Port `9101`.
- Serves a responsive dark-mode Web Dashboard (`http://<tablet-ip>:9101`) for local Wi-Fi managers.
- Exposes REST API endpoints:
  - `GET /api/status` - Live telemetry and capture counts.
  - `GET /api/export-zip` - Downloads bundled ZIP archives containing `.raw` files, `.json` metadata, and `audit_events.json`.

### 5. 24/7 Service Resilience & Watchdog (`PrintGuardService.kt` & `WatchdogReceiver.kt`)
- **Low-Latency Wi-Fi Lock (`WIFI_MODE_FULL_LOW_LATENCY`)**: Disables 802.11 Wi-Fi DTIM sleep.
- **Process Wi-Fi Binding**: Uses `ConnectivityManager.bindProcessToNetwork(TRANSPORT_WIFI)` to bypass cellular DNS lookup stalls.
- **Self-Healing Watchdog**: Combines a 15-second Coroutine Watchdog loop with `AlarmManager.setExactAndAllowWhileIdle()` to guarantee 24/7 execution even in Android Deep Doze mode.

---

## Security & Access Control

- **Admin PIN Verification**: Critical lifecycle actions (Stopping Service, Modifying Auto-Start on Boot, Updating PIN) are protected by a configurable Admin PIN (`1011`).
- **Device Admin Protection (`AdminReceiver.kt`)**: Binds app as an active Android Device Administrator to prevent unauthorized uninstallation or force-close via settings.
- **Security Audit Logging (`DiskAuditRepository.kt`)**: Logged security events (`PIN_VERIFICATION_FAILED`, `SERVICE_STOPPED`, `CONFIG_UPDATED`) are saved to `audit_events.json` and included in exported ZIP archives.
