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

const targetPort =
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
console.log(`  Local COM Port   : ${targetPort} @ ${BAUD_RATE} baud`);
console.log(`  Auth Token       : ${bridgeSecret ? "Configured (Secure)" : "None (Public Mode)"}`);
console.log("============================================================\n");

let activePort = null;
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
      __port: `${targetPort} (Bridge)`,
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

function connectPort() {
  if (isReconnecting) return;

  console.log(`[Serial] Connecting to ${targetPort}...`);

  activePort = new SerialPort({
    path: targetPort,
    baudRate: BAUD_RATE,
    autoOpen: false,
    hupcl: false,
  });

  parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

  activePort.open(async (err) => {
    if (err) {
      console.error(`[Serial] Could not open ${targetPort}: ${err.message}`);
      const available = await listPorts();
      if (available.length > 0) {
        console.log("Available COM Ports on this machine:");
        available.forEach((p) => {
          console.log(`  - ${p.path} (${p.manufacturer || "Generic"} - ${p.friendlyName || ""})`);
        });
      } else {
        console.log("No COM ports currently detected. Please plug in the ESP32 Gateway USB cable.");
      }
      scheduleReconnect();
      return;
    }

    try {
      activePort.set({ dtr: false, rts: false }, () => {});
    } catch {}

    console.log(`[Serial] ✓ Connected to ${targetPort} @ ${BAUD_RATE} baud.`);
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
      console.warn(`[Serial] Connection to ${targetPort} closed.`);
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
  parser = null;
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.log(`[Serial] Retrying connection to ${targetPort} in 3 seconds...`);
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
