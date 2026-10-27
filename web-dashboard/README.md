# GridSense SCADA Web Dashboard ⚡

An advanced Next.js SCADA Operations Desk & Outage Management System (OMS) engineered for distribution feeder supervision, fault localization (ANSI 87L, 46BC, 27, 50/51), live GIS mapping, and automated Telegram lineman dispatch.

---

## 🚀 Quick Start (Clone & Run on Any System)

### 1. Prerequisites
* **Node.js**: v18.17+ or v20+ installed ([nodejs.org](https://nodejs.org/)).
* **Git**: Installed.

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/a5hil/GridSense.git
cd GridSense/web-dashboard

# Install all dependencies
npm install
```

### 3. Launch Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Portability & Zero-Config Architecture

GridSense was designed to run seamlessly on **any system (Windows, macOS, or Linux)** without requiring external cloud accounts or local databases:

| Subsystem | If Configured | Automatic Fallback (Zero Config) |
|---|---|---|
| **GIS Feeder Map** | Mapbox GL Satellite & Vector styles (`NEXT_PUBLIC_MAPBOX_TOKEN`) | Carto Dark Matter / Positron vector tiles (100% free, zero token required) |
| **Telemetry & Log Storage** | Local or Remote MongoDB (`MONGODB_URI`) | In-memory circular buffers (auto-activates if MongoDB service is offline) |
| **Hardware Serial Bridge** | Physical ESP32 Gateway on USB COM/TTY (`SERIAL_PORT`) | Embedded real-time SCADA simulation engine generating physical line physics |
| **Telegram Field Dispatch** | Bot Token & Chat ID in Settings UI | Safe no-op with in-app simulation logs |

---

## ⚙️ Environment Variables (Optional)

Copy `.env.example` to `.env.local` to override defaults:
```bash
cp .env.example .env.local
```

```env
# Optional: Mapbox Vector Map Token
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoi...

# Optional: MongoDB Database Connection
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=gridsense

# Optional: Hardware USB Serial Port
SERIAL_PORT=COM8
```

---

## 📦 Production Build

```bash
# Typecheck
npx tsc --noEmit

# Production Build
npm run build

# Start Production Server
npm start
```
Runs at [http://localhost:3000](http://localhost:3000).
