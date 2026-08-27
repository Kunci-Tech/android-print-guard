# 🛡️ Kunci Print Guard & Audit Synthesizer Suite

> **Production-Ready Android Local TCP Print Proxy, RAW ESC/POS Capture Engine, and Client-Side ReactJS POS Reconciliation & Threat Analyzer.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Kotlin](https://img.shields.io/badge/Kotlin-1.9.0-purple.svg)](https://kotlinlang.org/)
[![Android API](https://img.shields.io/badge/API-24%2B-green.svg)](https://developer.android.com)
[![React](https://img.shields.io/badge/ReactJS-19.0-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)

**Kunci Print Guard** is a 24/7 background Android proxy application and ReactJS audit suite designed for Point-of-Sale (POS) reliability and anti-fraud auditing. It intercepts, logs, verifies, and reconciles every printed physical receipt in real-time between POS applications (e.g. Luna POS) and thermal receipt printers (e.g. Epson TM-T82XII).

---

## 🏗️ Repository Architecture

This monorepo contains two primary components:

```text
android-print-guard/
├── app/                        # Android Native App (Kotlin, API 24+)
│   ├── data/                   # 5,000-job rolling buffer & Disk Capture Repository
│   ├── network/                # In-line TCP Proxy (:9100) & Embedded Web Server (:9101)
│   ├── parser/                 # Binary ESC/POS Stream Interpreter
│   ├── spooler/                # Offline Failover Queue & Watchdog Engine
│   └── ui/                     # Jetpack Compose Management UI & Admin PIN Security
│
└── audit-analyzer-web/         # ReactJS Web Audit Dashboard (Vite + TypeScript)
    ├── src/components/         # Reconciliation, Itemized Sales, Order Directory & Inspectors
    ├── src/utils/              # ESC/POS Synthesizer, 2-Way S3/POS Auto-Grab & ZIP Parser
    └── src/types/              # Audit & Reconciliation Data Schemas
```

---

## 🌟 Key Features

### 📱 Android Proxy App (`app/`)
- **⚡ Zero-Latency TCP Proxy (`:9100`)**: Disables Nagle's algorithm (`tcpNoDelay = true`) for instantaneous, 0ms buffer receipt output.
- **🧾 ESC/POS Stream Interpreter**: Parses raw binary ESC/POS formatting (`ESC E` bold, `ESC a` alignment, `GS V` paper cut) into a pixel-perfect Virtual Thermal Paper Receipt Card.
- **📦 5,000-Job Rolling Storage Buffer**: Retains up to 5,000 receipts (250 MB capacity) on local tablet storage, preventing early purging of morning shift receipts.
- **🛡️ Offline Spooler & Queue Failover**: Safely holds receipt payloads when the printer is offline or out of paper, automatically flushing queued jobs in exact order when the printer recovers.
- **🌐 Embedded Web Server (`:9101`)**: Serve live telemetry and downloadable `.ZIP` diagnostic archives remotely over Wi-Fi.
- **🔒 PIN-Protected Administration**: Admin PIN protection (`1011`) for stopping service or changing policies. Device Admin integration prevents unauthorized uninstallation.

### 💻 React Audit Analyzer Web App (`audit-analyzer-web/`)
- **🚨 POS Reconciliation & Threat Audit Engine**: Automatically parses **Daily Sales Summary Reports (`RINGKASAN PENJUALAN`)** and compares them against the sum of canonical customer bills (`KK`), alerting management to missing morning shift receipts or deleted POS orders.
- **🛍️ Itemized Product Sales Summary**: Extracts exact item names, variants, and quantities (e.g. `Matcha (Iced / Freshmilk)`, `Kunci Bagel - Bagel Original`), excluding duplicate kitchen/bar ticket copies.
- **📋 POS Order Master Directory**: Groups captures by Order ID (`POS-XXXXXX-XX`), linking all associated print copies and header metadata.
- **☁️ 2-Way Auto-Grab & Cloud Synchronization**: Fetch and parse backup archives via **AWS S3 / R2 / MinIO** URLs or direct **Android Proxy Wi-Fi Sync** (`:9101`).
- **📊 One-Click CSV Exporters**: Export Itemized Product Summaries, POS Order Directories, and Reconciliation Threat Reports.

---

## 📐 Network & Data Architecture

```text
                                [ Internet / Cloud S3 ]
                                           │
                              ┌────────────┴────────────┐
                              │ S3 Backup Storage       │
                              │ (presigned .zip archive)│
                              └────────────┬────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  React Audit Analyzer Web App               │
                    │  (http://localhost:5173 or Web Client)      │
                    └──────────────────────▲──────────────────────┘
                                           │ (HTTP / S3 Auto-Grab)
                                           │
┌──────────────────────────────────────────┴──────────────────────────────────────────┐
│ Local Wi-Fi Subnet (192.168.8.x)                                                    │
│                                                                                     │
│  ┌─────────────────────────┐     TCP :9100     ┌─────────────────────────────────┐  │
│  │ POS App (e.g. Luna POS) │ ────────────────> │ Android Print Guard Proxy       │  │
│  │ (Android Tablet)        │                   │ (Port 9100, 5000-job buffer)    │  │
│  └─────────────────────────┘                   └────────────────┬────────────────┘  │
│                                                                 │                   │
│                                                             TCP │ :9100             │
│                                                                 ▼                   │
│                                                ┌─────────────────────────────────┐  │
│                                                │ Thermal Printer (Epson TM-T82)  │  │
│                                                │ 192.168.8.225:9100              │  │
│                                                └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Running the React Web Audit Analyzer

```bash
# Navigate to web analyzer directory
cd audit-analyzer-web

# Install dependencies
npm install

# Run Vite development server
npm run dev

# Open browser at http://localhost:5173
```

To create a production build:
```bash
npm run build
```

### 2. Building & Deploying the Android App

#### Prerequisites
- Android Studio Hedgehog (2023.1.1+) or OpenJDK 17.
- Android device running API 24 (Android 7.0) or higher.

#### Build & Install via ADB

```bash
# Set Java 17 environment variable
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

# Assemble Debug APK
./gradlew assembleDebug

# Install onto connected Android tablet via ADB
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch Main Activity
/opt/homebrew/share/android-commandlinetools/platform-tools/adb shell am start -n com.kuncikuppi.printguard/.ui.MainActivity
```

---

## 📄 Documentation

For full architecture details, data flow diagrams, and ESC/POS payload specifications, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
