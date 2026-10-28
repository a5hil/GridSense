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
  Wrench,
  Zap,
  User,
  LogOut,
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
import { ScadaUser } from "@/lib/auth";
import { NetworkTwinView } from "@/components/scada/NetworkTwinView";
import { PlatformLoadingOverlay } from "@/components/scada/PlatformLoadingOverlay";
import { NetworkSnapshot } from "@/lib/network/types";
import { useDashboard } from "@/context/DashboardContext";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

export default function SCADADashboard() {
  const { addToast, removeToast, clearAll } = useToast();

  const [telemetry, setTelemetry] = React.useState<GridTelemetry | null>(null);
  const [networkSnapshot, setNetworkSnapshot] = React.useState<NetworkSnapshot | null>(null);
  const [systemStatus, setSystemStatus] = React.useState<SystemStatus | null>(null);
  const [logs, setLogs] = React.useState<SCADAEventLog[]>([]);
  const [history, setHistory] = React.useState<HistoricalTelemetryPoint[]>([]);
  const [tickets, setTickets] = React.useState<TroubleTicket[]>([]);
  const [linemanPhone, setLinemanPhone] = React.useState<string>("+919037129026");
  const {
    activeView,
    setActiveView,
    setIsFault: setGlobalIsFault,
    setActiveFaultAnsi,
    setActiveFaultTitle,
    connectedSSE,
    setConnectedSSE,
    isAudioMuted,
    setIsAudioMuted,
    lastHeartbeat,
    setLastHeartbeat,
    setNetworkSnapshot: setGlobalNetworkSnapshot,
    setOpenTicketsCount,
    setSystemStatus: setGlobalSystemStatus,
  } = useDashboard();

  const [availablePorts, setAvailablePorts] = React.useState<any[]>([]);
  const [selectedPort, setSelectedPort] = React.useState<string>("");
  const [isAcking, setIsAcking] = React.useState(false);
  const [selectedPoleId, setSelectedPoleId] = React.useState<string>("F1-P01");
  const handlePoleSelect = React.useCallback((target: any) => {
    if (!target) {
      setSelectedPoleId("");
      return;
    }
    const id = typeof target === "string" ? target : target.id;
    setSelectedPoleId(id || "");
  }, []);
  const [isBreakerTripped, setIsBreakerTripped] = React.useState(false);

  // Waveform Freeze / Capture State
  const [isWaveformFrozen, setIsWaveformFrozen] = React.useState(false);
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
  const [isPlatformReady, setIsPlatformReady] = React.useState<boolean>(false);
  const handlePlatformReady = React.useCallback(() => setIsPlatformReady(true), []);

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
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json && Array.isArray(json.tickets)) {
        setTickets(json.tickets);
      }
      if (json && json.settings?.linemanPhone) {
        setLinemanPhone(json.settings.linemanPhone);
      }
    } catch (err) {
      console.error("Failed to fetch tickets", err);
    }
  }, []);

  // Fetch 3-Phase Network Twin Snapshot
  const fetchNetworkSnapshot = React.useCallback(async () => {
    try {
      const res = await fetch("/api/network/snapshot");
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json && json.snapshot) {
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
        persistent: false, // Auto-dismiss after 5s; the persistent top banner holds active unacked state without blocking the supervisory panel
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
  let isPowerCut =
    !isGatewayOffline &&
    (faultCode === "POWERCUT" ||
      (!isBreakerTripped && v1 < 50 && v2 < 50));

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
      const brokenPhase = telemetry?.fault_phase && telemetry.fault_phase !== "NONE" ? telemetry.fault_phase : "R";
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
    } else if (bothNodesActive && faultCode && faultCode !== "NORMAL" && faultCode !== "PROTECTION_BLIND" && faultCode !== "POLE_OFFLINE") {
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

  if (activeFault?.ansiCode === "ANSI 27") {
    isPowerCut = true;
  }
  const isFault = activeFault !== null;
  const isAlarmUnacked = isFault && systemStatus?.operatorAck === false;
  const openTicketsCount = tickets.filter((t) => t.status !== "CLOSED" && t.status !== "MAINTENANCE_SUPPRESSED").length;
  const watchingTicket = tickets.find((t) => t.status === "WATCHING");
  const escalatedTicket = tickets.find((t) => t.status === "ESCALATED");
  const dispatchedTicket = tickets.find(
    (t) => t.status === "DISPATCHED" || t.status === "CREW_ON_SITE" || t.status === "PTW_ISSUED"
  );

  // Sync state to global DashboardContext
  React.useEffect(() => {
    setGlobalIsFault(isFault);
    setActiveFaultAnsi(activeFault?.ansiCode || null);
    setActiveFaultTitle(activeFault?.title || null);
  }, [isFault, activeFault, setGlobalIsFault, setActiveFaultAnsi, setActiveFaultTitle]);

  React.useEffect(() => {
    setGlobalNetworkSnapshot(networkSnapshot);
  }, [networkSnapshot, setGlobalNetworkSnapshot]);

  React.useEffect(() => {
    setOpenTicketsCount(openTicketsCount);
  }, [openTicketsCount, setOpenTicketsCount]);

  React.useEffect(() => {
    setGlobalSystemStatus(systemStatus);
  }, [systemStatus, setGlobalSystemStatus]);

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

  const isDataReady = Boolean(networkSnapshot && (connectedSSE || telemetry));

  return (
    <div className="min-h-full flex-1 flex flex-col gap-2.5 font-mono">
      {!isPlatformReady && (
        <PlatformLoadingOverlay
          isDataReady={isDataReady}
          onFinished={handlePlatformReady}
        />
      )}

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
        <div className="border border-rose-400 dark:border-rose-600 bg-rose-50 dark:bg-rose-950/80 p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 animate-pulse ring-1 ring-rose-300 dark:ring-rose-500 font-mono shadow-sm dark:shadow-lg transition-colors">
          <div className="flex items-center gap-3">
            <AlertOctagon className="h-6 w-6 text-rose-600 dark:text-rose-400 animate-bounce shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-200 flex flex-wrap items-center gap-2">
                <span className="bg-rose-600 text-white dark:bg-rose-900 border border-rose-500 dark:border-rose-400 font-mono px-2 py-0.5 rounded-xs text-[10px] font-black">
                  {activeFault.ansiCode}
                </span>
                <span>{activeFault.title}</span>
                {isPtwLocked ? (
                  <span className="bg-amber-100 border border-amber-400 text-amber-900 dark:bg-amber-900/90 dark:border-amber-500 dark:text-amber-200 text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold">
                    <Lock className="h-3 w-3" />
                    RECLOSE INTERLOCKED (PTW ACTIVE)
                  </span>
                ) : escalatedTicket ? (
                  <span className="bg-rose-100 border border-rose-400 text-rose-900 dark:bg-rose-900 dark:border-rose-400 dark:text-rose-100 text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold animate-pulse">
                    <AlertOctagon className="h-3 w-3 text-rose-600 dark:text-rose-300" />
                    {escalatedTicket.safetyBypassTriggered ? "SAFETY OVERRIDE // DISPATCH REQUIRED" : "OUTAGE ESCALATED (>15m) // DISPATCH REQUIRED"}
                  </span>
                ) : watchingTicket ? (
                  <span className="bg-amber-100 border border-amber-400 text-amber-900 dark:bg-amber-900/80 dark:border-amber-500 dark:text-amber-200 text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold">
                    <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    TRANSIENT SOAK OBSERVATION (CREW NOT DISPATCHED)
                  </span>
                ) : isAlarmUnacked && (
                  <span className={`${isPowerCut ? "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/80 dark:border-amber-500 dark:text-amber-200" : "bg-rose-100 border-rose-400 text-rose-900 dark:bg-rose-900 dark:border-rose-500 dark:text-rose-100"} border text-[10px] px-2 py-0.5 rounded-sm font-bold animate-pulse`}>
                    {isPowerCut ? "DE-ENERGIZATION ADVISORY" : "UNACKNOWLEDGED RELAY TRIP"}
                  </span>
                )}
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-300 mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-bold text-rose-950 dark:text-white bg-white dark:bg-black/40 px-1.5 py-0.5 rounded-xs border border-rose-300 dark:border-rose-800">
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
              className="bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/60 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/80 font-mono font-bold text-xs flex items-center gap-1.5 shadow-xs"
              onClick={() => setActiveView("OMS")}
            >
              <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>{escalatedTicket ? "ASSIGN FIELD CREW (OMS)" : watchingTicket ? "VIEW SOAK WATCHLIST (OMS)" : "OUTAGE MANAGEMENT (OMS)"}</span>
            </Button>

            <Button
              variant={isPtwLocked ? "outline" : isPowerCut ? "secondary" : "destructive"}
              size="sm"
              className={`font-mono font-bold text-xs ${
                isPtwLocked
                  ? "border-amber-500 text-amber-900 bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:bg-amber-950/50 cursor-not-allowed"
                  : isPowerCut
                  ? "bg-slate-200 hover:bg-slate-300 text-slate-900 border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-700"
                  : "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
              }`}
              onClick={handleAcknowledgeAlarm}
              disabled={isAcking}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {isAcking ? "CLEARING..." : isPowerCut ? "ACKNOWLEDGE OUTAGE" : isAlarmUnacked ? "ACKNOWLEDGE TRIP ALARM" : "CLEAR LATCH / RE-ARM PROTECTION"}
            </Button>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col gap-2.5 min-h-0">
        {/* ============================================================== */}
        {/* VIEW A: OPERATOR DESK (CLEAN, INTUITIVE, HUMAN-FIRST) */}
        {/* ============================================================== */}
        {activeView === "OPERATOR" && (
          <div className="flex-1 flex flex-col gap-2.5 min-h-0">
            {/* ROW 1: FOUR UNIFIED OPERATOR SCADA KPI METRIC CARDS */}
            <div className="grid grid-cols-12 gap-2.5 shrink-0">
              {/* CARD 1: Grid Protection & FLISR Supervision (ANSI 87L / 50/51) */}
              <Card
                isFault={!isPowerCut && (isFault || (gridMetrics?.criticalDetections ?? 0) > 0)}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      FEEDER PROTECTION &amp; AUTOMATION (FDIR)
                    </span>
                    {isGatewayOffline ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/80 text-amber-600 dark:text-amber-500 font-bold">
                        GATEWAY OFFLINE
                      </Badge>
                    ) : isPowerCut ? (
                      <Badge variant="warning" className="text-[10px]">
                        POWERCUT (ANSI 27)
                      </Badge>
                    ) : isFault || (gridMetrics?.totalDetections ?? 0) > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        {isFault ? "RELAY TRIP" : `${gridMetrics?.totalDetections} ANOMALIES`}
                      </Badge>
                    ) : (
                      <Badge variant="healthy" className="text-[10px]">
                        ARMED &amp; SUPERVISED
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    {isGatewayOffline ? (
                      <Radio className="h-7 w-7 text-amber-500 animate-pulse shrink-0" />
                    ) : isPowerCut ? (
                      <Power className="h-7 w-7 text-amber-500 shrink-0" />
                    ) : isFault || (gridMetrics?.criticalDetections ?? 0) > 0 ? (
                      <AlertOctagon className="h-7 w-7 text-rose-600 dark:text-rose-500 shrink-0 animate-bounce" />
                    ) : (gridMetrics?.totalDetections ?? 0) > 0 ? (
                      <AlertTriangle className="h-7 w-7 text-amber-500 shrink-0 animate-pulse" />
                    ) : (
                      <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <div>
                      <div
                        className={`text-lg font-bold font-mono tracking-tight ${
                          isGatewayOffline
                            ? "text-amber-600 dark:text-amber-500"
                            : isPowerCut
                            ? "text-amber-600 dark:text-amber-400"
                            : isFault || (gridMetrics?.criticalDetections ?? 0) > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : (gridMetrics?.totalDetections ?? 0) > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {isGatewayOffline
                          ? "TELEMETRY OFFLINE"
                          : isPowerCut
                          ? "POWERCUT (0V SUPPLY)"
                          : isFault
                          ? telemetry?.fault_code || "ANOMALY / TRIP"
                          : (gridMetrics?.totalDetections ?? 0) > 0
                          ? `${gridMetrics?.totalDetections} ACTIVE ALERTS`
                          : "FEEDER OPERATION: BALANCED & NORMAL"}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                        {isPowerCut
                          ? "Feeder unpowered • Upstream supply 0.0V"
                          : isFault
                          ? `ΔI = ${idiff.toFixed(3)}A • Span F1-P01 ↔ F1-P02`
                          : (gridMetrics?.totalDetections ?? 0) > 0
                          ? `${gridMetrics?.criticalDetections} Critical • ${gridMetrics?.trippedSections} Spans Tripped`
                          : `Line Differential ΔI = ${idiff.toFixed(3)}A • Conductor Normal`}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-zinc-800/60 px-3 py-1 text-[10px] text-slate-500 dark:text-zinc-400 font-mono flex justify-between">
                  <span>PICKUP: {tripLimit.toFixed(3)}A</span>
                  <span className="text-emerald-600 dark:text-emerald-500 font-semibold">FLISR AUTOMATION: ARMED</span>
                </div>
              </Card>

              {/* CARD 2: DTR-01 Total Demand & Feeder Power Flow */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-75 border-amber-500/50" : ""
              }`}>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      DISTRIBUTION TRANSFORMER DEMAND (DTR-01)
                    </span>
                    <Badge
                      variant={
                        (networkSnapshot?.dtr.loadingPct ?? 0) > 85
                          ? "destructive"
                          : (networkSnapshot?.dtr.loadingPct ?? 0) > 65
                          ? "warning"
                          : "healthy"
                      }
                      className="text-[10px]"
                    >
                      {networkSnapshot ? `${networkSnapshot.dtr.loadingPct.toFixed(1)}%` : "--%"} CAPACITY
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <Zap className="h-7 w-7 text-amber-500 shrink-0" />
                    <div>
                      <div className="text-2xl font-bold font-mono text-slate-900 dark:text-zinc-100 tabular-nums">
                        {networkSnapshot ? networkSnapshot.dtr.kw.toFixed(1) : feederLoadKW}{" "}
                        <span className="text-sm text-slate-600 dark:text-zinc-400 font-normal">kW</span>
                        <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal ml-2 font-mono">
                          ({networkSnapshot ? networkSnapshot.dtr.kva.toFixed(1) : "---"} kVA)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                        LT-1 HEAD LOAD: <span className="text-slate-900 dark:text-zinc-200 font-semibold tabular-nums">{feederLoadKW} kW</span>
                        <span className="ml-1 text-slate-600 dark:text-zinc-400">• I²R LOSS: {gridMetrics ? gridMetrics.technicalLossKw.toFixed(2) : lineLossW.toFixed(1)} kW</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-zinc-800/60 px-3 py-1 text-[10px] text-slate-500 dark:text-zinc-400 font-mono flex justify-between">
                  <span>RADIAL POWER: F1: {gridMetrics?.f1Kw.toFixed(0) ?? feederLoadKW}k • F2: {gridMetrics?.f2Kw.toFixed(0) ?? 0}k • F3: {gridMetrics?.f3Kw.toFixed(0) ?? 0}k</span>
                  <span className="text-blue-600 dark:text-cyan-500 font-semibold">250 kVA BASE</span>
                </div>
              </Card>

              {/* CARD 3: 3-Phase Bus Voltage Level & Balance (IEEE 1159) */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-75 border-amber-500/50" : ""
              }`}>
                {(() => {
                  const dtrVr = v1 > 0 ? v1 : networkSnapshot ? networkSnapshot.dtr.voltage.R : 230;
                  const dtrVy = networkSnapshot ? networkSnapshot.dtr.voltage.Y : 230;
                  const dtrVb = networkSnapshot ? networkSnapshot.dtr.voltage.B : 230;
                  const minV = Math.min(dtrVr, dtrVy, dtrVb);
                  const maxV = Math.max(dtrVr, dtrVy, dtrVb);
                  const isUnderVoltage = minV > 15 && minV < 207; // < -10% nominal 230V
                  const isOverVoltage = maxV > 253; // > +10% nominal 230V
                  const unbalance = networkSnapshot ? networkSnapshot.dtr.unbalancePct : 0;
                  const isUnbalanced = unbalance > 3.0;

                  return (
                    <>
                      <CardHeader className="pb-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                            LV BUS VOLTAGE &amp; POWER QUALITY (IEC 61000)
                          </span>
                          <Badge
                            variant={
                              isUnderVoltage || isOverVoltage || isUnbalanced
                                ? "destructive"
                                : "healthy"
                            }
                            className="text-[10px]"
                          >
                            {isUnderVoltage
                              ? `UNDERVOLTAGE (${minV.toFixed(0)}V)`
                              : isOverVoltage
                              ? `OVERVOLTAGE (${maxV.toFixed(0)}V)`
                              : isUnbalanced
                              ? "UNBALANCED"
                              : "VOLTAGE BALANCE: NORMAL"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-1 pb-2">
                        <div className="flex items-center gap-2.5">
                          <Activity className={`h-7 w-7 shrink-0 ${isUnderVoltage || isOverVoltage ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-blue-600 dark:text-cyan-400"}`} />
                          <div>
                            <div className="text-xs font-bold font-mono text-slate-900 dark:text-zinc-100 tabular-nums space-x-1.5">
                              <span>
                                <strong className="text-rose-600 dark:text-rose-400">R:</strong>{" "}
                                {dtrVr.toFixed(1)}V
                              </span>
                              <span>
                                <strong className="text-amber-700 dark:text-amber-400">Y:</strong>{" "}
                                {dtrVy.toFixed(1)}V
                              </span>
                              <span>
                                <strong className="text-blue-700 dark:text-cyan-400">B:</strong>{" "}
                                {dtrVb.toFixed(1)}V
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono mt-1">
                              Freq: <span className="text-slate-900 dark:text-zinc-200">{!isGatewayOffline && telemetry?.p1?.freq !== undefined && telemetry.p1.freq > 0 ? `${telemetry.p1.freq.toFixed(2)} Hz` : "50.00 Hz"}</span>
                              <span className="ml-2">Unbalance: {unbalance.toFixed(2)}%</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <div className="border-t border-slate-100 dark:border-zinc-800/60 px-3 py-1 text-[10px] text-slate-500 dark:text-zinc-400 font-mono flex justify-between">
                        <span>415V L-L / 240V L-N</span>
                        {isUnderVoltage ? (
                          <span className="text-rose-600 dark:text-rose-500 font-bold animate-pulse">
                            ANSI 27 EXCURSION ({(((minV - 230) / 230) * 100).toFixed(0)}%)
                          </span>
                        ) : isOverVoltage ? (
                          <span className="text-amber-600 dark:text-amber-500 font-bold animate-pulse">
                            ANSI 59 EXCURSION (+{(((maxV - 230) / 230) * 100).toFixed(0)}%)
                          </span>
                        ) : isUnbalanced ? (
                          <span className="text-amber-600 dark:text-amber-500 font-semibold">IEEE 1159 UNBALANCE ADVISORY</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-500 font-semibold">ANSI C84.1 RANGE A COMPLIANT</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </Card>

              {/* CARD 4: Grid Incomer Current & Conductor Integrity */}
              <Card
                isFault={!isPowerCut && (isFault || (gridMetrics?.trippedSections ?? 0) > 0)}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      PHASE CONDUCTOR &amp; DIFFERENTIAL INTEGRITY
                    </span>
                    <Badge
                      variant={isGatewayOffline ? "outline" : isPowerCut ? "outline" : isFault || (gridMetrics?.trippedSections ?? 0) > 0 ? "destructive" : "healthy"}
                      className={`text-[10px] ${isPowerCut ? "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-400" : ""}`}
                    >
                      {isGatewayOffline
                        ? "OFFLINE"
                        : isPowerCut
                        ? "DE-ENERGIZED (0V)"
                        : isFault
                        ? "DIFFERENTIAL ALARM"
                        : (gridMetrics?.trippedSections ?? 0) > 0
                        ? "SPAN TRIP"
                        : "CONDUCTORS INTACT (NORMAL)"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <GitBranch className={`h-7 w-7 shrink-0 ${isPowerCut ? "text-slate-500 dark:text-zinc-500" : isFault ? "text-rose-600 dark:text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`} />
                    <div>
                      <div className={`text-xl font-bold font-mono tabular-nums ${isPowerCut ? "text-slate-600 dark:text-zinc-400" : "text-slate-900 dark:text-emerald-400"}`}>
                        {networkSnapshot
                          ? (
                              networkSnapshot.dtr.current.R +
                              networkSnapshot.dtr.current.Y +
                              networkSnapshot.dtr.current.B
                            ).toFixed(1)
                          : (i1 + i2).toFixed(1)}{" "}
                        <span className="text-sm text-slate-600 dark:text-zinc-500 font-normal">A (3Φ SUM)</span>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-zinc-400 font-mono mt-0.5 space-x-1 tabular-nums">
                        <span>F1-P01: {i1.toFixed(2)}A</span>
                        <span>•</span>
                        <span>F1-P02: {i2.toFixed(2)}A</span>
                        <span>•</span>
                        <span className={idiff >= tripLimit ? "text-rose-600 dark:text-rose-400 font-bold" : isPowerCut ? "text-slate-600 dark:text-zinc-400" : "text-emerald-700 dark:text-emerald-400"}>ΔI: {idiff.toFixed(3)}A</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-slate-100 dark:border-zinc-800/60 px-3 py-1 text-[10px] text-slate-500 dark:text-zinc-400 font-mono flex justify-between">
                  <span>SUPERVISED CORRIDOR: SPAN F1-P01 ↔ F1-P02</span>
                  <span className={isPowerCut ? "text-slate-600 dark:text-zinc-400 font-semibold" : isFault ? "text-rose-600 dark:text-rose-500 font-bold" : "text-emerald-600 dark:text-emerald-500 font-semibold"}>
                    {isPowerCut ? "FEEDER DE-ENERGIZED // 0A SUPPLY" : isFault ? "DIFF TRIP" : "28 DISTRIBUTION NODES ENERGIZED"}
                  </span>
                </div>
              </Card>
            </div>

            {/* ROW 2: SINGLE-LINE DIAGRAM (SLD) POWER FLOW */}
            <div className="shrink-0">
              <SingleLinePowerFlow
                telemetry={telemetry}
                networkSnapshot={networkSnapshot}
                selectedPoleId={selectedPoleId}
                onSelectPole={handlePoleSelect}
              />
            </div>

            {/* ROW 3: REAL GEOSPATIAL MAP (COL 8) + OPERATIONS DISPATCH STATION (COL 4) */}
            <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-[460px]">
              {/* Left (8 cols): Mapbox Vector GIS Map */}
              <div className="col-span-12 lg:col-span-8 flex flex-col h-full min-h-[460px]">
                <GisFeederMap
                  telemetry={telemetry}
                  networkSnapshot={networkSnapshot}
                  selectedPoleId={selectedPoleId}
                  onSelectPole={handlePoleSelect}
                />
              </div>

              {/* Right (4 cols): Operations & Incident Dispatch Hub */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-2.5 font-mono h-full">
                {/* Feeder Status Overview */}
                <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm space-y-2.5 shadow-xs dark:shadow-none transition-colors">
                  <div className="flex items-center justify-between text-xs text-slate-800 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span>FEEDER ASSET HEALTH &amp; SPAN</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {networkSnapshot ? `${networkSnapshot.nodes.filter((n) => n.id !== "DTR-01").length || 28} POLES • 3 LT FEEDERS` : "28 POLES • 3 FEEDERS"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {/* Node 1: F1-P01 Live Incomer */}
                    <div
                      onClick={() => handlePoleSelect("F1-P01")}
                      className={`flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm cursor-pointer hover:border-emerald-500/50 transition-all ${
                        selectedPoleId === "F1-P01" || selectedPoleId === "Pole-A"
                          ? "ring-1 ring-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : ""
                      } ${isP1Stale ? "opacity-50 border-amber-500/50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isPowerCut ? "bg-slate-400 dark:bg-zinc-600" : !isGatewayOffline && telemetry?.p1?.isOnline ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-400 dark:bg-zinc-600"}`} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-800 dark:text-zinc-200 font-bold">F1-P01</span>
                            <span className={`text-[9px] px-1 py-0.2 rounded-xs font-bold ${
                              isPowerCut
                                ? "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 border border-slate-300 dark:border-zinc-700"
                                : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                            }`}>
                              {isPowerCut ? "INCOMER (0V)" : "INCOMER TERMINAL"}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400">Substation Tap (Phase R Metered)</span>
                        </div>
                      </div>
                      <div className="text-slate-500 dark:text-zinc-400 tabular-nums flex items-center gap-1.5">
                        {isP1Stale && (
                          <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-500 dark:text-amber-400 animate-pulse font-bold">
                            {isGatewayOffline ? "OFFLINE" : "STALE"}
                          </Badge>
                        )}
                        <span className="font-bold text-slate-700 dark:text-zinc-200">
                          {isPowerCut ? (
                            "0.0V • 0.00A"
                          ) : !isGatewayOffline && telemetry?.p1?.isOnline ? (
                            `${telemetry.p1.v.toFixed(1)}V • ${telemetry.p1.i.toFixed(2)}A`
                          ) : (
                            "OFFLINE // NO FEED"
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Node 2: F1-P02 Live Outgoing */}
                    <div
                      onClick={() => handlePoleSelect("F1-P02")}
                      className={`flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm cursor-pointer hover:border-emerald-500/50 transition-all ${
                        selectedPoleId === "F1-P02" || selectedPoleId === "Pole-B"
                          ? "ring-1 ring-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : ""
                      } ${isP2Stale ? "opacity-50 border-amber-500/50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isGatewayOffline || isPowerCut
                              ? "bg-slate-400 dark:bg-zinc-600"
                              : telemetry?.p2?.isOnline === false
                              ? "bg-rose-500 animate-pulse"
                              : "bg-emerald-500 dark:bg-emerald-400"
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-800 dark:text-zinc-200 font-bold">F1-P02</span>
                            <span className={`text-[9px] px-1 py-0.2 rounded-xs font-bold ${
                              isPowerCut
                                ? "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 border border-slate-300 dark:border-zinc-700"
                                : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                            }`}>
                              {isPowerCut ? "BOUNDARY (0V)" : "SECTION TERMINAL"}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400">Differential Boundary (Phase R Metered)</span>
                        </div>
                      </div>
                      <div className="text-slate-500 dark:text-zinc-400 tabular-nums flex items-center gap-1.5">
                        {isP2Stale && (
                          <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-500 dark:text-amber-400 animate-pulse font-bold">
                            {isGatewayOffline ? "OFFLINE" : "STALE"}
                          </Badge>
                        )}
                        <span className="font-bold text-slate-700 dark:text-zinc-200">
                          {isPowerCut ? (
                            "0.0V • 0.00A"
                          ) : isGatewayOffline || telemetry?.p2?.isOnline === false ? (
                            <span className="text-slate-500 dark:text-zinc-400 font-bold">OFFLINE // NO FEED</span>
                          ) : (
                            `${telemetry?.p2?.v.toFixed(1)}V • ${telemetry?.p2?.i.toFixed(2)}A`
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Downstream Radial Feeders Summary */}
                    <div className="p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                        <span>Feeder LT-1 Downstream:</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">F1-P03 ➔ F1-P10 (8 Spans)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
                        <span>Feeder LT-2 &amp; LT-3:</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">18 Spans Supervised</span>
                      </div>
                    </div>

                    {/* RF Telemetry Bus */}
                    <div className="flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <Radio className={`h-3.5 w-3.5 ${isGatewayOffline ? "text-amber-500 animate-pulse" : "text-emerald-500 dark:text-emerald-400"}`} />
                        <span className="text-slate-800 dark:text-zinc-200">SCADA WIRELESS FIELD BUS:</span>
                      </div>
                      <Badge
                        variant={isGatewayOffline ? "warning" : "healthy"}
                        className={`text-[9px] py-0.5 ${isGatewayOffline ? "border-amber-500 text-amber-500 font-bold" : ""}`}
                      >
                        {isGatewayOffline ? "GATEWAY OFFLINE" : "866.3 MHz IN865 (MESH OK)"}
                      </Badge>
                    </div>

                    {/* Protected Differential Zone Span Summary */}
                    <div className="flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <Activity className={`h-3.5 w-3.5 ${isPowerCut ? "text-zinc-500" : isFault ? "text-rose-500 animate-pulse" : "text-emerald-500 dark:text-emerald-400"}`} />
                        <span className="text-slate-800 dark:text-zinc-200">ZONE 1 DIFFERENTIAL SPAN:</span>
                      </div>
                      <Badge
                        variant={isPowerCut ? "outline" : isFault ? "destructive" : "outline"}
                        className={`text-[9px] py-0.5 ${isPowerCut ? "text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700" : !isFault ? "text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : ""}`}
                      >
                        {isPowerCut ? "DE-ENERGIZED // NO FLOW (0A)" : isFault ? `TRIP: I_diff = ${(telemetry?.idiff ?? 0).toFixed(3)}A` : `120m • INTACT (I_diff ${(telemetry?.idiff ?? 0).toFixed(3)}A)`}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Section 1 Protection & Operational Incident Station */}
                <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm space-y-2.5 flex-1 flex flex-col justify-between shadow-xs dark:shadow-none transition-colors">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-800 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={`h-4 w-4 ${isPowerCut ? "text-slate-500 dark:text-zinc-500" : "text-emerald-600 dark:text-emerald-500"}`} />
                        <span>SECTION 1 SUPERVISORY CONTROL (FDIR)</span>
                      </div>
                      <Badge
                        variant={isPowerCut ? "outline" : isFault ? "destructive" : "healthy"}
                        className={`text-[10px] ${isPowerCut ? "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-400" : ""}`}
                      >
                        {isPowerCut ? "DE-ENERGIZED (0V)" : isFault ? "TRIPPED & ISOLATED (OPEN)" : "ENERGIZED (CLOSED)"}
                      </Badge>
                    </div>

                    {/* Differential ANSI 87L Status Bar */}
                    <div className="p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-slate-600 dark:text-zinc-400">Protection Zone:</span>
                        <span className="text-slate-900 dark:text-zinc-200">ANSI 87L Unit Differential</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] tabular-nums">
                        <span className="text-slate-600 dark:text-zinc-400">Differential Current (I_diff):</span>
                        <span className={`font-bold ${isPowerCut ? "text-slate-600 dark:text-zinc-400" : isFault ? "text-rose-600 dark:text-rose-500" : "text-emerald-600 dark:text-emerald-500"}`}>
                          {(telemetry?.idiff ?? 0).toFixed(3)} A / {tripLimit.toFixed(3)} A
                        </span>
                      </div>
                    </div>

                    {/* OMS & Workforce Status */}
                    {escalatedTicket ? (
                      <div className="border border-rose-500/60 bg-rose-50/80 dark:bg-rose-950/40 p-2.5 rounded-sm flex items-center justify-between animate-pulse">
                        <div>
                          <div className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>SUSTAINED OUTAGE — ACTION REQUIRED</span>
                          </div>
                          <div className="text-[10px] text-slate-600 dark:text-zinc-300 mt-0.5">
                            {escalatedTicket.safetyBypassTriggered ? "Safety Critical Override (Conductor Hazard)" : "Soak window elapsed. Operator dispatch required."}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="text-[11px] font-mono h-7 px-2 font-bold shadow-sm"
                          onClick={() => setActiveView("OMS")}
                        >
                          Dispatch ➔
                        </Button>
                      </div>
                    ) : watchingTicket ? (
                      <div className="border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-sm flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "8s" }} />
                            <span>SOAK OBSERVATION ACTIVE</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Watching event #{watchingTicket.ticketId} • Suppressing nuisance dispatch
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] font-mono h-7 px-2 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          onClick={() => setActiveView("OMS")}
                        >
                          View Soak ➔
                        </Button>
                      </div>
                    ) : dispatchedTicket ? (
                      <div className="border border-cyan-500/40 bg-cyan-50/60 dark:bg-cyan-950/30 p-2.5 rounded-sm flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5" />
                            <span>CREW DISPATCHED ({dispatchedTicket.assignedCrew || "Line Crew"})</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Status: {dispatchedTicket.status.replace(/_/g, " ")} • Ticket #{dispatchedTicket.ticketId}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] font-mono h-7 px-2 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                          onClick={() => setActiveView("OMS")}
                        >
                          Track Crew ➔
                        </Button>
                      </div>
                    ) : (
                      <div className="border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-sm flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">ALL SECTIONS NORMAL</span>
                            <div className="text-[10px] text-slate-500 dark:text-zinc-400">0 Active Outages • Field Crew On Standby</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] font-mono h-6 px-2"
                          onClick={() => setActiveView("OMS")}
                        >
                          OMS Hub
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Alarm Silencing / Reset Action */}
                  {isFault ? (
                    <Button
                      variant={isPtwLocked ? "outline" : isPowerCut ? "secondary" : "destructive"}
                      size="sm"
                      className={`w-full font-mono font-bold text-xs shadow-sm ${
                        isPowerCut ? "bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700" : ""
                      }`}
                      onClick={handleAcknowledgeAlarm}
                      disabled={isAcking}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {isAcking
                        ? "CLEARING..."
                        : isPowerCut
                        ? "ACKNOWLEDGE OUTAGE (ESC)"
                        : isAlarmUnacked
                        ? "ACKNOWLEDGE TRIP ALARM (ESC)"
                        : "RESET TRIP LATCH // RECLOSE SECTIONALIZER"}
                    </Button>
                  ) : (
                    <div className="border border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-950/40 p-2 rounded-sm text-[10px] text-slate-600 dark:text-zinc-400 flex items-center justify-between font-mono">
                      <span className="text-slate-700 dark:text-zinc-300">SCADA Field Bus Telemetry</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">ONLINE (POLL 250ms)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW B: GIS FULL VIEW WITH ASSET TREE */}
        {/* ============================================================== */}
        {activeView === "GIS" && (
          <div className="grid grid-cols-12 gap-2.5 flex-1 h-full min-h-[550px]">
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
          <div className="flex-1 flex flex-col min-h-0">
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
          <div className="flex-1 flex flex-col min-h-0">
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
          <div className="flex-1 flex flex-col min-h-0">
            <WorkforceOmsPanel
              tickets={tickets}
              onRefresh={fetchTickets}
              isBreakerTripped={isBreakerTripped}
              isFault={isFault}
              networkSnapshot={networkSnapshot}
              selectedPoleId={selectedPoleId}
              onSelectPole={handlePoleSelect}
              linemanPhone={linemanPhone}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW E: ENGINEERING & FIRMWARE DIAGNOSTICS */}
        {/* ============================================================== */}
        {(activeView === "DIAGNOSTICS" || activeView === "COMMS") && (
          <div className="flex-1 flex flex-col min-h-0">
            <EngineeringDiagnostics
              telemetry={telemetry}
              networkSnapshot={networkSnapshot}
              systemStatus={systemStatus}
              availablePorts={availablePorts}
              selectedPort={selectedPort}
              onSelectPort={setSelectedPort}
              onConnectPort={handlePortConnect}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW F: SEQUENTIAL EVENT RECORDER (SER AUDIT LOG) */}
        {/* ============================================================== */}
        {(activeView === "LOGS" || activeView === "SOE") && (
          <Card className="col-span-12 flex-1 flex flex-col font-mono min-h-0">
            <CardHeader className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <CardTitle>SCADA Sequential Event Recorder (SER) // Real-Time Audit Log</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">RECORDS: {logs.length}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-6 px-2 text-[10px] font-mono border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200"
                >
                  <Download className="h-3 w-3 mr-1" />
                  EXPORT SOE CSV
                </Button>
              </div>
            </CardHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">TIMESTAMP</TableHead>
                    <TableHead className="w-24">SEVERITY</TableHead>
                    <TableHead className="w-32">SUBSYSTEM</TableHead>
                    <TableHead>EVENT MESSAGE / OPERATOR DIRECTIVE</TableHead>
                    <TableHead className="w-48 text-right">DETAILS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 dark:text-zinc-500 py-4 font-mono text-xs">
                        Awaiting SCADA telemetry records...
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-slate-600 dark:text-zinc-400 font-mono text-xs">
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
                        <TableCell className="text-slate-800 dark:text-zinc-300 font-semibold font-mono text-xs">
                          {log.source}
                        </TableCell>
                        <TableCell className="text-slate-900 dark:text-zinc-200">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-right text-slate-500 dark:text-zinc-400 text-[11px] truncate max-w-xs font-mono">
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
    </div>
  );
}
