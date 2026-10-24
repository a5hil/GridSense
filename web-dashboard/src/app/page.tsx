"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  FileText,
  GitBranch,
  Layers,
  Lock,
  MapPin,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Terminal,
  TrendingUp,
  UserCheck,
  Volume2,
  VolumeX,
  WifiOff,
  Keyboard,
  Wrench,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  GridTelemetry,
  HistoricalTelemetryPoint,
  PoleData,
  SCADAEventLog,
  SystemStatus,
  TroubleTicket,
} from "@/lib/types";
import { GisFeederMap } from "@/components/scada/GisFeederMap";
import { TelemetryTrendChart } from "@/components/scada/TelemetryTrendChart";
import { FeederAssetTree } from "@/components/scada/FeederAssetTree";
import { WorkforceOmsPanel } from "@/components/scada/WorkforceOmsPanel";
import { SingleLinePowerFlow } from "@/components/scada/SingleLinePowerFlow";
import { EngineeringDiagnostics } from "@/components/scada/EngineeringDiagnostics";
import { NetworkTwinView } from "@/components/scada/NetworkTwinView";
import { NetworkSnapshot } from "@/lib/network/types";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

export default function SCADADashboard() {
  const { addToast, removeToast, clearAll } = useToast();

  const [telemetry, setTelemetry] = React.useState<GridTelemetry | null>(null);
  const [networkSnapshot, setNetworkSnapshot] = React.useState<NetworkSnapshot | null>(null);
  const [systemStatus, setSystemStatus] = React.useState<SystemStatus | null>(null);
  const [logs, setLogs] = React.useState<SCADAEventLog[]>([]);
  const [history, setHistory] = React.useState<HistoricalTelemetryPoint[]>([]);
  const [tickets, setTickets] = React.useState<TroubleTicket[]>([]);
  const [connectedSSE, setConnectedSSE] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<string>("--:--:--");
  const [availablePorts, setAvailablePorts] = React.useState<any[]>([]);
  const [selectedPort, setSelectedPort] = React.useState<string>("");
  const [isAcking, setIsAcking] = React.useState(false);
  const [selectedPoleId, setSelectedPoleId] = React.useState<string>("F1-P01");
  const handlePoleSelect = React.useCallback((target: any) => {
    if (!target) return;
    const id = typeof target === "string" ? target : target.id;
    if (id) setSelectedPoleId(id);
  }, []);
  const [isBreakerTripped, setIsBreakerTripped] = React.useState(false);
  const [activeView, setActiveView] = React.useState<
    "OPERATOR" | "GIS" | "NETWORK" | "WAVEFORMS" | "OMS" | "DIAGNOSTICS" | "LOGS"
  >("OPERATOR");

  // Waveform Freeze / Capture State
  const [isWaveformFrozen, setIsWaveformFrozen] = React.useState(false);

  // Web Audio SCADA Alarm Buzzer State
  const [isAudioMuted, setIsAudioMuted] = React.useState(false);
  const audioContextRef = React.useRef<AudioContext | null>(null);

  // SSE Stream Health & Disconnection State
  const [isStreamDisconnected, setIsStreamDisconnected] = React.useState(false);
  const lastPacketTimeRef = React.useRef<number>(Date.now());

  // Web Audio API Industrial Dual-Tone Alarm Synthesizer (880Hz / 660Hz pulses)
  const playIndustrialAlarm = React.useCallback(() => {
    if (isAudioMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;

      // Pulse 1: 880Hz
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Pulse 2: 660Hz (starts at now + 0.18s)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(660, now + 0.18);
      gain2.gain.setValueAtTime(0.12, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.33);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.33);

      // Pulse 3: 880Hz (starts at now + 0.36s)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sawtooth";
      osc3.frequency.setValueAtTime(880, now + 0.36);
      gain3.gain.setValueAtTime(0.12, now + 0.36);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.51);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.36);
      osc3.stop(now + 0.51);
    } catch (err) {
      console.warn("AudioContext error:", err);
    }
  }, [isAudioMuted]);

  // Track if fault toast is currently raised to prevent multiple toasts for the same continuous fault
  const activeFaultToastRef = React.useRef<string | null>(null);

  // Live Energy Accumulation over time (P * Δt) with 3 decimal precision
  const [accumulatedEnergyKWh, setAccumulatedEnergyKWh] = React.useState<number>(1.248);
  const lastEnergyTickRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const dtHours = (now - lastEnergyTickRef.current) / (1000 * 3600);
      lastEnergyTickRef.current = now;

      // Active power in kW (use actual live p1 power if available, otherwise nominal 535W)
      const currentPowerKW = (telemetry?.p1?.p ?? (isBreakerTripped ? 0 : 535)) / 1000;
      if (currentPowerKW > 0 && !isBreakerTripped) {
        setAccumulatedEnergyKWh((prev) => prev + currentPowerKW * dtHours);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [telemetry?.p1?.p, isBreakerTripped]);

  // Fetch tickets for Outage & Workforce Management
  const fetchTickets = React.useCallback(async () => {
    try {
      const res = await fetch("/api/oms/tickets");
      const json = await res.json();
      if (json.tickets) {
        setTickets(json.tickets);
      }
    } catch (err) {
      console.error("Failed to fetch tickets", err);
    }
  }, []);

  // Fetch 3-Phase Network Twin Snapshot
  const fetchNetworkSnapshot = React.useCallback(async () => {
    try {
      const res = await fetch("/api/network/snapshot");
      const json = await res.json();
      if (json.snapshot) {
        setNetworkSnapshot(json.snapshot);
      }
    } catch (err) {
      console.error("Failed to fetch network snapshot", err);
    }
  }, []);

  // 1. Establish SSE real-time stream
  React.useEffect(() => {
    let eventSource: EventSource | null = null;

    function connectSSE() {
      eventSource = new EventSource("/api/telemetry/stream");

      eventSource.onopen = () => {
        setConnectedSSE(true);
        lastPacketTimeRef.current = Date.now();
        setIsStreamDisconnected(false);
      };

      eventSource.onmessage = (event) => {
        try {
          lastPacketTimeRef.current = Date.now();
          setIsStreamDisconnected(false);
          const data = JSON.parse(event.data);
          setLastHeartbeat(new Date().toLocaleTimeString());

          if (data.type === "INITIAL" || data.type === "UPDATE") {
            if (data.telemetry) {
              setTelemetry(data.telemetry);
              if (data.telemetry.history) {
                setHistory(data.telemetry.history);
              }
            }
            if (data.status) setSystemStatus(data.status);
            if (data.logs) setLogs(data.logs);
            if (data.history) setHistory(data.history);
            if (data.networkSnapshot) setNetworkSnapshot(data.networkSnapshot);
            if (data.tickets) {
              setTickets(data.tickets);
            } else if (data.telemetry?.tickets) {
              setTickets(data.telemetry.tickets);
            }
          } else if (data.type === "NETWORK_SNAPSHOT" && data.networkSnapshot) {
            setNetworkSnapshot(data.networkSnapshot);
          } else if (data.type === "LOG" && data.log) {
            setLogs((prev) => [data.log, ...prev.slice(0, 30)]);
          }
        } catch (err) {
          console.error("SSE parse error", err);
        }
      };

      eventSource.onerror = () => {
        setConnectedSSE(false);
        setIsStreamDisconnected(true);
        if (eventSource) eventSource.close();
        setTimeout(connectSSE, 3000);
      };
    }

    connectSSE();
    fetchTickets();
    fetchNetworkSnapshot();

    // Query available serial ports
    fetch("/api/telemetry/ports")
      .then((res) => res.json())
      .then((data) => {
        if (data.ports) setAvailablePorts(data.ports);
        if (data.ports && data.ports.length > 0) {
          const preferred =
            data.status?.activePort ||
            data.ports.find((p: any) => p.path?.toUpperCase() === "COM8")?.path ||
            data.ports[0].path;
          setSelectedPort(preferred);
        }
      })
      .catch(() => {});

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchTickets, fetchNetworkSnapshot]);

  // 1B. SSE 5-second Watchdog to detect stalled stream or disconnected backend
  React.useEffect(() => {
    const watchdog = setInterval(() => {
      const elapsed = Date.now() - lastPacketTimeRef.current;
      if (elapsed > 5000 || !connectedSSE) {
        setIsStreamDisconnected(true);
      } else {
        setIsStreamDisconnected(false);
      }
    }, 1000);

    return () => clearInterval(watchdog);
  }, [connectedSSE]);

  // 2. Destructive Persistent Toast Handler on Fault Detection (Strict transition from NORMAL -> FAULT only)
  const wasFaultRef = React.useRef(false);

  React.useEffect(() => {
    if (!telemetry) return;

    const faultCode = telemetry.fault_code || "NORMAL";
    const isPowerCut = faultCode === "POWERCUT" || ((telemetry.p1?.v ?? 0) < 50 && (telemetry.p2?.v ?? 0) < 50);
    const isDifferential = faultCode === "DIFF_LEAKAGE" || (!isPowerCut && (telemetry.idiff ?? 0) >= (telemetry.trip_limit ?? 0.35));
    const isBrokenConductor = faultCode === "BROKEN_CONDUCTOR";
    const isBrokenNeutral = faultCode === "BROKEN_NEUTRAL";
    const isOvercurrent = faultCode === "OVERCURRENT";
    const isLastGasp = faultCode === "OUTAGE_LAST_GASP";

    const currentFault = isDifferential || isBrokenConductor || isBrokenNeutral || isOvercurrent || isLastGasp;

    // Fire toast and Industrial Audio Alarm strictly ONCE when transitioning from NORMAL to FAULT
    if (currentFault && !wasFaultRef.current && !activeFaultToastRef.current) {
      wasFaultRef.current = true;
      playIndustrialAlarm(); // Dual-Tone 880Hz / 660Hz Industrial SCADA Buzzer

      let faultTitle = "CRITICAL ALARM: ELECTRICAL FAULT DETECTED";
      let faultDesc = "Feeder anomaly detected by Central FDIR Engine.";

      if (isLastGasp) {
        faultTitle = "CRITICAL ALARM: LAST GASP OUTAGE (ANSI 67/N)";
        faultDesc = "Pole 2 power lost! Mains collapse emergency last-gasp beacon transmitted over LoRa Sub-GHz mesh.";
      } else if (isDifferential) {
        faultTitle = "CRITICAL ALARM: DIFFERENTIAL TRIP (|IA - IB| ≥ 0.35A)";
        faultDesc = `Feeder Differential Current ΔI = ${telemetry.idiff.toFixed(3)} A (Exceeds trip limit 0.350 A). Potential broken conductor, ground fault, or illegal tap.`;
      } else if (isBrokenConductor) {
        faultTitle = `CRITICAL ALARM: BROKEN CONDUCTOR (PHASE ${telemetry.fault_phase || "Y"})`;
        faultDesc = `Overhead conductor snapped downstream on Phase ${telemetry.fault_phase || "Y"}. Upstream energized, downstream collapsed to 0V.`;
      } else if (isBrokenNeutral) {
        faultTitle = "VOLTAGE ALARM: BROKEN NEUTRAL / SEVERE UNBALANCE";
        faultDesc = "Neutral displacement detected. Phase voltage unbalance exceeds 15% NEMA threshold across 3-phase grid.";
      } else if (isOvercurrent) {
        faultTitle = "TRIP ALARM: OVERCURRENT EXCEEDED (ANSI 50/51)";
        faultDesc = "Feeder line current exceeds 16.0 A continuous thermal limit.";
      }

      const toastId = addToast({
        title: faultTitle,
        description: faultDesc,
        type: "destructive",
        persistent: true, // Non-auto-dismissing: operator must click Acknowledge
        onAcknowledge: async () => {
          if (activeFaultToastRef.current) {
            removeToast(activeFaultToastRef.current);
            activeFaultToastRef.current = null;
          }
          await handleAcknowledgeAlarm();
        },
      });

      activeFaultToastRef.current = toastId;
    } else if (!currentFault) {
      // Fault cleared: reset tracking and remove any lingering fault toast
      wasFaultRef.current = false;
      if (activeFaultToastRef.current) {
        removeToast(activeFaultToastRef.current);
        activeFaultToastRef.current = null;
      }
    }
  }, [telemetry, addToast, removeToast]);

  // Acknowledge Alarm handler
  const handleAcknowledgeAlarm = async () => {
    setIsAcking(true);
    if (activeFaultToastRef.current) {
      removeToast(activeFaultToastRef.current);
      activeFaultToastRef.current = null;
    }
    clearAll();
    try {
      await fetch("/api/telemetry/ack", { method: "POST" });
    } catch (err) {
      console.error("Ack error", err);
    } finally {
      setIsAcking(false);
    }
  };

  // Port connect / disconnect handler
  const handlePortConnect = async () => {
    try {
      await fetch("/api/telemetry/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: systemStatus?.gatewayConnected ? "disconnect" : "connect",
          port: selectedPort,
          baudRate: 115200,
        }),
      });
    } catch (err) {
      console.error(err);
    }
  };



  const isPtwLocked =
    tickets.some((t) => t.ptw?.reclosingInterlockActive === true) ||
    systemStatus?.ptwInterlockActive === true;

  const isGatewayOffline =
    isStreamDisconnected ||
    systemStatus?.gatewayConnected === false ||
    telemetry?.status === "DISCONNECTED" ||
    telemetry?.status === "WAITING_DATA" ||
    telemetry?.fault_code === "GATEWAY_DISCONNECTED";

  const isP1Stale = isGatewayOffline || (telemetry?.p1?.age_ms ?? 0) > 20000;
  const isP2Stale = isGatewayOffline || (telemetry?.p2?.age_ms ?? 0) > 20000;

  const idiff = isGatewayOffline ? 0 : (telemetry?.idiff ?? 0);
  const tripLimit = 0.35;
  const v1 = isGatewayOffline ? 0 : (telemetry?.p1?.v ?? 0);
  const v2 = isGatewayOffline ? 0 : (telemetry?.p2?.v ?? 0);
  const i1 = isGatewayOffline ? 0 : (telemetry?.p1?.i ?? 0);
  const i2 = isGatewayOffline ? 0 : (telemetry?.p2?.i ?? 0);
  const faultCode = isGatewayOffline ? "GATEWAY_DISCONNECTED" : telemetry?.fault_code;

  // Guard against uninitialized node startup race-conditions:
  // Both nodes must have active, initialized power flow readings (V > 50V and I > 0.05A)
  // before differential protection (|I1 - I2| >= 0.35A) is evaluated.
  const bothNodesActive = !isGatewayOffline && (v1 > 50 && i1 > 0.05) && (v2 > 50 && i2 > 0.05);

  let activeFault: {
    ansiCode: string;
    title: string;
    reading: string;
    description: string;
    severity: string;
  } | null = null;

  if (!isGatewayOffline) {
    if (faultCode === "OUTAGE_LAST_GASP" || (v1 === 0 && v2 === 0 && (i1 > 0 || i2 > 0 || faultCode === "OUTAGE_LAST_GASP"))) {
      activeFault = {
        ansiCode: "ANSI 67/N",
        title: "MAINS COLLAPSE // LAST-GASP BEACON DETECTED",
        reading: `V1: ${v1.toFixed(1)}V | V2: ${v2.toFixed(1)}V (0V AC MAINS COLLAPSE)`,
        description: "Line voltage collapsed to 0V. Node transmitting emergency last-gasp beacon over Sub-GHz LoRa mesh.",
        severity: "CRITICAL",
      };
    } else if (i1 > 16 || i2 > 16 || faultCode === "OVERCURRENT") {
      activeFault = {
        ansiCode: "ANSI 50",
        title: "INSTANTANEOUS OVERCURRENT TRIP",
        reading: `I_PEAK: ${Math.max(i1, i2).toFixed(3)} A (RATED: 16.0 A)`,
        description: "Feeder current exceeded 16A instantaneous threshold. Breaker isolation triggered.",
        severity: "CRITICAL",
      };
    } else if ((v1 > 20 && (v1 < 180 || v1 > 265)) || (v2 > 20 && (v2 < 180 || v2 > 265))) {
      const isUnder = (v1 > 20 && v1 < 180) || (v2 > 20 && v2 < 180);
      activeFault = {
        ansiCode: isUnder ? "ANSI 27" : "ANSI 59",
        title: isUnder ? "UNDERVOLTAGE TRIP (BROWNOUT)" : "OVERVOLTAGE TRIP (SURGE)",
        reading: `V1: ${v1.toFixed(1)} V | V2: ${v2.toFixed(1)} V (NOMINAL: 230V ±10%)`,
        description: isUnder
          ? "Line voltage dropped below 180V brownout threshold."
          : "Line voltage exceeded 265V insulation surge threshold.",
        severity: "WARNING",
      };
    } else if (faultCode === "BROKEN_CONDUCTOR") {
      const brokenPhase = telemetry?.fault_phase && telemetry.fault_phase !== "NONE" ? telemetry.fault_phase : "Y";
      activeFault = {
        ansiCode: "ANSI 46/47",
        title: `CRITICAL ALARM: BROKEN CONDUCTOR (PHASE ${brokenPhase})`,
        reading: `PHASE ${brokenPhase} DOWNSTREAM SNAP (0V) // UPSTREAM ENERGIZED`,
        description: `Overhead line discontinuity on Phase ${brokenPhase}. Upstream energized, downstream collapsed to 0V.`,
        severity: "CRITICAL",
      };
    } else if (faultCode === "BROKEN_NEUTRAL") {
      activeFault = {
        ansiCode: "ANSI 47/N",
        title: "VOLTAGE ALARM: BROKEN NEUTRAL / SEVERE UNBALANCE",
        reading: "NEUTRAL DISPLACEMENT > 15% NEMA TRIP THRESHOLD",
        description: "Broken neutral return conductor detected. Phase voltages asymmetric across 3-phase grid.",
        severity: "CRITICAL",
      };
    } else if (faultCode === "POWERCUT" || (v1 < 50 && v2 < 50 && !isGatewayOffline)) {
      activeFault = {
        ansiCode: "ANSI 27",
        title: "FEEDER DE-ENERGIZED // SCHEDULED OUTAGE OR BLACKOUT",
        reading: `V1: ${v1.toFixed(1)}V | V2: ${v2.toFixed(1)}V (0V SUPPLY)`,
        description: "Feeder is fully de-energized across all phases (scheduled power cut or upstream feeder trip).",
        severity: "WARNING",
      };
    } else if (bothNodesActive && (telemetry?.fault || idiff >= 0.35)) {
      activeFault = {
        ansiCode: "ANSI 87L",
        title: "CURRENT DIFFERENTIAL PROTECTION (FEEDER LEAKAGE / THEFT)",
        reading: `ΔI = ${idiff.toFixed(3)} A (TRIP LIMIT: 0.350 A) | I1: ${i1.toFixed(3)} A | I2: ${i2.toFixed(3)} A`,
        description: `Current imbalance between Pole 1 and Pole 2 (${idiff.toFixed(3)} A) exceeds safety limit (0.350 A). Broken conductor, ground fault, or illegal tap.`,
        severity: "CRITICAL",
      };
    } else if (bothNodesActive && faultCode && faultCode !== "NORMAL") {
      activeFault = {
        ansiCode: "ANSI 87L",
        title: `FEEDER PROTECTION ANOMALY: ${faultCode}`,
        reading: `ΔI = ${idiff.toFixed(3)} A | V1: ${v1.toFixed(1)} V | I1: ${i1.toFixed(3)} A`,
        description: "Grid protection relay flagged an abnormal operating state on Feeder 04.",
        severity: "CRITICAL",
      };
    }
  }

  // Network Twin FDIR Detection Fallback (promotes simulated/injected feeder faults to global alarm banner)
  if (!activeFault && networkSnapshot && networkSnapshot.detections.length > 0) {
    const topDet = networkSnapshot.detections.find((d) => d.severity === "CRITICAL" || d.severity === "HIGH") || networkSnapshot.detections[0];
    if (topDet) {
      activeFault = {
        ansiCode: topDet.ansi,
        title: `${topDet.type.replace(/_/g, " ")} (${topDet.sectionId ? `Section ${topDet.sectionId}` : topDet.nodeId ? `Pole ${topDet.nodeId}` : topDet.feederId})`,
        reading: topDet.message,
        description: topDet.message,
        severity: topDet.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      };
    }
  }

  const isFault = activeFault !== null;
  const isAlarmUnacked = isFault && systemStatus?.operatorAck === false;
  const openTicketsCount = tickets.filter((t) => t.status !== "CLOSED").length;

  const p1PowerW = isBreakerTripped || isGatewayOffline ? 0 : (telemetry?.p1?.p ?? 0);
  const p2PowerW = isBreakerTripped || isGatewayOffline ? 0 : (telemetry?.p2?.p ?? 0);
  const feederLoadW = Math.round(p1PowerW);
  const feederLoadKW = (p1PowerW / 1000).toFixed(2);
  // Ensure line loss is physically positive along series radial line
  const lineLossW = Math.max(0, p1PowerW - p2PowerW);
  const lineLossPct = p1PowerW > 0 ? ((lineLossW / p1PowerW) * 100).toFixed(2) : "0.00";
  const feederEnergyKWh = accumulatedEnergyKWh.toFixed(3);
  
  // Digital Twin Grid macro metrics across 28 poles and 3 feeders
  const gridMetrics = React.useMemo(() => {
    if (!networkSnapshot) return null;
    const totalLoadKw = networkSnapshot.nodes.reduce(
      (acc, n) => acc + (n.phases.R.p + n.phases.Y.p + n.phases.B.p) / 1000,
      0
    );
    const technicalLossKw = Math.max(0, networkSnapshot.dtr.kw - totalLoadKw);
    const technicalLossPct =
      networkSnapshot.dtr.kw > 0 ? (technicalLossKw / networkSnapshot.dtr.kw) * 100 : 0;
    const criticalDetections = networkSnapshot.detections.filter(
      (d) => d.severity === "CRITICAL"
    ).length;
    const trippedSections = networkSnapshot.sections.filter((s) => s.tripped).length;
    const f1 = networkSnapshot.feeders.find((f) => f.id === "LT-1");
    const f2 = networkSnapshot.feeders.find((f) => f.id === "LT-2");
    const f3 = networkSnapshot.feeders.find((f) => f.id === "LT-3");

    return {
      totalLoadKw,
      technicalLossKw,
      technicalLossPct,
      criticalDetections,
      trippedSections,
      totalDetections: networkSnapshot.detections.length,
      f1Kw: f1?.kw ?? 0,
      f2Kw: f2?.kw ?? 0,
      f3Kw: f3?.kw ?? 0,
    };
  }, [networkSnapshot]);

  const handleExportCsv = () => {
    if (!logs || logs.length === 0) return;
    const headers = ["ID", "Timestamp", "Level", "Subsystem", "Message", "Details"];
    const rows = logs.map((l) => [
      `"${l.id}"`,
      `"${l.timestamp}"`,
      `"${l.level}"`,
      `"${l.source}"`,
      `"${(l.message || "").replace(/"/g, '""')}"`,
      `"${(l.details || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `gridsense_soe_log_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Control Room Keyboard Hotkeys Listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or form field
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      // Esc: Acknowledge active alarm
      if (e.key === "Escape") {
        if (activeFault) {
          e.preventDefault();
          handleAcknowledgeAlarm();
        }
      }

      // Alt + 1..7: Switch between the 7 primary SCADA tabs
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === "1") { e.preventDefault(); setActiveView("OPERATOR"); }
        else if (e.key === "2") { e.preventDefault(); setActiveView("GIS"); }
        else if (e.key === "3") { e.preventDefault(); setActiveView("NETWORK"); }
        else if (e.key === "4") { e.preventDefault(); setActiveView("WAVEFORMS"); }
        else if (e.key === "5") { e.preventDefault(); setActiveView("OMS"); }
        else if (e.key === "6") { e.preventDefault(); setActiveView("DIAGNOSTICS"); }
        else if (e.key === "7") { e.preventDefault(); setActiveView("LOGS"); }
      }

      // Space: Freeze / Resume Waveform when viewing WAVEFORMS tab
      if (e.code === "Space" && activeView === "WAVEFORMS") {
        e.preventDefault();
        setIsWaveformFrozen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFault, activeView]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0b0f17] text-slate-900 dark:text-[#f8fafc] flex flex-col p-3 md:p-4 gap-3 select-none transition-colors duration-150">
      {/* 1. TOP SCADA HEADER BAR - MODERN ENTERPRISE ADMS */}
      <header className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-2.5 px-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-xs dark:shadow-none transition-colors">
        {/* Left: Branding & Substation Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 rounded-md">
            <Zap className="h-4.5 w-4.5 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">
                GridSense <span className="text-slate-400 dark:text-slate-600 font-normal">|</span> Distribution Control Desk
              </h1>
              <Badge
                variant={isFault ? "destructive" : "healthy"}
                className="text-[11px]"
              >
                {isFault ? "FEEDER ALERT" : "FEEDER HEALTHY"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
              {ENTERPRISE_CONFIG.SUBSTATION_NAME} • {ENTERPRISE_CONFIG.FEEDER_NAME}
            </p>
          </div>
        </div>

        {/* Center: Clean Human-Friendly View Tabs */}
        <nav className="flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-1 text-xs gap-1">
          <button
            onClick={() => setActiveView("OPERATOR")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
              activeView === "OPERATOR"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Operator Desk
          </button>
          <button
            onClick={() => setActiveView("GIS")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
              activeView === "GIS"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            GIS Map
          </button>
          <button
            onClick={() => setActiveView("NETWORK")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeView === "NETWORK"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Network Matrix</span>
            {networkSnapshot && networkSnapshot.detections.length > 0 && (
              <span className="bg-rose-500/20 text-rose-500 border border-rose-500/40 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                {networkSnapshot.detections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("WAVEFORMS")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
              activeView === "WAVEFORMS"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Waveforms
          </button>
          <button
            onClick={() => setActiveView("OMS")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeView === "OMS"
                ? "bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Outage &amp; Workforce</span>
            {openTicketsCount > 0 && (
              <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                {openTicketsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("DIAGNOSTICS")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeView === "DIAGNOSTICS"
                ? "bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Diagnostics</span>
          </button>
          <button
            onClick={() => setActiveView("LOGS")}
            className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
              activeView === "LOGS"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Event Log
          </button>
        </nav>

        {/* Right: Essential Operator Status Indicators & Theme Toggle */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {systemStatus?.ptwInterlockActive && (
            <Badge
              variant="warning"
              className="flex items-center gap-1.5 py-1 bg-amber-50 dark:bg-amber-950/80 border-amber-500/70 text-amber-800 dark:text-amber-300 font-medium"
            >
              <Lock className="h-3.5 w-3.5 text-amber-500" />
              <span>PTW LOCKOUT: ACTIVE</span>
            </Badge>
          )}

          <Badge
            variant={connectedSSE ? "healthy" : "destructive"}
            className="flex items-center gap-1.5 py-1"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connectedSSE ? "bg-emerald-500 dark:bg-emerald-400 animate-ping" : "bg-rose-500"
              }`}
            />
            <span>{connectedSSE ? "SYSTEM LIVE" : "DISCONNECTED"}</span>
          </Badge>

          {/* Theme Toggle Button */}
          <ThemeToggle />

          {/* Dual-Tone Audio Alarm Mute Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            title={isAudioMuted ? "Alarm Audio Muted (Click to Unmute)" : "Alarm Audio Active (Click to Mute)"}
            className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${
              isAudioMuted
                ? "bg-amber-950/40 border-amber-600/70 text-amber-300"
                : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            }`}
          >
            {isAudioMuted ? (
              <>
                <VolumeX className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden sm:inline">MUTED</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">AUDIO ON</span>
              </>
            )}
          </Button>

          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-400 tabular-nums font-mono">
            TIME: <span className="text-slate-900 dark:text-slate-200 font-semibold">{lastHeartbeat}</span>
          </div>
        </div>
      </header>

      {/* SSE STREAM DISCONNECTION HIGH-CONTRAST WARNING */}
      {isStreamDisconnected && (
        <div className="border border-rose-600 bg-rose-950 px-4 py-2.5 rounded-sm flex items-center justify-between text-rose-100 font-mono text-xs shadow-xl animate-pulse">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-5 w-5 text-rose-400 shrink-0 animate-bounce" />
            <div>
              <span className="font-bold text-white bg-rose-900 px-1.5 py-0.5 rounded-xs mr-2">
                CRITICAL: TELEMETRY STREAM DISCONNECTED
              </span>
              <span>No heartbeat received from Next.js SSE endpoint (&gt;5s). Reconnecting to /api/telemetry/stream...</span>
            </div>
          </div>
          <Badge variant="destructive" className="animate-ping font-bold">
            RECONNECTING
          </Badge>
        </div>
      )}

      {/* 2. PERSISTENT GLOBAL FAULT ALARM BANNER (ACTIVE ACROSS ALL TABS) */}
      {activeFault && (
        <div className="border border-rose-600 bg-rose-950/80 p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 animate-pulse ring-1 ring-rose-500 font-mono shadow-lg">
          <div className="flex items-center gap-3">
            <AlertOctagon className="h-6 w-6 text-rose-400 animate-bounce shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-200 flex flex-wrap items-center gap-2">
                <span className="bg-rose-900 border border-rose-400 text-white font-mono px-2 py-0.5 rounded-xs text-[10px] font-black">
                  {activeFault.ansiCode}
                </span>
                <span>{activeFault.title}</span>
                {isPtwLocked ? (
                  <span className="bg-amber-900/90 border border-amber-500 text-amber-200 text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold">
                    <Lock className="h-3 w-3" />
                    RECLOSE INTERLOCKED (PTW ACTIVE)
                  </span>
                ) : isAlarmUnacked && (
                  <span className="bg-rose-900 border border-rose-500 text-rose-100 text-[10px] px-2 py-0.5 rounded-sm animate-pulse">
                    UNACKNOWLEDGED ALARM
                  </span>
                )}
              </div>
              <div className="text-xs text-rose-300 mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-xs border border-rose-800">
                  {activeFault.reading}
                </span>
                <span>• {activeFault.description}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-amber-950/60 border-amber-600 hover:bg-amber-900/80 text-amber-200 font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm"
              onClick={() => setActiveView("OMS")}
            >
              <Wrench className="h-3.5 w-3.5 text-amber-400" />
              <span>JUMP TO OMS DISPATCH</span>
            </Button>

            <Button
              variant={isPtwLocked ? "outline" : "destructive"}
              size="sm"
              className={`font-mono font-bold text-xs ${
                isPtwLocked
                  ? "border-amber-600 text-amber-300 bg-amber-950/50 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              }`}
              onClick={handleAcknowledgeAlarm}
              disabled={isAcking}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {isAcking ? "CLEARING..." : isAlarmUnacked ? "ACKNOWLEDGE ALARM" : "RESET ALARM / RE-ARM"}
            </Button>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT AREA */}
      <main className="flex flex-col gap-3 flex-1">
        {/* ============================================================== */}
        {/* VIEW A: OPERATOR DESK (CLEAN, INTUITIVE, HUMAN-FIRST) */}
        {/* ============================================================== */}
        {activeView === "OPERATOR" && (
          <div className="flex-1 flex flex-col gap-3">
            {/* UNIFIED OPERATOR METRICS OVERVIEW: 28-POLE DISTRIBUTION GRID + PHYSICAL ANCHOR SPAN */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                  SYSTEM OVERVIEW
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    <span>DTR-01 (250 kVA) • 3 LT Feeders • 28 Poles Supervised</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700 hidden md:inline">|</span>
                  <span className="text-slate-600 dark:text-slate-300 text-xs hidden md:inline font-normal">
                    Feeder LT-1: Section 1 (ANSI 87L Differential Protection Zone)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="hidden sm:inline">SCADA Telemetry: Active • Latency &lt; 250ms</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {networkSnapshot ? `${networkSnapshot.nodes.length} Poles Supervised` : "Grid Syncing"}
                </span>
              </div>
            </div>

            {/* ROW 1: FOUR UNIFIED OPERATOR SCADA KPI METRIC CARDS */}
            <div className="grid grid-cols-12 gap-3">
              {/* CARD 1: Grid Protection & FLISR Supervision (ANSI 87L / 50/51) */}
              <Card
                isFault={isFault || (gridMetrics?.criticalDetections ?? 0) > 0}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Feeder Protection &amp; FLISR
                    </span>
                    {isGatewayOffline ? (
                      <Badge variant="outline" className="text-[11px] border-amber-500/80 text-amber-500 font-medium">
                        Gateway Offline
                      </Badge>
                    ) : isFault || (gridMetrics?.totalDetections ?? 0) > 0 ? (
                      <Badge variant="destructive" className="text-[11px]">
                        {isFault ? "Trip Alert" : `${gridMetrics?.totalDetections} Alerts`}
                      </Badge>
                    ) : (
                      <Badge variant="healthy" className="text-[11px]">
                        Supervised
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 shrink-0">
                      {isGatewayOffline ? (
                        <Radio className="h-6 w-6 text-amber-500 animate-pulse" />
                      ) : isFault || (gridMetrics?.criticalDetections ?? 0) > 0 ? (
                        <AlertOctagon className="h-6 w-6 text-rose-500 animate-bounce" />
                      ) : (gridMetrics?.totalDetections ?? 0) > 0 ? (
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                      ) : (
                        <ShieldCheck className="h-6 w-6 text-emerald-500" />
                      )}
                    </div>
                    <div>
                      <div
                        className={`text-lg font-bold tracking-tight ${
                          isGatewayOffline
                            ? "text-amber-500"
                            : isFault || (gridMetrics?.criticalDetections ?? 0) > 0
                            ? "text-rose-500 dark:text-rose-400"
                            : (gridMetrics?.totalDetections ?? 0) > 0
                            ? "text-amber-500 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {isGatewayOffline
                          ? "Telemetry Offline"
                          : isFault
                          ? telemetry?.fault_code || "Anomaly / Trip"
                          : (gridMetrics?.totalDetections ?? 0) > 0
                          ? `${gridMetrics?.totalDetections} Active Alerts`
                          : "All Feeders Balanced"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {isFault
                          ? `ΔI = ${idiff.toFixed(3)}A • Span F1-P01 ↔ F1-P02`
                          : (gridMetrics?.totalDetections ?? 0) > 0
                          ? `${gridMetrics?.criticalDetections} Critical • ${gridMetrics?.trippedSections} Tripped`
                          : `Differential ΔI = ${idiff.toFixed(3)}A • Normal`}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-slate-800/80 px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30 flex justify-between rounded-b-lg">
                  <span className="font-mono">ANSI 87L: {tripLimit.toFixed(3)}A</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">FLISR Armed</span>
                </div>
              </Card>

              {/* CARD 2: DTR-01 Total Demand & Feeder Power Flow */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-75 border-amber-500/50" : ""
              }`}>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      DTR-01 Active Power Flow
                    </span>
                    <Badge
                      variant={
                        (networkSnapshot?.dtr.loadingPct ?? 0) > 85
                          ? "destructive"
                          : (networkSnapshot?.dtr.loadingPct ?? 0) > 65
                          ? "warning"
                          : "healthy"
                      }
                      className="text-[11px]"
                    >
                      {networkSnapshot ? `${networkSnapshot.dtr.loadingPct.toFixed(1)}%` : "--%"} Capacity
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 shrink-0">
                      <Zap className="h-6 w-6 text-amber-500" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                        {networkSnapshot ? networkSnapshot.dtr.kw.toFixed(1) : feederLoadKW}{" "}
                        <span className="text-sm text-slate-400 font-normal">kW</span>
                        <span className="text-xs text-slate-400 font-normal ml-2 font-mono">
                          ({networkSnapshot ? networkSnapshot.dtr.kva.toFixed(1) : "---"} kVA)
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        LT-1 Incomer: <span className="text-slate-700 dark:text-slate-300 font-semibold tabular-nums">{feederLoadKW} kW</span>
                        <span className="ml-1 text-slate-400">• Loss: {gridMetrics ? gridMetrics.technicalLossKw.toFixed(2) : lineLossW.toFixed(1)} kW</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-slate-800/80 px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30 flex justify-between rounded-b-lg">
                  <span className="font-mono">
                    LT-1: {gridMetrics?.f1Kw.toFixed(0) ?? feederLoadKW}k | LT-2: {gridMetrics?.f2Kw.toFixed(0) ?? 0}k | LT-3: {gridMetrics?.f3Kw.toFixed(0) ?? 0}k
                  </span>
                  <span className="text-sky-600 dark:text-sky-400 font-medium">250 kVA Rating</span>
                </div>
              </Card>

              {/* CARD 3: 3-Phase Bus Voltage Level & Balance (IEEE 1159) */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-75 border-amber-500/50" : ""
              }`}>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      3-Phase Bus Voltage (DTR)
                    </span>
                    <Badge
                      variant={
                        (networkSnapshot?.dtr.unbalancePct ?? 0) > 3.0
                          ? "destructive"
                          : "healthy"
                      }
                      className="text-[11px]"
                    >
                      {(networkSnapshot?.dtr.unbalancePct ?? 0) > 3.0
                        ? "Unbalanced"
                        : "Balanced ±0.4%"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 shrink-0">
                      <Activity className="h-6 w-6 text-sky-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 tabular-nums space-x-2">
                        <span>
                          <strong className="text-rose-500 font-bold">R:</strong>{" "}
                          {v1 > 0 ? v1.toFixed(1) : networkSnapshot ? networkSnapshot.dtr.voltage.R.toFixed(1) : "---"}V
                        </span>
                        <span>
                          <strong className="text-amber-500 font-bold">Y:</strong>{" "}
                          {networkSnapshot ? networkSnapshot.dtr.voltage.Y.toFixed(1) : "---"}V
                        </span>
                        <span>
                          <strong className="text-sky-500 font-bold">B:</strong>{" "}
                          {networkSnapshot ? networkSnapshot.dtr.voltage.B.toFixed(1) : "---"}V
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        Freq: <span className="text-slate-700 dark:text-slate-200 font-semibold">{!isGatewayOffline && telemetry?.p1?.freq !== undefined && telemetry.p1.freq > 0 ? `${telemetry.p1.freq.toFixed(2)} Hz` : "50.00 Hz"}</span>
                        <span className="ml-2">Unbalance: {networkSnapshot ? networkSnapshot.dtr.unbalancePct.toFixed(2) : "0.00"}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-slate-800/80 px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30 flex justify-between rounded-b-lg">
                  <span className="font-mono">Secondary: 415V L-L / 240V L-N</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">IEEE 1159 OK</span>
                </div>
              </Card>

              {/* CARD 4: Grid Incomer Current & Conductor Integrity */}
              <Card
                isFault={isFault || (gridMetrics?.trippedSections ?? 0) > 0}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Grid Incomer &amp; Integrity
                    </span>
                    <Badge
                      variant={isGatewayOffline ? "outline" : isFault || (gridMetrics?.trippedSections ?? 0) > 0 ? "destructive" : "healthy"}
                      className="text-[11px]"
                    >
                      {isGatewayOffline ? "Offline" : isFault ? "Leak Alert" : (gridMetrics?.trippedSections ?? 0) > 0 ? "Span Trip" : "All Conductors Intact"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 shrink-0">
                      <GitBranch className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {networkSnapshot
                          ? (
                              networkSnapshot.dtr.current.R +
                              networkSnapshot.dtr.current.Y +
                              networkSnapshot.dtr.current.B
                            ).toFixed(1)
                          : (i1 + i2).toFixed(1)}{" "}
                        <span className="text-sm text-slate-400 font-normal">A (3Φ Sum)</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 space-x-1 tabular-nums">
                        <span>F1-P01: {i1.toFixed(2)}A</span>
                        <span>•</span>
                        <span>F1-P02: {i2.toFixed(2)}A</span>
                        <span>•</span>
                        <span className={idiff >= tripLimit ? "text-rose-500 font-bold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>ΔI: {idiff.toFixed(3)}A</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-slate-800/80 px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30 flex justify-between rounded-b-lg">
                  <span className="font-mono">
                    F1-P01 ↔ F1-P02: {networkSnapshot?.liveLinkUp ? "Continuous Energization" : "Supervised"}
                  </span>
                  <span className={isFault ? "text-rose-500 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                    {isFault ? "Conductor Leak" : "28 Poles Supervised"}
                  </span>
                </div>
              </Card>
            </div>

            {/* ROW 2: SINGLE-LINE DIAGRAM (SLD) POWER FLOW */}
            <SingleLinePowerFlow
              telemetry={telemetry}
              networkSnapshot={networkSnapshot}
              selectedPoleId={selectedPoleId}
              onSelectPole={handlePoleSelect}
            />

            {/* ROW 3: REAL GEOSPATIAL MAP (COL 8) + OPERATIONS DISPATCH STATION (COL 4) */}
            <div className="grid grid-cols-12 gap-3 flex-1 min-h-[440px]">
              {/* Left (8 cols): Mapbox Vector GIS Map */}
              <div className="col-span-12 lg:col-span-8 flex flex-col h-full min-h-[440px]">
                <GisFeederMap
                  telemetry={telemetry}
                  networkSnapshot={networkSnapshot}
                  selectedPoleId={selectedPoleId}
                  onSelectPole={handlePoleSelect}
                />
              </div>

              {/* Right (4 cols): Dedicated Feeder Asset Health & Live Span Monitor */}
              <div className="col-span-12 lg:col-span-4 flex flex-col h-full">
                <div className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 p-4 rounded-lg flex flex-col justify-between h-full shadow-xs gap-3">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                          Feeder Asset Health &amp; Span
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {networkSnapshot ? `${networkSnapshot.nodes.length} Poles • 3 Feeders` : "28 Poles • 3 Feeders"}
                      </Badge>
                    </div>

                    {/* Nodes List */}
                    <div className="space-y-2 mt-3">
                      {/* Node 1: F1-P01 Live Incomer */}
                      <div
                        onClick={() => handlePoleSelect("F1-P01")}
                        className={`flex items-center justify-between p-2.5 border rounded-lg cursor-pointer transition-all ${
                          selectedPoleId === "F1-P01" || selectedPoleId === "Pole-A"
                            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700"
                        } ${isP1Stale ? "opacity-60 border-amber-500/50" : ""}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${!isGatewayOffline && telemetry?.p1?.isOnline ? "bg-emerald-500" : "bg-slate-400"}`} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">F1-P01</span>
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-medium">
                                Incomer Terminal
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-400">Substation Tap • Phase R Metered</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums flex items-center gap-2">
                          {isP1Stale && (
                            <Badge variant="warning" className="text-[10px] py-0 border-amber-500 text-amber-500 font-medium">
                              {isGatewayOffline ? "Offline" : "Stale"}
                            </Badge>
                          )}
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {!isGatewayOffline && telemetry?.p1?.isOnline ? `${telemetry.p1.v.toFixed(1)}V • ${telemetry.p1.i.toFixed(2)}A` : "Offline"}
                          </span>
                        </div>
                      </div>

                      {/* Node 2: F1-P02 Live Outgoing */}
                      <div
                        onClick={() => handlePoleSelect("F1-P02")}
                        className={`flex items-center justify-between p-2.5 border rounded-lg cursor-pointer transition-all ${
                          selectedPoleId === "F1-P02" || selectedPoleId === "Pole-B"
                            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700"
                        } ${isP2Stale ? "opacity-60 border-amber-500/50" : ""}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                              isGatewayOffline
                                ? "bg-slate-400"
                                : telemetry?.p2?.isOnline === false
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">F1-P02</span>
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-medium">
                                Section Terminal
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-400">Differential Boundary • Phase R</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums flex items-center gap-2">
                          {isP2Stale && (
                            <Badge variant="warning" className="text-[10px] py-0 border-amber-500 text-amber-500 font-medium">
                              {isGatewayOffline ? "Offline" : "Stale"}
                            </Badge>
                          )}
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {isGatewayOffline || telemetry?.p2?.isOnline === false ? (
                              <span className="text-slate-400 font-normal">Offline</span>
                            ) : (
                              `${telemetry?.p2?.v.toFixed(1)}V • ${telemetry?.p2?.i.toFixed(2)}A`
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Protected Differential Zone Span Summary */}
                      <div className="flex items-center justify-between p-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <Activity className={`h-4 w-4 ${isFault ? "text-rose-500 animate-pulse" : "text-emerald-500"}`} />
                          <span className="text-slate-700 dark:text-slate-300 font-medium">ANSI 87L Differential Span:</span>
                        </div>
                        <Badge
                          variant={isFault ? "destructive" : "healthy"}
                          className="text-[11px]"
                        >
                          {isFault ? `Trip: ΔI = ${(telemetry?.idiff ?? 0).toFixed(3)}A` : `120m Intact (ΔI ${(telemetry?.idiff ?? 0).toFixed(3)}A)`}
                        </Badge>
                      </div>

                      {/* Downstream Radial Feeders Summary */}
                      <div className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 rounded-lg text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span>Feeder LT-1 Downstream:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">F1-P03 ➔ F1-P10 (8 Spans)</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span>Feeder LT-2 &amp; LT-3:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">18 Spans Supervised</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span>RF Telemetry Bus:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            {isGatewayOffline ? "Disconnected" : "866.3 MHz IN865 (Active)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Outage & Supervision Status Strip */}
                  <div className="border border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/50 p-3 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Feeder Protection Status:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        ONLINE
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Lineman Outage Tickets:</span>
                      <button
                        onClick={() => setActiveView("OMS")}
                        className="font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {openTicketsCount > 0 ? `${openTicketsCount} Open (Review)` : "0 Active (Healthy)"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW B: GIS FULL VIEW WITH ASSET TREE */}
        {/* ============================================================== */}
        {activeView === "GIS" && (
          <div className="grid grid-cols-12 gap-3 flex-1 min-h-[580px]">
            <div className="col-span-12 lg:col-span-8 flex flex-col h-full min-h-[550px]">
              <GisFeederMap
                telemetry={telemetry}
                networkSnapshot={networkSnapshot}
                selectedPoleId={selectedPoleId}
                onSelectPole={handlePoleSelect}
              />
            </div>
            <div className="col-span-12 lg:col-span-4 flex flex-col h-full min-h-[550px]">
              <FeederAssetTree
                telemetry={telemetry}
                networkSnapshot={networkSnapshot}
                selectedPoleId={selectedPoleId}
                onSelectPole={handlePoleSelect}
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW B2: 3-PHASE NETWORK DIGITAL TWIN & SIMULATOR */}
        {/* ============================================================== */}
        {activeView === "NETWORK" && (
          <div className="flex-1 flex flex-col">
            <NetworkTwinView
              snapshot={networkSnapshot}
              onRefresh={fetchNetworkSnapshot}
              selectedPoleId={selectedPoleId}
              onSelectPole={handlePoleSelect}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW C: WAVEFORM MONITOR */}
        {/* ============================================================== */}
        {activeView === "WAVEFORMS" && (
          <div className="flex-1 flex flex-col">
            <TelemetryTrendChart
              history={history}
              tripLimit={0.35}
              isFrozen={isWaveformFrozen}
              onToggleFreeze={() => setIsWaveformFrozen(!isWaveformFrozen)}
              networkSnapshot={networkSnapshot}
              selectedPoleId={selectedPoleId}
              onSelectPole={handlePoleSelect}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW D: WORKFORCE & OUTAGE MANAGEMENT (OMS) */}
        {/* ============================================================== */}
        {activeView === "OMS" && (
          <div className="flex-1 min-h-[500px]">
            <WorkforceOmsPanel
              tickets={tickets}
              onRefresh={fetchTickets}
              isBreakerTripped={isBreakerTripped}
              isFault={isFault}
              networkSnapshot={networkSnapshot}
              selectedPoleId={selectedPoleId}
              onSelectPole={handlePoleSelect}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW E: ENGINEERING & FIRMWARE DIAGNOSTICS */}
        {/* ============================================================== */}
        {activeView === "DIAGNOSTICS" && (
          <EngineeringDiagnostics
            telemetry={telemetry}
            networkSnapshot={networkSnapshot}
            systemStatus={systemStatus}
            availablePorts={availablePorts}
            selectedPort={selectedPort}
            onSelectPort={setSelectedPort}
            onConnectPort={handlePortConnect}
          />
        )}

        {/* ============================================================== */}
        {/* VIEW F: SEQUENTIAL EVENT RECORDER (SER AUDIT LOG) */}
        {/* ============================================================== */}
        {activeView === "LOGS" && (
          <Card className="col-span-12 flex-1 flex flex-col min-h-[500px]">
            <CardHeader className="py-3 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Sequential Event Recorder (SER) • Audit Log</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono tabular-nums">Records: {logs.length}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-7 px-2.5 text-xs rounded-md border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <Download className="h-3 w-3 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>

            <div className="flex-1 min-h-[380px] max-h-[calc(100vh-250px)] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    <TableHead className="w-28 text-slate-400 uppercase tracking-wider font-medium text-[10px]">Timestamp</TableHead>
                    <TableHead className="w-24 text-slate-400 uppercase tracking-wider font-medium text-[10px]">Severity</TableHead>
                    <TableHead className="w-32 text-slate-400 uppercase tracking-wider font-medium text-[10px]">Subsystem</TableHead>
                    <TableHead className="text-slate-400 uppercase tracking-wider font-medium text-[10px]">Event Message / Operator Directive</TableHead>
                    <TableHead className="w-48 text-right text-slate-400 uppercase tracking-wider font-medium text-[10px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                        Awaiting SCADA telemetry records...
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <TableCell className="text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.level === "CRITICAL"
                                ? "destructive"
                                : log.level === "WARN"
                                ? "warning"
                                : "secondary"
                            }
                            className="text-[9px]"
                          >
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">
                          {log.source}
                        </TableCell>
                        <TableCell className="text-slate-800 dark:text-slate-200">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-right text-slate-500 dark:text-slate-400 text-[11px] font-mono truncate max-w-xs">
                          {log.details || "--"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>

      {/* 4. FOOTER STATUS BAR */}
      <footer className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 px-4 py-2 rounded-lg flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <span>Station: <strong className="text-slate-700 dark:text-slate-300 font-medium">{ENTERPRISE_CONFIG.CONTROL_CENTER}</strong></span>
          <span>•</span>
          <span>Feeder: <strong className="text-slate-700 dark:text-slate-300 font-medium">11kV Sector 4 Primary</strong></span>
          <span>•</span>
          <span>Bus: <strong className="text-slate-700 dark:text-slate-300 font-medium">{ENTERPRISE_CONFIG.TELEMETRY_BUS}</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 border-l border-slate-200 dark:border-slate-800 pl-3">
            <Keyboard className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <span><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Esc</kbd> Ack</span>
            <span>•</span>
            <span><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Alt+1..6</kbd> Views</span>
            <span>•</span>
            <span><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Space</kbd> Freeze</span>
          </div>
          <div>
            <span>{ENTERPRISE_CONFIG.COPYRIGHT}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
