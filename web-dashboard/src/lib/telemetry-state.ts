import { EventEmitter } from "events";
import { GridTelemetry, PoleData, SCADAEventLog, SystemStatus } from "./types";
import { saveLogRecord, saveTelemetryRecord } from "./db";

class TelemetryStore extends EventEmitter {
  private currentTelemetry: GridTelemetry;
  private systemStatus: SystemStatus;
  private eventLogs: SCADAEventLog[] = [];
  private simulationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);

    const initialP1: PoleData = {
      id: "Pole-A",
      label: "Pole 1 (Incomer)",
      role: "Incomer",
      v: 230.2,
      i: 2.45,
      p: 563.9,
      pf: 0.96,
      freq: 50.0,
      energy: 14.82,
      rssi: -32,
      snr: 15,
      relay: 1,
      hops: 0,
      age_ms: 0,
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };

    const initialP2: PoleData = {
      id: "Pole-B",
      label: "Pole 2 (Outgoing)",
      role: "Outgoing",
      v: 230.1,
      i: 2.43,
      p: 559.1,
      pf: 0.96,
      freq: 50.0,
      energy: 14.79,
      rssi: -28,
      snr: 16,
      relay: 2,
      hops: 0,
      age_ms: 120,
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };

    this.currentTelemetry = {
      timestamp: new Date().toISOString(),
      gw_ms: 1000,
      sec: "AES128",
      status: "OK",
      fault: false,
      fault_code: "NORMAL",
      idiff: 0.02,
      trip_limit: 0.5,
      nodes: [initialP1, initialP2],
      p1: initialP1,
      p2: initialP2,
      lastGasp: null,
    };

    this.systemStatus = {
      gatewayConnected: false,
      activePort: "DISCONNECTED",
      baudRate: 115200,
      isSimulated: false,
      operatorAck: true,
      activeAlarm: null,
    };

    // Initial event log
    this.addEventLog({
      level: "INFO",
      source: "SCADA_CORE",
      message: "GridSense Distribution Office SCADA System Initialized",
      details: "Monitoring 2-Pole FDIR Feeder (AES-128 LoRa Mesh). Baud: 115200",
    });
  }

  public getTelemetry(): GridTelemetry {
    return this.currentTelemetry;
  }

  public getStatus(): SystemStatus {
    return this.systemStatus;
  }

  public getLogs(): SCADAEventLog[] {
    return this.eventLogs;
  }

  public setPortStatus(port: string, connected: boolean, isSimulated = false) {
    this.systemStatus.activePort = port;
    this.systemStatus.gatewayConnected = connected;
    this.systemStatus.isSimulated = isSimulated;
    this.broadcast();
  }

  public addEventLog(entry: Omit<SCADAEventLog, "id" | "timestamp">) {
    const log: SCADAEventLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.eventLogs.unshift(log);
    if (this.eventLogs.length > 100) this.eventLogs.pop();
    saveLogRecord(log).catch(() => {});
    this.emit("log", log);
  }

  public acknowledgeAlarm() {
    this.systemStatus.operatorAck = true;
    if (this.systemStatus.activeAlarm) {
      this.addEventLog({
        level: "INFO",
        source: "OPERATOR",
        message: "Fault alarm acknowledged by operator",
        details: `Acknowledged alarm for ${this.systemStatus.activeAlarm.faultCode}`,
      });
      this.systemStatus.activeAlarm.active = false;
    }
    this.broadcast();
  }

  public ingestRawJson(parsed: any) {
    const timestamp = new Date().toISOString();

    // Handle Last Gasp Outage Broadcast
    if (parsed.type === "LAST_GASP") {
      const faultMsg = `LAST GASP OUTAGE: Pole ${parsed.pole} power lost! Dispatching crew.`;
      this.currentTelemetry.status = "ALERT";
      this.currentTelemetry.fault = true;
      this.currentTelemetry.fault_code = "OUTAGE_LAST_GASP";
      this.currentTelemetry.lastGasp = {
        pole: parsed.pole || 2,
        relay: parsed.relay || parsed.pole || 2,
        hops: parsed.hops || 0,
        v_prev: parsed.v_prev || 0,
        i_prev: parsed.i_prev || 0,
        rssi: parsed.rssi || 0,
        action: parsed.action || "DISPATCH_CREW_OUTAGE",
      };

      if (parsed.pole === 2) {
        this.currentTelemetry.p2.isOnline = false;
        this.currentTelemetry.p2.v = 0;
        this.currentTelemetry.p2.i = 0;
        this.currentTelemetry.nodes[1].isOnline = false;
        this.currentTelemetry.nodes[1].v = 0;
        this.currentTelemetry.nodes[1].i = 0;
      } else {
        this.currentTelemetry.p1.isOnline = false;
        this.currentTelemetry.p1.v = 0;
        this.currentTelemetry.p1.i = 0;
        this.currentTelemetry.nodes[0].isOnline = false;
        this.currentTelemetry.nodes[0].v = 0;
        this.currentTelemetry.nodes[0].i = 0;
      }

      this.systemStatus.operatorAck = false;
      this.systemStatus.activeAlarm = {
        active: true,
        title: "CRITICAL: LAST GASP OUTAGE",
        description: faultMsg,
        timestamp,
        faultCode: "OUTAGE_LAST_GASP",
      };

      this.addEventLog({
        level: "CRITICAL",
        source: "LAST_GASP",
        message: faultMsg,
        details: JSON.stringify(parsed),
      });

      this.broadcast();
      saveTelemetryRecord(this.currentTelemetry);
      return;
    }

    // Normalizing Format A: {"nodes": [{"id": "Pole-A", "v": 230.1, "i": 5.2}, {"id": "Pole-B", "v": 229.8, "i": 4.9}], "fault": false}
    if (Array.isArray(parsed.nodes) && parsed.nodes.length >= 2) {
      const n1 = parsed.nodes[0];
      const n2 = parsed.nodes[1];

      const p1: PoleData = {
        id: n1.id || "Pole-A",
        label: "Pole 1 (Incomer)",
        role: "Incomer",
        v: Number(n1.v) || 0,
        i: Number(n1.i) || 0,
        p: Number(n1.p) || Number((n1.v * n1.i * 0.96).toFixed(1)),
        pf: Number(n1.pf) || 0.96,
        freq: 50.0,
        energy: 14.85,
        rssi: n1.rssi || -35,
        snr: n1.snr || 15,
        relay: 1,
        hops: 0,
        age_ms: 0,
        isOnline: (Number(n1.v) || 0) > 10,
        lastSeen: timestamp,
      };

      const p2: PoleData = {
        id: n2.id || "Pole-B",
        label: "Pole 2 (Outgoing)",
        role: "Outgoing",
        v: Number(n2.v) || 0,
        i: Number(n2.i) || 0,
        p: Number(n2.p) || Number((n2.v * n2.i * 0.96).toFixed(1)),
        pf: Number(n2.pf) || 0.96,
        freq: 50.0,
        energy: 14.82,
        rssi: n2.rssi || -28,
        snr: n2.snr || 16,
        relay: 2,
        hops: 0,
        age_ms: 150,
        isOnline: (Number(n2.v) || 0) > 10,
        lastSeen: timestamp,
      };

      const idiff = Math.abs(p1.i - p2.i);
      const isFault = parsed.fault === true || idiff > 0.5;

      this.updateTelemetry({
        timestamp,
        sec: "AES128",
        status: isFault ? "TRIP" : "OK",
        fault: isFault,
        fault_code: isFault ? "DIFF_CURRENTFAULT" as any : "NORMAL",
        idiff: Number(idiff.toFixed(3)),
        trip_limit: 0.5,
        nodes: [p1, p2],
        p1,
        p2,
        rawPayload: parsed,
        lastGasp: null,
      });
      return;
    }

    // Normalizing Format B: Live Gateway Format {"gw_ms":48740,"sec":"AES128","status":"OK","fault":"NORMAL","idiff":0.005,"trip_limit":0.350,"p1":{...},"p2":{...}}
    if (parsed.p1 && parsed.p2) {
      const p1: PoleData = {
        id: "Pole-A",
        label: "Pole 1 (Incomer)",
        role: "Incomer",
        v: Number(parsed.p1.v) || 0,
        i: Number(parsed.p1.i) || 0,
        p: Number(parsed.p1.p) || 0,
        pf: Number(parsed.p1.pf) || 0.96,
        freq: 50.0,
        rssi: parsed.p1.rssi || -30,
        snr: parsed.p1.snr || 15,
        relay: parsed.p1.relay || 1,
        hops: parsed.p1.hops || 0,
        age_ms: parsed.p1.age_ms || 0,
        isOnline: parsed.p1.age_ms !== 99999 && (parsed.p1.v || 0) > 10,
        lastSeen: timestamp,
      };

      const p2: PoleData = {
        id: "Pole-B",
        label: "Pole 2 (Outgoing)",
        role: "Outgoing",
        v: Number(parsed.p2.v) || 0,
        i: Number(parsed.p2.i) || 0,
        p: Number(parsed.p2.p) || 0,
        pf: Number(parsed.p2.pf) || 0.96,
        freq: 50.0,
        rssi: parsed.p2.rssi || -28,
        snr: parsed.p2.snr || 16,
        relay: parsed.p2.relay || 2,
        hops: parsed.p2.hops || 0,
        age_ms: parsed.p2.age_ms || 0,
        isOnline: parsed.p2.age_ms !== 99999 && (parsed.p2.v || 0) > 10,
        lastSeen: timestamp,
      };

      const idiff = Number(parsed.idiff ?? Math.abs(p1.i - p2.i).toFixed(3));
      const tripLimit = Number(parsed.trip_limit ?? 0.5);
      const isFault =
        parsed.status === "ALERT" ||
        parsed.status === "TRIP" ||
        parsed.fault === true ||
        (parsed.fault && parsed.fault !== "NORMAL" && parsed.fault !== "OK") ||
        idiff > 0.5;

      const faultCode = isFault
        ? parsed.fault || "DIFF_CURRENT_FAULT"
        : "NORMAL";

      this.updateTelemetry({
        timestamp,
        gw_ms: parsed.gw_ms,
        sec: parsed.sec || "AES128",
        status: isFault ? "TRIP" : (parsed.status || "OK"),
        fault: isFault,
        fault_code: faultCode,
        idiff,
        trip_limit: tripLimit,
        nodes: [p1, p2],
        p1,
        p2,
        rawPayload: parsed,
        lastGasp: null,
      });
    }
  }

  private updateTelemetry(next: GridTelemetry) {
    this.currentTelemetry = next;

    // Check fault condition for operator alarm
    if (next.fault) {
      const faultDesc = `Differential Fault: |IA - IB| = ${next.idiff.toFixed(3)}A exceeds threshold (${next.trip_limit.toFixed(3)}A). Central FDIR: ${next.fault_code}`;
      
      // If alarm was not already active or code changed
      if (
        !this.systemStatus.activeAlarm ||
        !this.systemStatus.activeAlarm.active ||
        this.systemStatus.activeAlarm.faultCode !== next.fault_code
      ) {
        this.systemStatus.operatorAck = false;
        this.systemStatus.activeAlarm = {
          active: true,
          title: "CRITICAL: FDIR DIFFERENTIAL FAULT",
          description: faultDesc,
          timestamp: next.timestamp,
          faultCode: next.fault_code,
        };

        this.addEventLog({
          level: "CRITICAL",
          source: "FDIR_CORE",
          message: `FEEDER TRIP: ${faultDesc}`,
          details: `P1=${next.p1.i.toFixed(2)}A, P2=${next.p2.i.toFixed(2)}A`,
        });
      }
    }

    saveTelemetryRecord(next).catch(() => {});
    this.broadcast();
  }

  private broadcast() {
    this.emit("update", {
      telemetry: this.currentTelemetry,
      status: this.systemStatus,
      logs: this.eventLogs.slice(0, 15),
    });
  }

  // Simulation mode for testing / demonstrations when USB hardware is unplugged
  public startSimulation(faultScenario: "NORMAL" | "FAULT_HIGH_IDIFF" | "LAST_GASP" = "NORMAL") {
    if (this.simulationInterval) clearInterval(this.simulationInterval);
    this.systemStatus.isSimulated = true;
    this.systemStatus.activePort = "SIMULATOR";
    this.systemStatus.gatewayConnected = true;

    this.addEventLog({
      level: "INFO",
      source: "SIMULATOR",
      message: `SCADA Telemetry Simulator started (${faultScenario})`,
    });

    const step = () => {
      const baseV = 230.0 + (Math.random() - 0.5) * 1.2;
      let i1 = 2.45 + (Math.random() - 0.5) * 0.05;
      let i2 = 2.44 + (Math.random() - 0.5) * 0.05;

      if (faultScenario === "FAULT_HIGH_IDIFF") {
        i2 = 1.62; // 0.83A differential leakage fault!
      }

      if (faultScenario === "LAST_GASP") {
        this.ingestRawJson({
          gw_ms: Date.now(),
          type: "LAST_GASP",
          pole: 2,
          relay: 2,
          hops: 0,
          v_prev: 229.8,
          i_prev: 2.44,
          rssi: -22,
          action: "DISPATCH_CREW_OUTAGE",
        });
        return;
      }

      this.ingestRawJson({
        nodes: [
          { id: "Pole-A", v: Number(baseV.toFixed(1)), i: Number(i1.toFixed(3)), rssi: -32, snr: 15 },
          { id: "Pole-B", v: Number((baseV - 0.3).toFixed(1)), i: Number(i2.toFixed(3)), rssi: -28, snr: 16 },
        ],
        fault: faultScenario === "FAULT_HIGH_IDIFF",
      });
    };

    step();
    this.simulationInterval = setInterval(step, 2000);
  }

  public stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.systemStatus.isSimulated = false;
    this.broadcast();
  }
}

// Global singleton across Next.js API routes & dev reloads
const globalForTelemetry = globalThis as unknown as { telemetryStore?: TelemetryStore };
export const telemetryStore = globalForTelemetry.telemetryStore || new TelemetryStore();
if (process.env.NODE_ENV !== "production") globalForTelemetry.telemetryStore = telemetryStore;
