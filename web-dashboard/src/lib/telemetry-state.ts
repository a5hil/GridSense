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
import { liveCalibration } from "./calibration";
import { SpanProtection } from "./network/protection";

const finiteNum = (val: any, fallback = 0): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const enforcePhaseMask = (
  ph: any,
  mask: number,
  defaultV: number,
  defaultI: number,
  defaultP: number,
  defaultPf: number
) => ({
  r: ph?.r ?? { v: defaultV, i: defaultI, p: defaultP, pf: defaultPf, src: "LIVE" },
  y: mask & 2 ? (ph?.y ?? { v: 0, i: 0, p: 0, pf: 0, src: "LIVE" }) : { v: 0, i: 0, p: 0, pf: 0, src: "NOT_INSTRUMENTED" },
  b: mask & 4 ? (ph?.b ?? { v: 0, i: 0, p: 0, pf: 0, src: "LIVE" }) : { v: 0, i: 0, p: 0, pf: 0, src: "NOT_INSTRUMENTED" },
});

class TelemetryStore extends EventEmitter {
  private currentTelemetry: GridTelemetry;
  private systemStatus: SystemStatus;
  private eventLogs: SCADAEventLog[] = [];
  private telemetryHistory: HistoricalTelemetryPoint[] = [];
  private simulationInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private lastIngestTime = 0;
  private protection = new SpanProtection();
  private p2LastGasp = false;
  private alarmOpen = false;

  public resetProtection() {
    this.protection.reset();
    this.p2LastGasp = false;
    this.alarmOpen = false;
  }

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
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
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
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
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

    // Inactivity Watchdog: If physical ESP32 gateway halts packets for >15s (5 consecutive missed cycles), flag disconnected
    this.watchdogInterval = setInterval(() => {
      if (this.systemStatus.gatewayConnected && this.lastIngestTime > 0 && Date.now() - this.lastIngestTime > 15000) {
        console.warn("[Watchdog] Gateway inactive for >15s. Marking disconnected and zeroing telemetry.");
        this.setPortStatus("DISCONNECTED", false, false);
      }
    }, 3000);
    this.watchdogInterval.unref?.();

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
        this.telemetryHistory = history.map((h) => {
          const v1 = Number((h.p1?.v ?? 0).toFixed(1));
          let v2 = Number((h.p2?.v ?? 0).toFixed(1));
          const i1 = Number((h.p1?.i ?? 0).toFixed(3));
          let i2 = Number((h.p2?.i ?? 0).toFixed(3));

          // Enforce radial voltage drop V1 >= V2
          if (v1 > 10 && v2 > v1) {
            v2 = v1;
          }

          // Enforce ΔI strictly equals |I1 - I2|
          const idiff = Number(Math.abs(i1 - i2).toFixed(3));

          const pf1 = h.p1?.pf ?? 0.96;
          const pf2 = h.p2?.pf ?? 0.96;
          const p1 = Number((v1 * i1 * pf1).toFixed(1));
          const p2 = Number((v2 * i2 * pf2).toFixed(1));

          const s1 = Number((v1 * i1).toFixed(1));
          const s2 = Number((v2 * i2).toFixed(1));
          const q1 = Number(Math.sqrt(Math.max(0, s1 * s1 - p1 * p1)).toFixed(1));
          const q2 = Number(Math.sqrt(Math.max(0, s2 * s2 - p2 * p2)).toFixed(1));
          const pLoss = Number(Math.max(0, p1 - p2).toFixed(1));
          const vDrop = Number(Math.max(0, v1 - v2).toFixed(1));

          return {
            timestamp: h.timestamp,
            timeLabel: new Date(h.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            v1,
            v2,
            i1,
            i2,
            idiff,
            tripLimit: h.trip_limit ?? 0.35,
            isFault: !!h.fault,
            p1,
            p2,
            q1,
            q2,
            s1,
            s2,
            pf1: Number(pf1.toFixed(2)),
            pf2: Number(pf2.toFixed(2)),
            freq1: Number((h.p1?.freq ?? 50.0).toFixed(2)),
            freq2: Number((h.p2?.freq ?? 50.0).toFixed(2)),
            pLoss,
            vDrop,
          };
        }).reverse();
        this.currentTelemetry.history = this.telemetryHistory;
      }

      this.systemStatus.mongoConnected = isMongoConnected();
      this.systemStatus.dbName = getMongoDbName();
      this.broadcast();
    } catch {
      // Fallback
    }
  }

  public sanitizeHistoryBuffer() {
    // Preserves raw physical sensor measurements without mutating stored history
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

  public recordGatewayHeartbeat() {
    this.lastIngestTime = Date.now();
    if (!this.systemStatus.gatewayConnected && this.systemStatus.activePort && this.systemStatus.activePort !== "DISCONNECTED") {
      this.systemStatus.gatewayConnected = true;
      if (this.currentTelemetry.status === "DISCONNECTED") {
        this.currentTelemetry.status = "WAITING_DATA";
      }
      this.broadcast();
    }
  }

  public setPortStatus(port: string, connected: boolean, isSimulated = false) {
    this.systemStatus.activePort = port;
    this.systemStatus.gatewayConnected = connected;
    this.systemStatus.isSimulated = isSimulated;
    if (connected) {
      this.lastIngestTime = Date.now();
    }

    if (!connected) {
      this.alarmOpen = false;
      this.p2LastGasp = false;
      this.protection.reset();
      this.currentTelemetry.status = "DISCONNECTED";
      this.currentTelemetry.fault = false;
      this.currentTelemetry.fault_code = "GATEWAY_DISCONNECTED";
      this.currentTelemetry.idiff = 0.0;
      if (this.currentTelemetry.p1) {
        this.currentTelemetry.p1.v = 0.0;
        this.currentTelemetry.p1.i = 0.0;
        this.currentTelemetry.p1.p = 0.0;
        this.currentTelemetry.p1.isOnline = false;
        this.currentTelemetry.p1.age_ms = 99999;
      }
      if (this.currentTelemetry.p2) {
        this.currentTelemetry.p2.v = 0.0;
        this.currentTelemetry.p2.i = 0.0;
        this.currentTelemetry.p2.p = 0.0;
        this.currentTelemetry.p2.isOnline = false;
        this.currentTelemetry.p2.age_ms = 99999;
      }
      if (this.currentTelemetry.nodes) {
        this.currentTelemetry.nodes.forEach((n) => {
          n.v = 0.0;
          n.i = 0.0;
          n.p = 0.0;
          n.isOnline = false;
          n.age_ms = 99999;
        });
      }
    }

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
    this.protection.reset();
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

    this.lastIngestTime = Date.now();
    if (!this.systemStatus.gatewayConnected || this.systemStatus.activePort === "DISCONNECTED") {
      this.systemStatus.gatewayConnected = true;
      if (this.systemStatus.activePort === "DISCONNECTED") {
        this.systemStatus.activePort = "COM8";
      }
    }

    const timestamp = new Date().toISOString();

    // Handle Last Gasp Outage Broadcast
    if (parsed.type === "LAST_GASP") {
      this.p2LastGasp = parsed.pole === 2 || parsed.pole === "Pole-B";
      const faultMsg = `LAST GASP OUTAGE: Pole ${parsed.pole} power lost! Dispatching crew.`;
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

      const r = this.protection.step(
        { v: this.currentTelemetry.p1.v, i: this.currentTelemetry.p1.i, ageMs: this.currentTelemetry.p1.age_ms ?? 99999 },
        { v: this.currentTelemetry.p2.v, i: this.currentTelemetry.p2.i, ageMs: this.currentTelemetry.p2.age_ms ?? 99999, lastGasp: this.p2LastGasp }
      );

      this.updateTelemetry({
        ...this.currentTelemetry,
        timestamp,
        status: r.trip ? "TRIP" : "ALERT",
        fault: true,
        fault_code: "OUTAGE_LAST_GASP",
        protectionState: r.state,
        protectionMsg: r.message,
      });
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
        v: finiteNum(n1.v),
        i: finiteNum(n1.i),
        p: finiteNum(n1.p, finiteNum(n1.v) * finiteNum(n1.i)),
        pf: Number.isFinite(Number(n1.pf)) ? Number(n1.pf) : 0.0,
        freq: Number.isFinite(Number(n1.f ?? n1.freq)) ? Number(n1.f ?? n1.freq) : 0.0,
        energy: finiteNum(n1.energy),
        rssi: finiteNum(n1.rssi, -35),
        snr: finiteNum(n1.snr, 15),
        relay: 1,
        hops: 0,
        age_ms: Number.isFinite(Number(n1.age_ms)) ? Number(n1.age_ms) : 99999,
        isOnline: finiteNum(n1.v) > 10,
        lastSeen: timestamp,
        lat: 10.2318,
        lng: 76.4088,
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
      };

      const p2: PoleData = {
        id: n2.id || "Pole-B",
        label: "Pole 2 (Outgoing)",
        role: "Outgoing",
        v: finiteNum(n2.v),
        i: finiteNum(n2.i),
        p: finiteNum(n2.p, finiteNum(n2.v) * finiteNum(n2.i)),
        pf: Number.isFinite(Number(n2.pf)) ? Number(n2.pf) : 0.0,
        freq: Number.isFinite(Number(n2.f ?? n2.freq)) ? Number(n2.f ?? n2.freq) : 0.0,
        energy: finiteNum(n2.energy),
        rssi: finiteNum(n2.rssi, -28),
        snr: finiteNum(n2.snr, 16),
        relay: 2,
        hops: 0,
        age_ms: Number.isFinite(Number(n2.age_ms)) ? Number(n2.age_ms) : 99999,
        isOnline: finiteNum(n2.v) > 10,
        lastSeen: timestamp,
        lat: 10.2325,
        lng: 76.4095,
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
      };

      const r = this.protection.step(
        { v: p1.v, i: p1.i, ageMs: p1.age_ms ?? 99999 },
        { v: p2.v, i: p2.i, ageMs: p2.age_ms ?? 99999, lastGasp: this.p2LastGasp }
      );
      const code: Record<string, string> = {
        TRIP_LEAKAGE: "DIFF_CURRENT_FAULT",
        TRIP_UNCLASSIFIED: "DIFF_UNCLASSIFIED",
        OPEN_CONDUCTOR: "BROKEN_CONDUCTOR",
      };
      const faultCode = code[r.state] ?? (r.blind ? "PROTECTION_BLIND" : "NORMAL");
      const statusVerdict: GridTelemetry["status"] = r.trip ? "TRIP" : r.blind ? "WARN" : "OK";

      this.updateTelemetry({
        timestamp,
        sec: "AES128",
        status: statusVerdict,
        fault: r.trip,
        fault_code: faultCode,
        idiff: r.idiff,
        trip_limit: r.thresholdA,
        protectionState: r.state,
        protectionMsg: r.message,
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
      const p1Mask = Number(parsed.p1.mask) || 1;
      const p1V = finiteNum(parsed.p1.v);
      const p1I = finiteNum(parsed.p1.i);
      const p1P = finiteNum(parsed.p1.p);
      const p1Pf = Number.isFinite(Number(parsed.p1.pf)) ? Number(parsed.p1.pf) : 0.0;
      const p1Freq = Number.isFinite(Number(parsed.p1.f ?? parsed.p1.freq)) ? Number(parsed.p1.f ?? parsed.p1.freq) : 0.0;
      const p1Age = Number.isFinite(Number(parsed.p1.age_ms)) ? Number(parsed.p1.age_ms) : 99999;

      const p1: PoleData = {
        id: "Pole-A",
        label: "Pole 1 (Incomer)",
        role: "Incomer",
        v: p1V,
        i: p1I,
        p: p1P,
        pf: p1Pf,
        freq: p1Freq,
        rssi: finiteNum(parsed.p1.rssi, -30),
        snr: finiteNum(parsed.p1.snr, 15),
        relay: finiteNum(parsed.p1.relay, 1),
        hops: finiteNum(parsed.p1.hops, 0),
        age_ms: p1Age,
        isOnline: p1Age < 15000,
        lastSeen: timestamp,
        lat: 10.2318,
        lng: 76.4088,
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
        phases: enforcePhaseMask(parsed.p1.phases, p1Mask, p1V, p1I, p1P, p1Pf),
        neutralCurrent: finiteNum(parsed.p1.in, p1I),
        voltageUnbalancePct: finiteNum(parsed.p1.unb, 0),
        phaseMask: p1Mask,
      };

      const p2Mask = Number(parsed.p2.mask) || 1;
      const p2V = finiteNum(parsed.p2.v);
      const p2I = finiteNum(parsed.p2.i);
      const p2P = finiteNum(parsed.p2.p);
      const p2Pf = Number.isFinite(Number(parsed.p2.pf)) ? Number(parsed.p2.pf) : 0.0;
      const p2Freq = Number.isFinite(Number(parsed.p2.f ?? parsed.p2.freq)) ? Number(parsed.p2.f ?? parsed.p2.freq) : 0.0;
      const p2Age = Number.isFinite(Number(parsed.p2.age_ms)) ? Number(parsed.p2.age_ms) : 99999;

      const p2: PoleData = {
        id: "Pole-B",
        label: "Pole 2 (Outgoing)",
        role: "Outgoing",
        v: p2V,
        i: p2I,
        p: p2P,
        pf: p2Pf,
        freq: p2Freq,
        rssi: finiteNum(parsed.p2.rssi, -28),
        snr: finiteNum(parsed.p2.snr, 16),
        relay: finiteNum(parsed.p2.relay, 2),
        hops: finiteNum(parsed.p2.hops, 0),
        age_ms: p2Age,
        isOnline: p2Age < 15000,
        lastSeen: timestamp,
        lat: 10.2325,
        lng: 76.4095,
        feederId: "FEEDER_04_SECTOR4",
        dtrId: "DTR_SECTOR4_01",
        phases: enforcePhaseMask(parsed.p2.phases, p2Mask, p2V, p2I, p2P, p2Pf),
        neutralCurrent: finiteNum(parsed.p2.in, p2I),
        voltageUnbalancePct: finiteNum(parsed.p2.unb, 0),
        phaseMask: p2Mask,
      };

      // Execute deterministic protection state machine
      const r = this.protection.step(
        { v: p1.v, i: p1.i, ageMs: p1.age_ms ?? 99999 },
        { v: p2.v, i: p2.i, ageMs: p2.age_ms ?? 99999, lastGasp: this.p2LastGasp }
      );

      // Central Gateway firmware authoritative readings
      const gwFault = typeof parsed.fault === "string" ? parsed.fault : "NORMAL";
      const gwStatus = typeof parsed.status === "string" ? parsed.status : "OK";
      const gwPhase = typeof parsed.fault_phase === "string" ? parsed.fault_phase : (typeof parsed.phase === "string" ? parsed.phase : "NONE");
      const gwIdiff = Number.isFinite(Number(parsed.idiff)) ? Number(parsed.idiff) : r.idiff;
      const tripLimit = Number.isFinite(Number(parsed.trip_limit)) ? Number(parsed.trip_limit) : r.thresholdA;

      // Both nodes are energized and healthy
      const bothEnergized = p1.v >= 180 && p2.v >= 180;
      const physicalHealthy = bothEnergized && gwIdiff < tripLimit && (gwFault === "NORMAL" || gwFault === "FAULT_NONE");

      if (physicalHealthy) {
        // Physical measurements prove the line is fully intact and healthy: clear any stale software latch
        this.protection.reset();
      }

      let isTrip = false;
      let faultCode = "NORMAL";
      let faultPhase = gwPhase;
      let statusVerdict: GridTelemetry["status"] = "OK";
      let protectionMsg = r.message;

      if (gwFault !== "NORMAL" && gwFault !== "FAULT_NONE") {
        isTrip = gwFault !== "POLE_OFFLINE" && gwFault !== "POWERCUT";
        statusVerdict = gwStatus === "WARN" ? "WARN" : (isTrip ? "TRIP" : "ALERT");
        faultPhase = gwPhase !== "NONE" ? gwPhase : "R";
        switch (gwFault) {
          case "DIFF_LEAKAGE":
            faultCode = "DIFF_CURRENT_FAULT";
            protectionMsg = `Gateway FDIR: Differential current ${gwIdiff.toFixed(3)} A exceeded ${tripLimit.toFixed(3)} A (Phase ${faultPhase})`;
            break;
          case "BROKEN_CONDUCTOR":
            faultCode = "BROKEN_CONDUCTOR";
            protectionMsg = `Gateway FDIR: Broken conductor detected on Phase ${faultPhase}`;
            break;
          case "BROKEN_NEUTRAL":
            faultCode = "BROKEN_NEUTRAL";
            protectionMsg = "Gateway FDIR: Broken neutral return / severe unbalance detected";
            break;
          case "OVERCURRENT":
            faultCode = "OVERCURRENT";
            protectionMsg = `Gateway FDIR: Overcurrent detected on Phase ${faultPhase}`;
            break;
          case "UNDERVOLTAGE":
            faultCode = "UNDERVOLTAGE";
            protectionMsg = `Gateway FDIR: Undervoltage detected on Phase ${faultPhase}`;
            break;
          case "OVERVOLTAGE":
            faultCode = "OVERVOLTAGE";
            protectionMsg = `Gateway FDIR: Overvoltage surge detected on Phase ${faultPhase}`;
            break;
          case "POWERCUT":
            faultCode = "POWERCUT";
            statusVerdict = "WARN";
            protectionMsg = "Gateway FDIR: Feeder de-energized (scheduled outage or upstream power cut)";
            break;
          case "POLE_OFFLINE":
            faultCode = "POLE_OFFLINE";
            statusVerdict = "WARN";
            protectionMsg = "Gateway FDIR: Feeder telemetry pole offline timeout";
            break;
          default:
            faultCode = gwFault;
            protectionMsg = `Gateway FDIR: ${gwFault}`;
        }
      } else if (r.trip) {
        isTrip = true;
        statusVerdict = "TRIP";
        faultPhase = "R";
        if (r.state === "OPEN_CONDUCTOR") {
          faultCode = "BROKEN_CONDUCTOR";
        } else if (r.state === "TRIP_LEAKAGE") {
          faultCode = "DIFF_CURRENT_FAULT";
        } else {
          faultCode = "DIFF_UNCLASSIFIED";
        }
        protectionMsg = r.message;
      } else if (r.blind) {
        isTrip = false;
        faultCode = "PROTECTION_BLIND";
        statusVerdict = "WARN";
        faultPhase = "NONE";
        protectionMsg = r.message;
      } else {
        isTrip = false;
        faultCode = "NORMAL";
        faultPhase = "NONE";
        statusVerdict = "OK";
        protectionMsg = r.message;
      }

      this.updateTelemetry({
        timestamp,
        gw_ms: parsed.gw_ms,
        sec: parsed.sec || "AES128",
        status: statusVerdict,
        fault: isTrip,
        fault_code: faultCode,
        fault_phase: faultPhase,
        idiff: gwIdiff,
        trip_limit: tripLimit,
        protectionState: r.state,
        protectionMsg,
        nodes: [p1, p2],
        p1,
        p2,
        rawPayload: parsed,
        lastGasp: this.p2LastGasp ? this.currentTelemetry.lastGasp : null,
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
    const v1Val = Number(params.v1.toFixed(1));
    const v2Val = Number(params.v2.toFixed(1));
    const i1Val = Number(params.i1.toFixed(3));
    const i2Val = Number(params.i2.toFixed(3));

    // Raw physical ΔI without rewriting measurements
    const idiffVal = Number(Math.abs(i1Val - i2Val).toFixed(3));

    const pf1Val = params.pf1 !== undefined ? params.pf1 : 0.0;
    const pf2Val = params.pf2 !== undefined ? params.pf2 : 0.0;
    const freq1Val = params.freq1 !== undefined ? params.freq1 : 0.0;
    const freq2Val = params.freq2 !== undefined ? params.freq2 : 0.0;

    // Active power (W): computed from raw values
    const p1Val = params.p1 !== undefined ? Number(params.p1.toFixed(1)) : Number((v1Val * i1Val * pf1Val).toFixed(1));
    const p2Val = params.p2 !== undefined ? Number(params.p2.toFixed(1)) : Number((v2Val * i2Val * pf2Val).toFixed(1));

    // Apparent power (VA): V * I
    const s1Val = Number((v1Val * i1Val).toFixed(1));
    const s2Val = Number((v2Val * i2Val).toFixed(1));

    // Reactive power (VAR): sqrt(max(0, S^2 - P^2))
    const q1Val = Number(Math.sqrt(Math.max(0, s1Val * s1Val - p1Val * p1Val)).toFixed(1));
    const q2Val = Number(Math.sqrt(Math.max(0, s2Val * s2Val - p2Val * p2Val)).toFixed(1));

    // Direct Data Passthrough: exact physical values
    const pLossVal = Number(Math.max(0, p1Val - p2Val).toFixed(1));
    const vDropVal = Number((v1Val - v2Val).toFixed(1));

    const timeLabel = new Date(params.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    this.telemetryHistory.push({
      timestamp: params.timestamp,
      timeLabel,
      v1: v1Val,
      v2: v2Val,
      i1: i1Val,
      i2: i2Val,
      idiff: idiffVal,
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

    // Continuously learn physical calibration between Node A and Node B
    liveCalibration.observe({
      v1: next.p1.v,
      v2: next.p2.v,
      i1: next.p1.i,
      i2: next.p2.i,
      p1: next.p1.p ?? 0,
      p2: next.p2.p ?? 0,
      fault: next.fault,
    });

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

    // 3b. Alarm episode tracking - prevents infinite re-raise loop after operator Acknowledge
    if (next.fault && next.fault_code !== "NORMAL" && next.fault_code !== "PROTECTION_BLIND") {
      const isNew = !this.alarmOpen || this.systemStatus.activeAlarm?.faultCode !== next.fault_code;
      if (isNew) {
        this.alarmOpen = true;
        this.systemStatus.operatorAck = false;
        const msg = next.protectionMsg || `Differential Fault: |IA - IB| = ${next.idiff.toFixed(3)}A exceeds threshold (${next.trip_limit.toFixed(3)}A). Central FDIR: ${next.fault_code}`;

        this.systemStatus.activeAlarm = {
          active: true,
          title: "CRITICAL: FDIR DIFFERENTIAL FAULT",
          description: msg,
          timestamp: next.timestamp,
          faultCode: next.fault_code,
        };

        // Auto-Issue Trouble Ticket in Outage Management System (OMS)
        omsManager.autoCreateTicketForFault({
          faultCode: next.fault_code,
          affectedPole: "Feeder LT-1: Span F1-P01 ↔ F1-P02",
          gps: { lat: 10.2325, lng: 76.4095 },
          idiff: next.idiff,
          source: "LIVE",
        });

        this.addEventLog({
          level: "CRITICAL",
          source: "FDIR_CORE",
          message: `FEEDER TRIP: ${msg}`,
          details: `F1-P01=${next.p1.i.toFixed(2)}A, F1-P02=${next.p2.i.toFixed(2)}A`,
        });
      }
    } else if (this.alarmOpen && !next.fault) {
      this.alarmOpen = false;
      const clearedCode = this.systemStatus.activeAlarm?.faultCode || "NORMAL";
      if (this.systemStatus.activeAlarm) {
        this.systemStatus.activeAlarm.active = false;
      }
      this.addEventLog({
        level: "INFO",
        source: "FDIR_CORE",
        message: `Fault cleared: ${clearedCode}`,
      });
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
