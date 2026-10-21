import { EventEmitter } from "events";
import { GridTelemetry, HistoricalTelemetryPoint, PoleData, SCADAEventLog, SystemStatus } from "./types";
import {
  getRecentLogs,
  getRecentTelemetry,
  isMongoConnected,
  getMongoDbName,
  saveLogRecord,
  saveTelemetryRecord,
} from "./db";
import { omsManager } from "./oms-state";

class TelemetryStore extends EventEmitter {
  private currentTelemetry: GridTelemetry;
  private systemStatus: SystemStatus;
  private eventLogs: SCADAEventLog[] = [];
  private telemetryHistory: HistoricalTelemetryPoint[] = [];
  private simulationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);

    const initialP1: PoleData = {
      id: "Pole-A",
      label: "Pole 1 (Incomer)",
      role: "Incomer",
      v: 0.0,
      i: 0.0,
      p: 0.0,
      pf: 0.0,
      freq: 0.0,
      energy: 0.0,
      rssi: 0,
      snr: 0,
      relay: 1,
      hops: 0,
      age_ms: 99999,
      isOnline: false,
      lastSeen: new Date().toISOString(),
      lat: 10.2318,
      lng: 76.4088,
      feederId: "FEEDER_04_CAMPUS",
      dtrId: "DTR_CAMPUS_01",
    };

    const initialP2: PoleData = {
      id: "Pole-B",
      label: "Pole 2 (Outgoing)",
      role: "Outgoing",
      v: 0.0,
      i: 0.0,
      p: 0.0,
      pf: 0.0,
      freq: 0.0,
      energy: 0.0,
      rssi: 0,
      snr: 0,
      relay: 2,
      hops: 0,
      age_ms: 99999,
      isOnline: false,
      lastSeen: new Date().toISOString(),
      lat: 10.2325,
      lng: 76.4095,
      feederId: "FEEDER_04_CAMPUS",
      dtrId: "DTR_CAMPUS_01",
    };

    // Live clean history (only populated from real packets)
    this.telemetryHistory = [];

    this.currentTelemetry = {
      timestamp: new Date().toISOString(),
      gw_ms: 0,
      sec: "AES128",
      status: "WAITING_DATA",
      fault: false,
      fault_code: "NORMAL",
      idiff: 0.0,
      trip_limit: 0.35,
      nodes: [initialP1, initialP2],
      p1: initialP1,
      p2: initialP2,
      lastGasp: null,
      history: [],
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
      message: "GridSense Live Hardware Telemetry Engine Ready",
      details: "Awaiting serial packets from Gateway at 115200 baud.",
    });

    this.initFromDb().catch(() => {});
  }

  public async initFromDb(): Promise<void> {
    try {
      const [logs, history] = await Promise.all([
        getRecentLogs(50),
        getRecentTelemetry(40),
      ]);

      if (logs && logs.length > 0) {
        this.eventLogs = logs;
      }

      if (history && history.length > 0) {
        this.telemetryHistory = history.map((h) => ({
          timestamp: h.timestamp,
          timeLabel: new Date(h.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          v1: Number((h.p1?.v ?? 0).toFixed(1)),
          v2: Number((h.p2?.v ?? 0).toFixed(1)),
          i1: Number((h.p1?.i ?? 0).toFixed(3)),
          i2: Number((h.p2?.i ?? 0).toFixed(3)),
          idiff: Number((h.idiff ?? 0).toFixed(3)),
          tripLimit: h.trip_limit ?? 0.35,
          isFault: !!h.fault,
        })).reverse();
        this.currentTelemetry.history = this.telemetryHistory;
      }

      this.systemStatus.mongoConnected = isMongoConnected();
      this.systemStatus.dbName = getMongoDbName();
      this.broadcast();
    } catch {
      // Fallback
    }
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

  public getHistory(): HistoricalTelemetryPoint[] {
    return this.telemetryHistory;
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

  public ingestRawJson(parsed: any, source: "SERIAL" | "SIMULATOR" = "SERIAL") {
    // Only accept physical hardware serial packets
    if (source === "SIMULATOR") {
      return;
    }

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

      // Auto-Issue Trouble Ticket in OMS
      omsManager.autoCreateTicketForFault({
        faultCode: "OUTAGE_LAST_GASP",
        affectedPole: `Pole ${parsed.pole || 2} // Power Cut`,
        gps: { lat: 10.2325, lng: 76.4095 },
        idiff: 0,
        severity: "CRITICAL",
      });

      this.recordHistoryPoint({
        timestamp,
        v1: this.currentTelemetry.p1.v,
        v2: this.currentTelemetry.p2.v,
        i1: this.currentTelemetry.p1.i,
        i2: this.currentTelemetry.p2.i,
        idiff: 0,
        tripLimit: 0.35,
        isFault: true,
      });

      this.broadcast();
      saveTelemetryRecord(this.currentTelemetry).catch(() => {});
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
        lat: 10.2318,
        lng: 76.4088,
        feederId: "FEEDER_04_CAMPUS",
        dtrId: "DTR_CAMPUS_01",
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
        lat: 10.2325,
        lng: 76.4095,
        feederId: "FEEDER_04_CAMPUS",
        dtrId: "DTR_CAMPUS_01",
      };

      const idiff = Math.abs(p1.i - p2.i);
      const isFault = parsed.fault === true || idiff >= 0.35;

      this.updateTelemetry({
        timestamp,
        sec: "AES128",
        status: isFault ? "TRIP" : "OK",
        fault: isFault,
        fault_code: isFault ? "DIFF_CURRENT_FAULT" : "NORMAL",
        idiff: Number(idiff.toFixed(3)),
        trip_limit: 0.35,
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
        lat: 10.2318,
        lng: 76.4088,
        feederId: "FEEDER_04_CAMPUS",
        dtrId: "DTR_CAMPUS_01",
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
        lat: 10.2325,
        lng: 76.4095,
        feederId: "FEEDER_04_CAMPUS",
        dtrId: "DTR_CAMPUS_01",
      };

      const idiff = Number(parsed.idiff ?? Math.abs(p1.i - p2.i).toFixed(3));
      const tripLimit = Number(parsed.trip_limit ?? 0.35);
      const isElectricalTrip =
        parsed.fault === "DIFF_LEAKAGE" ||
        parsed.fault === "OVERCURRENT" ||
        parsed.fault === "LINE_BREAK" ||
        parsed.fault === "UNDERVOLTAGE" ||
        parsed.fault === "OVERVOLTAGE" ||
        parsed.status === "ALERT" ||
        parsed.status === "TRIP" ||
        idiff >= tripLimit;

      const isWarn = parsed.status === "WARN" || parsed.fault === "POLE_OFFLINE";

      const faultCode = isElectricalTrip
        ? (parsed.fault && parsed.fault !== "NORMAL" ? parsed.fault : "DIFF_CURRENT_FAULT")
        : isWarn
        ? (parsed.fault || "POLE_OFFLINE")
        : "NORMAL";

      this.updateTelemetry({
        timestamp,
        gw_ms: parsed.gw_ms,
        sec: parsed.sec || "AES128",
        status: isElectricalTrip ? "TRIP" : isWarn ? "WARN" : "OK",
        fault: isElectricalTrip,
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

  private recordHistoryPoint(params: {
    timestamp: string;
    v1: number;
    v2: number;
    i1: number;
    i2: number;
    idiff: number;
    tripLimit: number;
    isFault: boolean;
    p1?: number;
    p2?: number;
    pf1?: number;
    pf2?: number;
    freq1?: number;
    freq2?: number;
  }) {
    let v2Val = params.v2;
    let i2Val = params.i2;

    // Prevent Pole 2 from initializing at 0.00A before its first LoRa packet arrives (eliminates diagonal chart spike)
    if (i2Val === 0 && params.i1 > 0) {
      const prev = this.telemetryHistory[this.telemetryHistory.length - 1];
      if (prev && prev.i2 > 0) {
        i2Val = prev.i2;
        v2Val = prev.v2;
      } else {
        i2Val = params.i1;
        v2Val = params.v1;
      }
    }

    const pf1Val = params.pf1 !== undefined && params.pf1 > 0 ? params.pf1 : 0.96;
    const pf2Val = params.pf2 !== undefined && params.pf2 > 0 ? params.pf2 : 0.96;
    const freq1Val = params.freq1 !== undefined && params.freq1 > 0 ? params.freq1 : 50.0;
    const freq2Val = params.freq2 !== undefined && params.freq2 > 0 ? params.freq2 : 50.0;

    // Active power (W): use sensor reading if provided or calculate V * I * PF
    const p1Val = params.p1 !== undefined && params.p1 > 0 ? params.p1 : Number((params.v1 * params.i1 * pf1Val).toFixed(1));
    const p2Val = params.p2 !== undefined && params.p2 > 0 ? params.p2 : Number((v2Val * i2Val * pf2Val).toFixed(1));

    // Apparent power (VA): V * I
    const s1Val = Number((params.v1 * params.i1).toFixed(1));
    const s2Val = Number((v2Val * i2Val).toFixed(1));

    // Reactive power (VAR): sqrt(max(0, S^2 - P^2))
    const q1Val = Number(Math.sqrt(Math.max(0, s1Val * s1Val - p1Val * p1Val)).toFixed(1));
    const q2Val = Number(Math.sqrt(Math.max(0, s2Val * s2Val - p2Val * p2Val)).toFixed(1));

    // Technical line loss & voltage drop
    const pLossVal = Number(Math.abs(p1Val - p2Val).toFixed(1));
    const vDropVal = Number(Math.abs(params.v1 - v2Val).toFixed(1));

    const timeLabel = new Date(params.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    this.telemetryHistory.push({
      timestamp: params.timestamp,
      timeLabel,
      v1: Number(params.v1.toFixed(1)),
      v2: Number(v2Val.toFixed(1)),
      i1: Number(params.i1.toFixed(3)),
      i2: Number(i2Val.toFixed(3)),
      idiff: Number(params.idiff.toFixed(3)),
      tripLimit: params.tripLimit,
      isFault: params.isFault,
      p1: p1Val,
      p2: p2Val,
      q1: q1Val,
      q2: q2Val,
      s1: s1Val,
      s2: s2Val,
      pf1: Number(pf1Val.toFixed(2)),
      pf2: Number(pf2Val.toFixed(2)),
      freq1: Number(freq1Val.toFixed(2)),
      freq2: Number(freq2Val.toFixed(2)),
      pLoss: pLossVal,
      vDrop: vDropVal,
    });

    if (this.telemetryHistory.length > 40) {
      this.telemetryHistory.shift();
    }
    this.currentTelemetry.history = this.telemetryHistory;
  }

  private updateTelemetry(next: GridTelemetry) {
    this.currentTelemetry = next;

    this.recordHistoryPoint({
      timestamp: next.timestamp,
      v1: next.p1.v,
      v2: next.p2.v,
      i1: next.p1.i,
      i2: next.p2.i,
      idiff: next.idiff,
      tripLimit: next.trip_limit,
      isFault: next.fault,
      p1: next.p1.p,
      p2: next.p2.p,
      pf1: next.p1.pf,
      pf2: next.p2.pf,
      freq1: next.p1.freq,
      freq2: next.p2.freq,
    });

    // Check fault condition for operator alarm
    if (next.fault) {
      const faultDesc = `Differential Fault: |IA - IB| = ${next.idiff.toFixed(3)}A exceeds threshold (${next.trip_limit.toFixed(3)}A). Central FDIR: ${next.fault_code}`;

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

        // Auto-Issue Trouble Ticket in Outage Management System (OMS)
        omsManager.autoCreateTicketForFault({
          faultCode: next.fault_code,
          affectedPole: "Pole 1 ➔ Pole 2 Feeder Span",
          gps: { lat: 10.2325, lng: 76.4095 },
          idiff: next.idiff,
        });

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
    const activeTicket = omsManager.getActiveTicket();
    this.systemStatus.ptwInterlockActive = !!(activeTicket?.ptw?.reclosingInterlockActive);
    this.systemStatus.mongoConnected = isMongoConnected();
    this.systemStatus.dbName = getMongoDbName();

    const telemetryWithTickets = {
      ...this.currentTelemetry,
      tickets: omsManager.getTickets(),
    };

    this.emit("update", {
      telemetry: telemetryWithTickets,
      status: this.systemStatus,
      logs: this.eventLogs.slice(0, 15),
      history: this.telemetryHistory,
      tickets: omsManager.getTickets(),
    });
  }

  // Simulation mode disabled - direct physical hardware only
  public startSimulation(_faultScenario?: any) {
    this.stopSimulation();
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
