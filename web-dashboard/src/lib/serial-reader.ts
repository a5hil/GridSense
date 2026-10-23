import { SerialPort, ReadlineParser } from "serialport";
import { telemetryStore } from "./telemetry-state";

interface GlobalSerialState {
  activeSerialPort: SerialPort | null;
  parser: ReadlineParser | null;
  isReconnecting: boolean;
  configuredPortName: string;
  hasAutoInitialized: boolean;
  lastErrorPort: string;
  pollTimer: NodeJS.Timeout | null;
}

const globalForSerial = globalThis as unknown as { __gridsense_serial?: GlobalSerialState };

if (!globalForSerial.__gridsense_serial) {
  globalForSerial.__gridsense_serial = {
    activeSerialPort: null,
    parser: null,
    isReconnecting: false,
    configuredPortName: process.env.SERIAL_PORT || "COM8",
    hasAutoInitialized: false,
    lastErrorPort: "",
    pollTimer: null,
  };
}

const state = globalForSerial.__gridsense_serial;

export async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || "Unknown",
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      friendlyName: p.friendlyName || p.path,
    }));
  } catch (err: any) {
    console.error("[SerialPort] Error listing ports:", err.message);
    return [];
  }
}

export async function connectSerialPort(
  portPath?: string,
  baudRate = 115200
): Promise<{ success: boolean; message: string; port?: string }> {
  try {
    // If already connected and port is active, return success without re-opening
    if (state.activeSerialPort && state.activeSerialPort.isOpen) {
      if (!portPath || state.activeSerialPort.path.toUpperCase() === portPath.toUpperCase()) {
        telemetryStore.setPortStatus(state.activeSerialPort.path, true, false);
        if (!state.pollTimer) {
          state.pollTimer = setInterval(() => {
            if (state.activeSerialPort && state.activeSerialPort.isOpen) {
              state.activeSerialPort.write("t\n", () => {});
            }
          }, 3000);
        }
        state.activeSerialPort.write("t\n", () => {});
        return {
          success: true,
          message: `Already connected to ${state.activeSerialPort.path}`,
          port: state.activeSerialPort.path,
        };
      }
      await disconnectSerialPort();
    }

    // Determine target port (preferring COM8 or configured name)
    let targetPort = portPath || state.configuredPortName;
    const availablePorts = await listAvailablePorts();

    if (!targetPort || !availablePorts.some((p) => p.path.toUpperCase() === targetPort.toUpperCase())) {
      const com8Port = availablePorts.find((p) => p.path.toUpperCase() === "COM8");
      if (com8Port) {
        targetPort = com8Port.path;
      } else {
        const likelyPort = availablePorts.find(
          (p) =>
            p.manufacturer?.toLowerCase().includes("espressif") ||
            p.manufacturer?.toLowerCase().includes("silicon") ||
            p.manufacturer?.toLowerCase().includes("wch") ||
            p.manufacturer?.toLowerCase().includes("ch340") ||
            p.friendlyName?.toLowerCase().includes("cp210") ||
            p.friendlyName?.toLowerCase().includes("ch340") ||
            p.friendlyName?.toLowerCase().includes("usb-serial") ||
            (p.friendlyName?.toLowerCase().includes("usb") && !p.manufacturer?.toLowerCase().includes("microsoft"))
        );
        if (likelyPort) {
          targetPort = likelyPort.path;
        }
      }
    }

    if (!targetPort) {
      telemetryStore.setPortStatus("DISCONNECTED", false, false);
      return {
        success: false,
        message: "No USB Gateway serial port found. Connect ESP32-S3.",
      };
    }

    state.configuredPortName = targetPort;

    // Create SerialPort instance with hupcl: false to prevent resetting the ESP32 on close
    state.activeSerialPort = new SerialPort({
      path: targetPort,
      baudRate: baudRate,
      autoOpen: false,
      hupcl: false,
    });

    state.parser = state.activeSerialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

    return new Promise((resolve) => {
      state.activeSerialPort!.open((err) => {
        if (err) {
          const isAccessDenied = err.message.toLowerCase().includes("access denied");
          const userFriendlyMsg = isAccessDenied
            ? `Port ${targetPort} is locked by another app (e.g. Arduino IDE Serial Monitor). Close the Serial Monitor to connect.`
            : `Could not open ${targetPort}: ${err.message}`;

          if (state.lastErrorPort !== targetPort + err.message) {
            state.lastErrorPort = targetPort + err.message;
            console.warn(`[SerialPort] ${userFriendlyMsg}`);
            telemetryStore.addEventLog({
              level: "WARN",
              source: "SERIAL",
              message: userFriendlyMsg,
            });
          }
          telemetryStore.setPortStatus(targetPort, false, false);
          handleReconnect();
          resolve({
            success: false,
            message: userFriendlyMsg,
          });
          return;
        }

        // Prevent ESP32-S3 hardware reset by holding DTR/RTS low
        try {
          state.activeSerialPort!.set({ dtr: false, rts: false }, () => {});
        } catch {}

        console.log(`[SerialPort] Connected to Gateway on ${targetPort} @ ${baudRate} baud.`);
        telemetryStore.stopSimulation();
        telemetryStore.setPortStatus(targetPort, true, false);
        telemetryStore.addEventLog({
          level: "INFO",
          source: "SERIAL",
          message: `Gateway connected on ${targetPort} @ ${baudRate} baud (Live Hardware Bus)`,
        });

        // Line parser listener
        state.parser!.on("data", (line: string) => {
          handleIncomingLine(line);
        });

        // Start periodic 3s telemetry poll to gateway to prevent inactivity timeout
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.pollTimer = setInterval(() => {
          if (state.activeSerialPort && state.activeSerialPort.isOpen) {
            state.activeSerialPort.write("t\n", () => {});
          }
        }, 3000);

        state.activeSerialPort!.on("close", () => {
          if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
          }
          console.warn(`[SerialPort] Connection to ${targetPort} closed.`);
          telemetryStore.setPortStatus("DISCONNECTED", false, false);
          telemetryStore.addEventLog({
            level: "WARN",
            source: "SERIAL",
            message: `Serial connection closed on ${targetPort}`,
          });
          state.activeSerialPort = null;
          state.parser = null;
          handleReconnect();
        });

        state.activeSerialPort!.on("error", (portErr) => {
          console.error(`[SerialPort] Error on ${targetPort}: ${portErr.message}`);
          telemetryStore.addEventLog({
            level: "ERROR",
            source: "SERIAL",
            message: `Serial error on ${targetPort}: ${portErr.message}`,
          });
          try {
            if (state.activeSerialPort && state.activeSerialPort.isOpen) {
              state.activeSerialPort.close();
            }
          } catch {}
          if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
          }
          state.activeSerialPort = null;
          state.parser = null;
          telemetryStore.setPortStatus("DISCONNECTED", false, false);
          handleReconnect();
        });

        resolve({
          success: true,
          message: `Connected to ${targetPort} @ ${baudRate} baud`,
          port: targetPort,
        });
      });
    });
  } catch (err: any) {
    handleReconnect();
    return { success: false, message: err.message };
  }
}

export async function disconnectSerialPort() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.activeSerialPort) {
    return new Promise<void>((resolve) => {
      try {
        if (state.activeSerialPort!.isOpen) {
          state.activeSerialPort!.close(() => {
            state.activeSerialPort = null;
            state.parser = null;
            telemetryStore.setPortStatus("DISCONNECTED", false, false);
            resolve();
          });
          return;
        }
      } catch {}
      state.activeSerialPort = null;
      state.parser = null;
      telemetryStore.setPortStatus("DISCONNECTED", false, false);
      resolve();
    });
  }
}

export async function sendSerialCommand(command: string): Promise<boolean> {
  if (!state.activeSerialPort || !state.activeSerialPort.isOpen) {
    return false;
  }
  return new Promise((resolve) => {
    state.activeSerialPort!.write(command + "\n", (err) => {
      if (err) {
        console.error("[SerialPort] Failed to send command:", err.message);
        resolve(false);
      } else {
        console.log(`[SerialPort] Sent command to Gateway: ${command}`);
        telemetryStore.addEventLog({
          level: "INFO",
          source: "SERIAL_CMD",
          message: `Dispatched command to Gateway: '${command.trim()}'`,
        });
        resolve(true);
      }
    });
  });
}

let serialChunkBuffer = "";

function handleIncomingLine(raw: string) {
  const line = raw.trim();
  if (!line) return;

  // Detect gateway heartbeats to keep connection active even before node packets arrive
  if (line.includes("[GW HEARTBEAT]") || line.includes("[GW_INIT]")) {
    telemetryStore.recordGatewayHeartbeat();
    serialChunkBuffer = "";
    return;
  }

  // Ignore gateway diagnostic banners, logs, and RF debug prints
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

  // Combine with previously buffered fragment if a packet was split across serial chunks
  const candidate = serialChunkBuffer.length > 0 ? serialChunkBuffer + line : line;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start !== -1) {
    if (end > start) {
      // Validate that all opening and closing braces balance before attempting parse
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

      // Braces are completely balanced: parse the full telemetry frame
      if (openBraces === 0) {
        try {
          const parsed = JSON.parse(candidate.substring(start, end + 1));
          serialChunkBuffer = "";
          if (
            parsed &&
            typeof parsed === "object" &&
            ("gw_ms" in parsed || "p1" in parsed || "type" in parsed)
          ) {
            telemetryStore.ingestRawJson(parsed, "SERIAL");
          }
          return;
        } catch {
          // Fall through to retain buffer if still partially corrupted
        }
      }
    }

    // If candidate has an opening brace but hasn't closed yet, retain in buffer (up to 2048 chars)
    if (candidate.length < 2048) {
      serialChunkBuffer = candidate;
    } else {
      serialChunkBuffer = "";
    }
  }
}

function handleReconnect() {
  if (state.isReconnecting || !state.configuredPortName) return;
  state.isReconnecting = true;
  setTimeout(async () => {
    state.isReconnecting = false;
    if (!state.activeSerialPort || !state.activeSerialPort.isOpen) {
      await connectSerialPort(state.configuredPortName);
    }
  }, 3000);
}

// Auto-initialize background attempt ONCE across Next.js dev reloads
if (typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build") {
  if (!state.hasAutoInitialized) {
    state.hasAutoInitialized = true;
    listAvailablePorts().then((ports) => {
      if (ports.length > 0) {
        console.log(`[SerialPort] Detected ${ports.length} COM port(s):`, ports.map((p) => p.path));
        connectSerialPort();
      }
    });
  }
}
