import { SerialPort } from "serialport";
import { ReadlineParser } from "serialport";
import { telemetryStore } from "./telemetry-state";

let activeSerialPort: SerialPort | null = null;
let parser: ReadlineParser | null = null;
let isReconnecting = false;
let configuredPortName = process.env.SERIAL_PORT || "";

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
    // If already connected to this port, return success
    if (activeSerialPort && activeSerialPort.isOpen) {
      if (!portPath || activeSerialPort.path === portPath) {
        return {
          success: true,
          message: `Already connected to ${activeSerialPort.path}`,
          port: activeSerialPort.path,
        };
      }
      await disconnectSerialPort();
    }

    // If port not specified, try to find an available USB / ESP32 port
    let targetPort = portPath || configuredPortName;
    const availablePorts = await listAvailablePorts();

    if (!targetPort) {
      // Look for USB Serial ports (e.g., Silicon Labs, CH340, Espressif, USB-SERIAL)
      const likelyPort = availablePorts.find(
        (p) =>
          p.manufacturer?.toLowerCase().includes("espressif") ||
          p.manufacturer?.toLowerCase().includes("silicon") ||
          p.manufacturer?.toLowerCase().includes("wch") ||
          p.friendlyName?.toLowerCase().includes("usb") ||
          p.path.startsWith("COM")
      );
      if (likelyPort) {
        targetPort = likelyPort.path;
      }
    }

    if (!targetPort) {
      // No physical port found; inform operator
      telemetryStore.setPortStatus("DISCONNECTED", false, false);
      return {
        success: false,
        message: "No USB Gateway serial port found. Connect ESP32-S3 or use Simulator.",
      };
    }

    configuredPortName = targetPort;

    activeSerialPort = new SerialPort({
      path: targetPort,
      baudRate: baudRate,
      autoOpen: false,
    });

    parser = activeSerialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

    return new Promise((resolve) => {
      activeSerialPort!.open((err) => {
        if (err) {
          console.warn(`[SerialPort] Could not open ${targetPort}: ${err.message}`);
          telemetryStore.setPortStatus(targetPort, false, false);
          telemetryStore.addEventLog({
            level: "WARN",
            source: "SERIAL",
            message: `Failed to open ${targetPort}: ${err.message}`,
          });
          resolve({
            success: false,
            message: `Could not open ${targetPort}: ${err.message}`,
          });
          return;
        }

        console.log(`[SerialPort] Connected to Gateway on ${targetPort} @ ${baudRate} baud.`);
        telemetryStore.setPortStatus(targetPort, true, false);
        telemetryStore.addEventLog({
          level: "INFO",
          source: "SERIAL",
          message: `Gateway connected on ${targetPort} @ ${baudRate} baud`,
        });

        // Line parser listener
        parser!.on("data", (line: string) => {
          handleIncomingLine(line);
        });

        activeSerialPort!.on("close", () => {
          console.warn(`[SerialPort] Connection to ${targetPort} closed.`);
          telemetryStore.setPortStatus("DISCONNECTED", false, false);
          telemetryStore.addEventLog({
            level: "WARN",
            source: "SERIAL",
            message: `Serial connection closed on ${targetPort}`,
          });
          handleReconnect();
        });

        activeSerialPort!.on("error", (portErr) => {
          console.error(`[SerialPort] Error: ${portErr.message}`);
          telemetryStore.addEventLog({
            level: "ERROR",
            source: "SERIAL",
            message: `Serial error on ${targetPort}: ${portErr.message}`,
          });
        });

        resolve({
          success: true,
          message: `Connected to ${targetPort} @ ${baudRate} baud`,
          port: targetPort,
        });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function disconnectSerialPort() {
  if (activeSerialPort && activeSerialPort.isOpen) {
    return new Promise<void>((resolve) => {
      activeSerialPort!.close(() => {
        activeSerialPort = null;
        parser = null;
        telemetryStore.setPortStatus("DISCONNECTED", false, false);
        resolve();
      });
    });
  }
}

function handleIncomingLine(raw: string) {
  const line = raw.trim();
  if (!line) return;

  // Log non-JSON SCADA status lines if needed
  if (line.startsWith("[GW") || line.startsWith("===") || line.startsWith("Pole 1")) {
    // Hardware debug or console frame
    return;
  }

  // Attempt to parse JSON telemetry
  if (line.startsWith("{") && line.endsWith("}")) {
    try {
      const parsed = JSON.parse(line);
      telemetryStore.ingestRawJson(parsed);
    } catch (e: any) {
      console.warn(`[SerialPort] Malformed JSON: ${line}`);
    }
  }
}

function handleReconnect() {
  if (isReconnecting || !configuredPortName) return;
  isReconnecting = true;
  setTimeout(async () => {
    isReconnecting = false;
    if (!activeSerialPort || !activeSerialPort.isOpen) {
      await connectSerialPort(configuredPortName);
    }
  }, 3000);
}

// Auto-initialize background attempt (skip during build phase)
if (typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build") {
  // Try connecting or list ports asynchronously
  listAvailablePorts().then((ports) => {
    console.log(`[SerialPort] Detected ${ports.length} COM ports:`, ports.map((p) => p.path));
    if (ports.length > 0) {
      connectSerialPort();
    } else {
      telemetryStore.startSimulation("NORMAL");
    }
  });
}
