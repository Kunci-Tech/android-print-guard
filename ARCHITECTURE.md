# 🏛️ Kunci Print Guard Architecture & System Specification

This document details the software architecture, data pipelines, ESC/POS parsing rules, and security reconciliation model for **Kunci Print Guard** and **Print Guard Audit Synthesizer**.

---

## 1. System Overview & Core Principles

Kunci Print Guard is built around three core architectural tenets:

1. **Non-Invasive In-Line Proxying**: Operates as a transparent TCP socket relay (`:9100`). POS applications print to `localhost:9100` or `tablet-ip:9100` without requiring modification or root access.
2. **Deterministic Payload Persistence & Deduplication**: Captures every raw ESC/POS binary stream to local tablet storage (`MAX_JOBS = 5000`) and computes SHA-256 hashes to detect network retries and accidental button re-prints.
3. **Canonical Reconciliation & Threat Audit**: Elects single-source-of-truth customer receipts (`KK`), eliminating item double-counting from kitchen/bar ticket copies, and reconciles against POS **Daily Sales Summary Reports (`RINGKASAN PENJUALAN`)**.

---

## 2. Component Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Kunci Print Guard (Android Proxy App)                           │
│                                                                                        │
│  ┌────────────────────────┐    ┌────────────────────────┐    ┌──────────────────────┐  │
│  │ LocalTcpPrintProxy     │───>│ DiskCaptureRepository  │───>│ SpoolerEngine        │  │
│  │ (Port 9100, 0ms delay) │    │ (5,000-job storage)    │    │ (Offline Failover)   │  │
│  └────────────────────────┘    └────────────────────────┘    └──────────────────────┘  │
│               │                             │                           │              │
│               ▼                             ▼                           ▼              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Embedded HttpServer (Port 9101, HTTP REST & Bulk .ZIP Exporter)                  │  │
│  └──────────────────────────────────────────┬───────────────────────────────────────┘  │
└─────────────────────────────────────────────┼──────────────────────────────────────────┘
                                              │
                                   HTTP / S3 / .ZIP Archive
                                              │
┌─────────────────────────────────────────────▼──────────────────────────────────────────┐
│                   Print Guard Audit Synthesizer (ReactJS Web App)                      │
│                                                                                        │
│  ┌────────────────────────┐    ┌────────────────────────┐    ┌──────────────────────┐  │
│  │ ZIP & ESC/POS Parser   │───>│ Transaction Grouping   │───>│ Reconciliation Engine│  │
│  │ (JSZip + Stream Dec.)  │    │ (Canonical Bill)       │    │ (Daily Summary Gap)  │  │
│  └────────────────────────┘    └────────────────────────┘    └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Storage & Buffer Management

### Android Tablet Local Storage (`DiskCaptureRepository.kt`)
- **Location**: `context.filesDir/captures/`
- **File Structure**:
  - `receipt_YYYYMMDD_HHMMSS.raw`: Raw binary ESC/POS socket stream.
  - `receipt_YYYYMMDD_HHMMSS.json`: JSON metadata descriptor containing timestamp, source IP, target printer IP, byte count, and SHA-256 hash.
- **Storage Limits**:
  - `MAX_JOBS`: **5,000 jobs** (scaled from 100).
  - `MAX_BYTES_LIMIT`: **250 MB**.
- **Purge Strategy**: FIFO (First-In, First-Out) automatic cleanup when total jobs exceed 5,000 or 250 MB limit.

---

## 4. Transaction Grouping & Canonical Bill Election Algorithm

When a single POS transaction (e.g. `POS-250826-69`) is printed, the POS system generates multiple print jobs:
- 1 Customer Bill (`KK`)
- 1 Bar Ticket (`BAR`)
- 1 Kitchen Ticket (`KITCHEN`)

To prevent item quantities from being doubled or tripled:

```text
Step 1: Parse `Order Number : POS-XXXXXX-XX` from ASCII print stream.
Step 2: Group all captures sharing the same Order Number.
Step 3: Filter for customer bills containing `KK` header and pricing totals (`CUSTOMER_BILL`).
Step 4: Elect the Customer Bill with the largest payload size as the Canonical Source of Truth.
Step 5: Extract line items ONLY from the Canonical Customer Bill.
Step 6: Mark associated Bar/Kitchen tickets as linked print copies.
```

---

## 5. POS Daily Summary Reconciliation & Threat Detection

The reconciliation engine compares **Daily Sales Summary Reports (`RINGKASAN PENJUALAN`)** against the **Sum of Canonical Individual Bills**:

$$\text{Revenue Gap} = \text{Summary Total Revenue} - \text{Canonical Bills Revenue}$$

$$\text{Item Gap} = \text{Summary Total Items Sold} - \text{Canonical Bills Items Sold}$$

### Threat Classification Rules:
- **`GAP_MISSING_RECEIPTS`** ($\text{Item Gap} > 0$): Indicates missing morning shift receipts (if buffer was exceeded) or deleted POS database transactions.
- **`MATCH`** ($\text{Item Gap} = 0$): 100% reconciliation match between physical receipts and POS daily report.
- **`EXCESS_BILLS`** ($\text{Item Gap} < 0$): Unrecorded customer bills present in physical stream but missing from summary.

---

## 6. ESC/POS Command Parsing Matrix

| Command | Hex Sequence | Function | Parser Behavior |
| :--- | :--- | :--- | :--- |
| `ESC @` | `1B 40` | Initialize Printer | Resets text formatting state. |
| `ESC E n` | `1B 45 n` | Bold Mode On/Off | Toggles `font-weight: bold` in Virtual Preview. |
| `ESC a n` | `1B 61 n` | Justification (Left/Center/Right) | Sets `text-align` CSS property. |
| `GS ! n` | `1D 21 n` | Select character size | Applies double-width / double-height scaling. |
| `GS V m` | `1D 56 m` | Paper Cut | Inserts a visual dashed cut divider card. |
