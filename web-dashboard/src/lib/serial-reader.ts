import { SerialPort } from "serialport";
import { ReadlineParser } from "serialport";
import { telemetryStore } from "./telemetry-state";

let activeSerialPort: SerialPort | null = null;
let parser: ReadlineParser | null = null;
let isReconnecting = false;
let configuredPortName = process.env.SERIAL_PORT || "COM8";
let lastErrorPort = "";

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

    // If port not specified, try to find an available USB / ESP32 port (preferring COM8 or configuredPortName)
    let targetPort = portPath || configuredPortName;
    const availablePorts = await listAvailablePorts();

    if (!targetPort || !availablePorts.some((p) => p.path.toUpperCase() === targetPort.toUpperCase())) {
      // Look for preferred COM8 first
      const com8Port = availablePorts.find((p) => p.path.toUpperCase() === "COM8");
      if (com8Port) {
        targetPort = com8Port.path;
      } else {
        // Fallback: look for USB Serial ports (e.g., Silicon Labs, CH340, Espressif, USB-SERIAL)
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
          const isAccessDenied = err.message.toLowerCase().includes("access denied");
          const userFriendlyMsg = isAccessDenied
            ? `Port ${targetPort} is locked by another app (e.g. Arduino IDE Serial Monitor). Close the Serial Monitor to connect.`
            : `Could not open ${targetPort}: ${err.message}`;

          if (lastErrorPort !== targetPort + err.message) {
            lastErrorPort = targetPort + err.message;
            console.warn(`[SerialPort] ${userFriendlyMsg}`);
            telemetryStore.addEventLog({
              level: "WARN",
              source: "SERIAL",
              message: userFriendlyMsg,
            });
          }
          telemetryStore.setPortStatus(targetPort, false, false);
          resolve({
            success: false,
            message: userFriendlyMsg,
          });
          return;
        }

        console.log(`[SerialPort] Connected to Gateway on ${targetPort} @ ${baudRate} baud.`);
        telemetryStore.stopSimulation();
        telemetryStore.setPortStatus(targetPort, true, false);
        telemetryStore.addEventLog({
          level: "INFO",
          source: "SERIAL",
          message: `Gateway connected on ${targetPort} @ ${baudRate} baud (Live Hardware Bus)`,
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
  configuredPortName = "";
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

export async function sendSerialCommand(command: string): Promise<boolean> {
  if (!activeSerialPort || !activeSerialPort.isOpen) {
    return false;
  }
  return new Promise((resolve) => {
    activeSerialPort!.write(command + "\n", (err) => {
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

function handleIncomingLine(raw: string) {
  const line = raw.trim();
  if (!line) return;

  // Find any embedded JSON object in the line (e.g. from Serial.printf)
  const jsonMatch = line.match(/\{.*?\}(?=\s*$)/) || line.match(/\{.*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      telemetryStore.ingestRawJson(parsed, "SERIAL");
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
  // Probe once on startup
  listAvailablePorts().then((ports) => {
    if (ports.length > 0) {
      console.log(`[SerialPort] Detected ${ports.length} COM port(s):`, ports.map((p) => p.path));
      connectSerialPort();
    }
  });
}
