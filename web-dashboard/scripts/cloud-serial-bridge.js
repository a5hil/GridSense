#!/usr/bin/env node

/**
 * GridSense Cloud Serial Bridge
 * -------------------------------------------------------------
 * Bridges local physical ESP32 gateway USB COM port to remote
 * Render/Cloud hosted GridSense dashboard.
 *
 * Usage:
 *   node scripts/cloud-serial-bridge.js <REMOTE_URL> [COM_PORT] [SECRET_TOKEN]
 *
 * Examples:
 *   node scripts/cloud-serial-bridge.js https://gridsense.onrender.com COM8
 *   npm run bridge -- https://gridsense.onrender.com COM8
 */

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

// Configuration from CLI arguments or environment variables
const targetUrl = (
  process.argv[2] ||
  process.env.REMOTE_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const configuredPort =
  process.argv[3] || process.env.SERIAL_PORT || "COM8";

const bridgeSecret =
  process.argv[4] || process.env.BRIDGE_SECRET || "";

const BAUD_RATE = 115200;
const INGEST_PATH = "/api/telemetry/ingest";
const INGEST_URL = `${targetUrl}${INGEST_PATH}`;

console.log("\n============================================================");
console.log("  ⚡ GridSense SCADA Cloud Serial Bridge");
console.log("============================================================");
console.log(`  Target Cloud URL : ${targetUrl}`);
console.log(`  Ingest Endpoint  : ${INGEST_URL}`);
console.log(`  Configured Port  : ${configuredPort} (Auto-detection enabled)`);
console.log(`  Baud Rate        : ${BAUD_RATE}`);
console.log(`  Auth Token       : ${bridgeSecret ? "Configured (Secure)" : "None (Public Mode)"}`);
console.log("============================================================\n");

let activePort = null;
let currentConnectedPort = null;
let parser = null;
let pollTimer = null;
let packetCount = 0;
let isReconnecting = false;
let serialChunkBuffer = "";

async function checkRemoteEndpoint() {
  try {
    const res = await fetch(INGEST_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[Cloud] Connected! Server status: ${data.status || "OK"} (Active Port: ${data.activePort || "None"})`);
    } else {
      console.warn(`[Cloud] Endpoint returned HTTP ${res.status}. Requests will be attempted anyway.`);
    }
  } catch (err) {
    console.warn(`[Cloud] Server currently unreachable at ${targetUrl} (${err.message}). Will retry as packets arrive.`);
  }
}

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (e) {
    return [];
  }
}

async function forwardTelemetry(payload) {
  try {
    packetCount++;
    const headers = { "Content-Type": "application/json" };
    if (bridgeSecret) {
      headers["x-bridge-token"] = bridgeSecret;
    }

    const enhancedPayload = {
      ...payload,
      __port: `${currentConnectedPort || configuredPort} (Bridge)`,
    };

    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(enhancedPayload),
    });

    const time = new Date().toLocaleTimeString();

    if (res.ok) {
      if (payload.type === "LAST_GASP") {
        console.log(`🚨 [Bridge #${packetCount}] ${time} | LAST GASP OUTAGE ALERT FORWARDED! (HTTP ${res.status})`);
      } else if (payload.fault && payload.fault !== "NORMAL" && payload.fault !== "FAULT_NONE") {
        console.log(`⚠️  [Bridge #${packetCount}] ${time} | FAULT ALERT: ${payload.fault} (HTTP ${res.status})`);
      } else if (payload.p1 && payload.p2) {
        const v1 = Number(payload.p1.v || 0).toFixed(1);
        const v2 = Number(payload.p2.v || 0).toFixed(1);
        const i1 = Number(payload.p1.i || 0).toFixed(2);
        const i2 = Number(payload.p2.i || 0).toFixed(2);
        const idiff = Number(payload.idiff || 0).toFixed(3);
        console.log(
          `⚡ [Bridge #${packetCount}] ${time} | P1: ${v1}V ${i1}A | P2: ${v2}V ${i2}A | ΔI: ${idiff}A (HTTP ${res.status})`
        );
      } else {
        console.log(`[Bridge #${packetCount}] ${time} | Telemetry frame forwarded (HTTP ${res.status})`);
      }
    } else {
      const errText = await res.text();
      console.error(`❌ [Bridge #${packetCount}] HTTP ${res.status} Error from Cloud: ${errText}`);
    }
  } catch (err) {
    console.error(`❌ [Bridge #${packetCount}] Network dispatch error: ${err.message}`);
  }
}

function handleIncomingLine(raw) {
  const line = raw.trim();
  if (!line) return;

  // Ignore gateway diagnostic banners and non-JSON logs
  if (
    line.startsWith("[") ||
    line.startsWith("=") ||
    line.startsWith("-") ||
    line.startsWith("*") ||
    line.startsWith("Pole") ||
    line.startsWith("Inter-Pole")
  ) {
    serialChunkBuffer = "";
    return;
  }

  const candidate = serialChunkBuffer.length > 0 ? serialChunkBuffer + line : line;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start !== -1) {
    if (end > start) {
      let openBraces = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i <= end; i++) {
        const ch = candidate[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === "{") openBraces++;
          else if (ch === "}") openBraces--;
        }
      }

      if (openBraces === 0) {
        try {
          const parsed = JSON.parse(candidate.substring(start, end + 1));
          serialChunkBuffer = "";
          if (
            parsed &&
            typeof parsed === "object" &&
            ("gw_ms" in parsed || "p1" in parsed || "type" in parsed)
          ) {
            forwardTelemetry(parsed);
          }
          return;
        } catch {}
      }
    }

    if (candidate.length < 2048) {
      serialChunkBuffer = candidate;
    } else {
      serialChunkBuffer = "";
    }
  }
}

async function resolveTargetPort() {
  const available = await listPorts();
  if (available.length === 0) return configuredPort;

  // 1. If configured port is present, use it directly
  const exact = available.find(
    (p) => p.path.toUpperCase() === configuredPort.toUpperCase()
  );
  if (exact) return exact.path;

  // 2. Otherwise auto-detect ESP32 / Gateway serial chipset
  const likely = available.find(
    (p) =>
      p.manufacturer?.toLowerCase().includes("espressif") ||
      p.manufacturer?.toLowerCase().includes("silicon") ||
      p.manufacturer?.toLowerCase().includes("wch") ||
      p.manufacturer?.toLowerCase().includes("ch340") ||
      p.friendlyName?.toLowerCase().includes("cp210") ||
      p.friendlyName?.toLowerCase().includes("ch340") ||
      p.friendlyName?.toLowerCase().includes("usb-serial") ||
      (p.friendlyName?.toLowerCase().includes("usb") &&
        !p.manufacturer?.toLowerCase().includes("microsoft"))
  );

  if (likely) {
    console.log(`[Serial] Auto-detected ESP32 Gateway on ${likely.path} (${likely.friendlyName || likely.manufacturer})`);
    return likely.path;
  }

  // 3. If only one COM port is available on the machine, select it
  if (available.length === 1) {
    console.log(`[Serial] Auto-selected single available port: ${available[0].path}`);
    return available[0].path;
  }

  return configuredPort;
}

async function connectPort() {
  if (isReconnecting) return;

  const activePortPath = await resolveTargetPort();
  console.log(`[Serial] Connecting to ${activePortPath}...`);

  activePort = new SerialPort({
    path: activePortPath,
    baudRate: BAUD_RATE,
    autoOpen: false,
    hupcl: false,
  });

  parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

  activePort.open(async (err) => {
    if (err) {
      console.error(`[Serial] Could not open ${activePortPath}: ${err.message}`);
      const available = await listPorts();
      if (available.length > 0) {
        console.log("Available COM Ports on this machine:");
        available.forEach((p) => {
          console.log(`  - ${p.path} (${p.manufacturer || "Generic"} - ${p.friendlyName || ""})`);
        });
        console.log(`\n💡 Tip: You can specify any port: npm run bridge -- ${targetUrl} <PORT_NAME>\n`);
      } else {
        console.log("No COM ports currently detected. Please plug in the ESP32 Gateway USB cable.");
      }
      scheduleReconnect();
      return;
    }

    try {
      activePort.set({ dtr: false, rts: false }, () => {});
    } catch {}

    currentConnectedPort = activePortPath;
    console.log(`[Serial] ✓ Connected to ${activePortPath} @ ${BAUD_RATE} baud.`);
    console.log("[Bridge] Listening for ESP32 packets and forwarding to Cloud...\n");

    parser.on("data", (line) => {
      handleIncomingLine(line);
    });

    // Keep ESP32 Gateway streaming by polling every 3 seconds
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (activePort && activePort.isOpen) {
        activePort.write("t\n", () => {});
      }
    }, 3000);

    activePort.on("close", () => {
      console.warn(`[Serial] Connection to ${currentConnectedPort || configuredPort} closed.`);
      cleanup();
      scheduleReconnect();
    });

    activePort.on("error", (e) => {
      console.error(`[Serial] Port error: ${e.message}`);
      cleanup();
      scheduleReconnect();
    });
  });
}

function cleanup() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (activePort) {
    try {
      if (activePort.isOpen) activePort.close();
    } catch {}
    activePort = null;
  }
  currentConnectedPort = null;
  parser = null;
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.log(`[Serial] Retrying connection in 3 seconds...`);
  setTimeout(() => {
    isReconnecting = false;
    connectPort();
  }, 3000);
}

// Graceful termination
process.on("SIGINT", () => {
  console.log("\n[Bridge] Stopping cloud serial bridge. Goodbye!");
  cleanup();
  process.exit(0);
});

// Start up
(async () => {
  await checkRemoteEndpoint();
  connectPort();
})();
