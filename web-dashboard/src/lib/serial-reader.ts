import { SerialPort, ReadlineParser } from "serialport";
import { telemetryStore } from "./telemetry-state";

export interface PortConnection {
  path: string;
  port: SerialPort;
  parser: ReadlineParser;
  isGateway: boolean;
  buffer: string;
}

interface GlobalSerialState {
  connections: Map<string, PortConnection>;
  isReconnecting: boolean;
  configuredPortName: string;
  hasAutoInitialized: boolean;
  pollTimer: NodeJS.Timeout | null;
  lastErrorPorts: Set<string>;
}

const globalForSerial = globalThis as unknown as { __gridsense_serial?: GlobalSerialState };

if (!globalForSerial.__gridsense_serial) {
  globalForSerial.__gridsense_serial = {
    connections: new Map<string, PortConnection>(),
    isReconnecting: false,
    configuredPortName: process.env.SERIAL_PORT || "COM8",
    hasAutoInitialized: false,
    pollTimer: null,
    lastErrorPorts: new Set<string>(),
  };
}

const state = globalForSerial.__gridsense_serial;

/**
 * Identify if a serial device is an ESP32 or USB-UART converter (CP210x, CH340, WCH, etc.)
 */
function isLikelyESP32Port(p: { path: string; manufacturer?: string; friendlyName?: string }): boolean {
  const m = (p.manufacturer || "").toLowerCase();
  const f = (p.friendlyName || "").toLowerCase();
  const path = p.path.toUpperCase();

  // Known active testbed ports
  if (path === "COM7" || path === "COM8" || path === "COM9") return true;

  return (
    m.includes("espressif") ||
    m.includes("silicon") ||
    m.includes("wch") ||
    m.includes("ch340") ||
    f.includes("cp210") ||
    f.includes("ch340") ||
    f.includes("usb-serial") ||
    f.includes("usb serial") ||
    (f.includes("usb") && !m.includes("microsoft"))
  );
}

/**
 * List all available COM ports with active connection metadata
 */
export async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => {
      const upper = p.path.toUpperCase();
      const conn = state.connections.get(upper);
      return {
        path: p.path,
        manufacturer: p.manufacturer || "Unknown",
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
        friendlyName: p.friendlyName || p.path,
        isOpen: conn ? conn.port.isOpen : false,
        isGateway: conn ? conn.isGateway : false,
      };
    });
  } catch (err: any) {
    console.error("[SerialPort] Error listing ports:", err.message);
    return [];
  }
}

/**
 * Update the telemetryStore with the current aggregated port status
 */
function syncPortStatus() {
  const openConns = Array.from(state.connections.values()).filter((c) => c.port.isOpen);

  if (openConns.length > 0) {
    const gatewayConn = openConns.find((c) => c.isGateway);
    const names = openConns.map((c) => c.path).join(", ");
    const summary = gatewayConn
      ? `${gatewayConn.path} [GW] + ${openConns.filter((c) => c.path !== gatewayConn.path).map((c) => c.path).join(", ")}`
      : `${names} (${openConns.length} Nodes Connected)`;

    telemetryStore.setPortStatus(summary, true, false);
    ensurePollTimer();
  } else {
    telemetryStore.setPortStatus("DISCONNECTED", false, false);
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }
}

/**
 * Periodic poll timer to prompt Gateway for fresh telemetry frames
 */
function ensurePollTimer() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(() => {
    for (const conn of state.connections.values()) {
      if (conn.port.isOpen) {
        conn.port.write("t\n", () => {});
      }
    }
  }, 3000);
}

/**
 * Open a single serial port connection
 */
async function connectSinglePort(
  targetPath: string,
  baudRate = 115200
): Promise<{ success: boolean; message: string; port: string }> {
  const upper = targetPath.toUpperCase();
  const existing = state.connections.get(upper);
  if (existing && existing.port.isOpen) {
    return {
      success: true,
      message: `Already connected to ${targetPath}`,
      port: targetPath,
    };
  }

  return new Promise((resolve) => {
    const port = new SerialPort({
      path: targetPath,
      baudRate,
      autoOpen: false,
      hupcl: false,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    const conn: PortConnection = {
      path: targetPath,
      port,
      parser,
      isGateway: false,
      buffer: "",
    };

    port.open((err) => {
      if (err) {
        const isAccessDenied = err.message.toLowerCase().includes("access denied");
        const msg = isAccessDenied
          ? `Port ${targetPath} is locked by another app (e.g. Arduino IDE). Close Serial Monitor to connect.`
          : `Could not open ${targetPath}: ${err.message}`;

        if (!state.lastErrorPorts.has(targetPath + err.message)) {
          state.lastErrorPorts.add(targetPath + err.message);
          console.warn(`[SerialPort] ${msg}`);
          telemetryStore.addEventLog({
            level: "WARN",
            source: "SERIAL",
            message: msg,
          });
        }
        resolve({ success: false, message: msg, port: targetPath });
        return;
      }

      // Prevent ESP32-S3 hardware reset on connect
      try {
        port.set({ dtr: false, rts: false }, () => {});
      } catch {}

      state.connections.set(upper, conn);
      console.log(`[SerialPort] Successfully opened ${targetPath} @ ${baudRate} baud.`);
      telemetryStore.stopSimulation();
      syncPortStatus();

      telemetryStore.addEventLog({
        level: "INFO",
        source: "SERIAL",
        message: `Hardware node linked on ${targetPath} @ ${baudRate} baud`,
      });

      parser.on("data", (line: string) => {
        handleIncomingLine(line, conn);
      });

      port.on("close", () => {
        console.warn(`[SerialPort] Connection to ${targetPath} closed.`);
        state.connections.delete(upper);
        syncPortStatus();
        telemetryStore.addEventLog({
          level: "WARN",
          source: "SERIAL",
          message: `Serial connection closed on ${targetPath}`,
        });
        triggerReconnect();
      });

      port.on("error", (portErr) => {
        console.error(`[SerialPort] Error on ${targetPath}: ${portErr.message}`);
        try {
          if (port.isOpen) port.close();
        } catch {}
        state.connections.delete(upper);
        syncPortStatus();
        triggerReconnect();
      });

      resolve({ success: true, message: `Connected to ${targetPath}`, port: targetPath });
    });
  });
}

/**
 * Connect to serial port(s).
 * If portPath is specified, connects that specific port.
 * If omitted, auto-discovers and connects ALL candidate ESP32 nodes (e.g., COM7, COM8, COM9).
 */
export async function connectSerialPort(
  portPath?: string,
  baudRate = 115200
): Promise<{ success: boolean; message: string; port?: string }> {
  try {
    if (portPath) {
      return await connectSinglePort(portPath, baudRate);
    }

    const availablePorts = await listAvailablePorts();
    const candidatePorts = availablePorts.filter(isLikelyESP32Port);

    if (candidatePorts.length === 0) {
      syncPortStatus();
      return {
        success: false,
        message: "No ESP32 serial ports found. Connect ESP32-S3 nodes via USB.",
      };
    }

    const results = await Promise.all(
      candidatePorts.map((p) => connectSinglePort(p.path, baudRate))
    );

    const connected = results.filter((r) => r.success);
    syncPortStatus();

    if (connected.length > 0) {
      return {
        success: true,
        message: `Connected to ${connected.length} hardware node(s): ${connected.map((c) => c.port).join(", ")}`,
        port: connected.map((c) => c.port).join(", "),
      };
    } else {
      return {
        success: false,
        message: `Failed connecting to detected ports: ${results.map((r) => r.message).join("; ")}`,
      };
    }
  } catch (err: any) {
    triggerReconnect();
    return { success: false, message: err.message };
  }
}

/**
 * Disconnect specified port or all ports if omitted
 */
export async function disconnectSerialPort(portPath?: string) {
  if (portPath) {
    const upper = portPath.toUpperCase();
    const conn = state.connections.get(upper);
    if (conn && conn.port.isOpen) {
      await new Promise<void>((resolve) => {
        conn.port.close(() => {
          state.connections.delete(upper);
          syncPortStatus();
          resolve();
        });
      });
    }
    return;
  }

  // Close all
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  const conns = Array.from(state.connections.values());
  await Promise.all(
    conns.map(
      (c) =>
        new Promise<void>((resolve) => {
          if (c.port.isOpen) {
            c.port.close(() => resolve());
          } else {
            resolve();
          }
        })
    )
  );

  state.connections.clear();
  syncPortStatus();
}

/**
 * Broadcast an ASCII serial command to ALL open ESP32 serial connections.
 * This guarantees that Pole 1, Pole 2, and Gateway all receive the instruction.
 */
export async function sendSerialCommand(command: string): Promise<boolean> {
  const openConns = Array.from(state.connections.values()).filter((c) => c.port.isOpen);
  if (openConns.length === 0) {
    console.warn("[SerialPort] No active serial ports available to dispatch command:", command);
    return false;
  }

  const payload = command.trim() + "\n";
  const promises = openConns.map((conn) => {
    return new Promise<boolean>((resolve) => {
      conn.port.write(payload, (err) => {
        if (err) {
          console.error(`[SerialPort] Failed sending to ${conn.path}: ${err.message}`);
          resolve(false);
        } else {
          console.log(`[SerialPort] Dispatched '${command.trim()}' to ${conn.path}`);
          resolve(true);
        }
      });
    });
  });

  const results = await Promise.all(promises);
  const successCount = results.filter(Boolean).length;

  if (successCount > 0) {
    const targetNames = openConns.map((c) => c.path).join(", ");
    telemetryStore.addEventLog({
      level: "INFO",
      source: "SERIAL_CMD",
      message: `Dispatched command '${command.trim()}' to ${successCount} node(s) [${targetNames}]`,
    });
    return true;
  }
  return false;
}

/**
 * Process streaming lines received from an active connection
 */
function handleIncomingLine(raw: string, conn: PortConnection) {
  const line = raw.trim();
  if (!line) return;

  // Detect Gateway heartbeats / initialization
  if (line.includes("[GW HEARTBEAT]") || line.includes("[GW_INIT]")) {
    conn.isGateway = true;
    telemetryStore.recordGatewayHeartbeat();
    conn.buffer = "";
    syncPortStatus();
    return;
  }

  // Detect and surface EdgeNode serial feedback (e.g. "[CMD] Set MOCK3P_DIFFERENTIAL_FAULT")
  if (line.startsWith("[CMD]") || line.startsWith("[ALERT]")) {
    telemetryStore.addEventLog({
      level: "INFO",
      source: conn.path,
      message: line,
    });
    conn.buffer = "";
    return;
  }

  // Ignore noisy terminal banners or delimiters
  if (
    line.startsWith("=") ||
    line.startsWith("-") ||
    line.startsWith("*") ||
    line.startsWith("Pole") ||
    line.startsWith("Inter-Pole")
  ) {
    conn.buffer = "";
    return;
  }

  // Combine with buffered fragment if split across serial chunks
  const candidate = conn.buffer.length > 0 ? conn.buffer + line : line;
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

      // Braces are completely balanced: parse the telemetry frame
      if (openBraces === 0) {
        try {
          const parsed = JSON.parse(candidate.substring(start, end + 1));
          conn.buffer = "";
          if (
            parsed &&
            typeof parsed === "object" &&
            ("gw_ms" in parsed || "p1" in parsed || "type" in parsed)
          ) {
            conn.isGateway = true;
            syncPortStatus();
            telemetryStore.ingestRawJson(parsed, "SERIAL");
          }
          return;
        } catch {
          // Keep buffer if still partial
        }
      }
    }

    if (candidate.length < 4096) {
      conn.buffer = candidate;
    } else {
      conn.buffer = "";
    }
  }
}

function triggerReconnect() {
  if (state.isReconnecting) return;
  state.isReconnecting = true;
  setTimeout(async () => {
    state.isReconnecting = false;
    await connectSerialPort();
  }, 4000);
}

// Auto-initialize background multi-port link across Next.js dev reloads
if (typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build") {
  if (!state.hasAutoInitialized) {
    state.hasAutoInitialized = true;
    listAvailablePorts().then((ports) => {
      const candidates = ports.filter(isLikelyESP32Port);
      if (candidates.length > 0) {
        console.log(
          `[SerialPort] Auto-linking ${candidates.length} ESP32 COM port(s):`,
          candidates.map((p) => p.path)
        );
        connectSerialPort();
      }
    });
  }
}
