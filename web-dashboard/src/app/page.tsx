"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
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
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function SCADADashboard() {
  const { addToast, removeToast, clearAll } = useToast();

  const [telemetry, setTelemetry] = React.useState<GridTelemetry | null>(null);
  const [systemStatus, setSystemStatus] = React.useState<SystemStatus | null>(null);
  const [logs, setLogs] = React.useState<SCADAEventLog[]>([]);
  const [history, setHistory] = React.useState<HistoricalTelemetryPoint[]>([]);
  const [tickets, setTickets] = React.useState<TroubleTicket[]>([]);
  const [connectedSSE, setConnectedSSE] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<string>("--:--:--");
  const [availablePorts, setAvailablePorts] = React.useState<any[]>([]);
  const [selectedPort, setSelectedPort] = React.useState<string>("");
  const [isAcking, setIsAcking] = React.useState(false);
  const [selectedPoleId, setSelectedPoleId] = React.useState<string>("Pole-A");
  const [isBreakerTripped, setIsBreakerTripped] = React.useState(false);
  const [activeView, setActiveView] = React.useState<
    "OPERATOR" | "GIS" | "WAVEFORMS" | "OMS" | "DIAGNOSTICS" | "LOGS"
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
            if (data.tickets) {
              setTickets(data.tickets);
            } else if (data.telemetry?.tickets) {
              setTickets(data.telemetry.tickets);
            }
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
  }, [fetchTickets]);

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

    const isDifferentialFault = telemetry.fault || (telemetry.idiff ?? 0) >= 0.35;
    const isLastGasp = telemetry.fault_code === "OUTAGE_LAST_GASP";
    const currentFault = isDifferentialFault || isLastGasp;

    // Fire toast and Industrial Audio Alarm strictly ONCE when transitioning from NORMAL to FAULT
    if (currentFault && !wasFaultRef.current && !activeFaultToastRef.current) {
      wasFaultRef.current = true;
      playIndustrialAlarm(); // Dual-Tone 880Hz / 660Hz Industrial SCADA Buzzer

      const faultTitle = isLastGasp
        ? "CRITICAL ALARM: LAST GASP OUTAGE (ANSI 67/N)"
        : "CRITICAL ALARM: DIFFERENTIAL TRIP (|IA - IB| ≥ 0.35A)";

      const faultDesc = isLastGasp
        ? "Pole 2 power lost! Mains collapse last-gasp beacon transmitted over LoRa via 18650 UPS hold-up battery."
        : `Feeder Differential Current ΔI = ${telemetry.idiff.toFixed(3)} A (Exceeds trip limit 0.350 A). Potential broken conductor, ground fault, or illegal tap.`;

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

  const isP1Stale = (telemetry?.p1?.age_ms ?? 0) > 20000;
  const isP2Stale = (telemetry?.p2?.age_ms ?? 0) > 20000;

  const idiff = telemetry?.idiff ?? 0;
  const tripLimit = 0.35;
  const v1 = telemetry?.p1?.v ?? 0;
  const v2 = telemetry?.p2?.v ?? 0;
  const i1 = telemetry?.p1?.i ?? 0;
  const i2 = telemetry?.p2?.i ?? 0;
  const faultCode = telemetry?.fault_code;

  let activeFault: {
    ansiCode: string;
    title: string;
    reading: string;
    description: string;
    severity: string;
  } | null = null;

  if (faultCode === "OUTAGE_LAST_GASP" || (v1 === 0 && v2 === 0 && (i1 > 0 || i2 > 0 || faultCode === "OUTAGE_LAST_GASP"))) {
    activeFault = {
      ansiCode: "ANSI 67/N",
      title: "MAINS COLLAPSE // LAST-GASP BEACON DETECTED",
      reading: `V1: ${v1.toFixed(1)}V | V2: ${v2.toFixed(1)}V (0V AC MAINS COLLAPSE)`,
      description: "Line voltage collapsed to 0V. Node transmitting emergency last-gasp beacon via 18650 UPS hold-up battery.",
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
  } else if (telemetry?.fault || idiff >= 0.35) {
    activeFault = {
      ansiCode: "ANSI 87L",
      title: "CURRENT DIFFERENTIAL PROTECTION (FEEDER LEAKAGE / THEFT)",
      reading: `ΔI = ${idiff.toFixed(3)} A (TRIP LIMIT: 0.350 A) | I1: ${i1.toFixed(3)} A | I2: ${i2.toFixed(3)} A`,
      description: `Current imbalance between Pole 1 and Pole 2 (${idiff.toFixed(3)} A) exceeds safety limit (0.350 A). Broken conductor, ground fault, or illegal tap.`,
      severity: "CRITICAL",
    };
  } else if (faultCode && faultCode !== "NORMAL") {
    activeFault = {
      ansiCode: "ANSI 87L",
      title: `FEEDER PROTECTION ANOMALY: ${faultCode}`,
      reading: `ΔI = ${idiff.toFixed(3)} A | V1: ${v1.toFixed(1)} V | I1: ${i1.toFixed(3)} A`,
      description: "Grid protection relay flagged an abnormal operating state on Feeder 04.",
      severity: "CRITICAL",
    };
  }

  const isFault = activeFault !== null;
  const isAlarmUnacked = isFault && systemStatus?.operatorAck === false;
  const openTicketsCount = tickets.filter((t) => t.status !== "CLOSED").length;

  const p1PowerW = isBreakerTripped ? 0 : (telemetry?.p1?.p ?? 0);
  const p2PowerW = isBreakerTripped ? 0 : (telemetry?.p2?.p ?? 0);
  const feederLoadW = Math.round(p1PowerW);
  const feederLoadKW = (p1PowerW / 1000).toFixed(2);
  const lineLossW = Math.abs(p1PowerW - p2PowerW);
  const lineLossPct = p1PowerW > 0 ? ((lineLossW / p1PowerW) * 100).toFixed(2) : "0.00";
  const feederEnergyKWh = accumulatedEnergyKWh.toFixed(3);

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

      // Alt + 1..6: Switch between the 6 primary SCADA tabs
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === "1") { e.preventDefault(); setActiveView("OPERATOR"); }
        else if (e.key === "2") { e.preventDefault(); setActiveView("GIS"); }
        else if (e.key === "3") { e.preventDefault(); setActiveView("WAVEFORMS"); }
        else if (e.key === "4") { e.preventDefault(); setActiveView("OMS"); }
        else if (e.key === "5") { e.preventDefault(); setActiveView("DIAGNOSTICS"); }
        else if (e.key === "6") { e.preventDefault(); setActiveView("LOGS"); }
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
    <div className="min-h-screen bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col p-3 md:p-4 gap-3 select-none transition-colors duration-150">
      {/* 1. TOP SCADA HEADER BAR - CLEAN OPERATOR DESK */}
      <header className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 font-mono shadow-xs dark:shadow-none transition-colors">
        {/* Left: Branding & Substation Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 rounded-sm">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                GRIDSENSE // DISTRIBUTION CONTROL DESK
              </h1>
              <Badge
                variant={isFault ? "destructive" : "healthy"}
                className="text-[10px] py-0.5"
              >
                {isFault ? "FEEDER ALERT" : "FEEDER HEALTHY"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              FISAT 33/11kV SUBSTATION • FEEDER 04 (CAMPUS 11kV)
            </p>
          </div>
        </div>

        {/* Center: Clean Human-Friendly View Tabs */}
        <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5 text-xs">
          <button
            onClick={() => setActiveView("OPERATOR")}
            className={`px-3 py-1.5 text-[11px] uppercase rounded-sm transition-colors font-semibold ${
              activeView === "OPERATOR"
                ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            OPERATOR DESK
          </button>
          <button
            onClick={() => setActiveView("GIS")}
            className={`px-2.5 py-1.5 text-[11px] uppercase rounded-sm transition-colors ${
              activeView === "GIS"
                ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            GIS MAP
          </button>
          <button
            onClick={() => setActiveView("WAVEFORMS")}
            className={`px-2.5 py-1.5 text-[11px] uppercase rounded-sm transition-colors ${
              activeView === "WAVEFORMS"
                ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            WAVEFORMS
          </button>
          <button
            onClick={() => setActiveView("OMS")}
            className={`px-2.5 py-1.5 text-[11px] uppercase rounded-sm transition-colors flex items-center gap-1.5 ${
              activeView === "OMS"
                ? "bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <Wrench className="h-3 w-3" />
            <span>OUTAGE &amp; WORKFORCE</span>
            {openTicketsCount > 0 && (
              <span className="bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/50 px-1 py-0.2 text-[9px] rounded-sm font-bold">
                {openTicketsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("DIAGNOSTICS")}
            className={`px-2.5 py-1.5 text-[11px] uppercase rounded-sm transition-colors flex items-center gap-1.5 ${
              activeView === "DIAGNOSTICS"
                ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <Cpu className="h-3 w-3" />
            <span>DIAGNOSTICS</span>
          </button>
          <button
            onClick={() => setActiveView("LOGS")}
            className={`px-2.5 py-1.5 text-[11px] uppercase rounded-sm transition-colors ${
              activeView === "LOGS"
                ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            EVENT LOG
          </button>
        </div>

        {/* Right: Essential Operator Status Indicators & Theme Toggle */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {systemStatus?.ptwInterlockActive && (
            <Badge
              variant="warning"
              className="flex items-center gap-1.5 py-1 bg-amber-50 dark:bg-amber-950/80 border-amber-500 text-amber-800 dark:text-amber-300 animate-pulse font-bold"
            >
              <Lock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
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
            className={`h-7 px-2 font-mono text-[11px] flex items-center gap-1.5 ${
              isAudioMuted
                ? "bg-amber-950/40 border-amber-600/70 text-amber-300"
                : "bg-slate-100 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
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

          <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] text-slate-600 dark:text-zinc-400 tabular-nums">
            TIME: <span className="text-slate-900 dark:text-zinc-200">{lastHeartbeat}</span>
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
          <div className="flex flex-col gap-3">
            {/* ROW 1: FOUR CLEAN OPERATOR KPI METRIC CARDS */}
            <div className="grid grid-cols-12 gap-3">
              {/* CARD 1: Feeder Protection Status */}
              <Card
                isFault={isFault}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      FEEDER PROTECTION
                    </span>
                    <Badge variant={isFault ? "destructive" : "healthy"} className="text-[10px]">
                      {isFault ? "TRIP ALERT" : "SUPERVISED"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    {isFault ? (
                      <AlertOctagon className="h-7 w-7 text-rose-500 shrink-0 animate-bounce" />
                    ) : (
                      <ShieldCheck className="h-7 w-7 text-emerald-400 shrink-0" />
                    )}
                    <div>
                      <div
                        className={`text-lg font-bold font-mono tracking-tight ${
                          isFault ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {isFault ? "ANOMALY / TRIP" : "HEALTHY & BALANCED"}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {isFault ? telemetry?.fault_code || "FAULT" : "No Leakage Detected"}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-zinc-800/80 px-3 py-1 text-[10px] text-zinc-400 font-mono bg-zinc-950/40 flex justify-between">
                  <span>TRIP LIMIT: 0.350 A</span>
                  <span className="text-zinc-300">LOOP: 250ms</span>
                </div>
              </Card>

              {/* CARD 2: Active Power Demand */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-50 border-amber-500/50" : ""
              }`}>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      TOTAL FEEDER LOAD
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isP1Stale && (
                        <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-400 animate-pulse font-bold">
                          STALE / WAITING
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        POLE 1 INCOMER
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <Zap className="h-7 w-7 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
                        {feederLoadKW} <span className="text-sm text-zinc-500 font-normal">kW</span>
                        <span className="text-xs text-zinc-400 font-normal ml-2 font-mono">({feederLoadW} W)</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        LINE LOSS: <span className="text-zinc-200 tabular-nums">{lineLossW.toFixed(1)} W ({lineLossPct}%)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-zinc-800/80 px-3 py-1 text-[10px] text-zinc-400 font-mono bg-zinc-950/40 flex justify-between">
                  <span>ENERGY: {feederEnergyKWh} kWh</span>
                  <span className="text-emerald-400">SERIES RADIAL FEEDER</span>
                </div>
              </Card>

              {/* CARD 3: Bus Voltage Quality */}
              <Card className={`col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between transition-opacity ${
                isP1Stale ? "opacity-50 border-amber-500/50" : ""
              }`}>
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      GRID VOLTAGE LEVEL
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isP1Stale ? (
                        <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-400 animate-pulse font-bold">
                          STALE / WAITING
                        </Badge>
                      ) : (
                        <Badge variant="healthy" className="text-[10px]">
                          STABLE ±0.4%
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <Activity className="h-7 w-7 text-cyan-400 shrink-0" />
                    <div>
                      <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
                        {telemetry?.p1?.v !== undefined && telemetry.p1.v > 0 ? telemetry.p1.v.toFixed(1) : "0.0"}{" "}
                        <span className="text-sm text-zinc-500 font-normal">V</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        Frequency: <span className="text-zinc-200">{telemetry?.p1?.freq !== undefined && telemetry.p1.freq > 0 ? `${telemetry.p1.freq.toFixed(2)} Hz` : "0.00 Hz"}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-zinc-800/80 px-3 py-1 text-[10px] text-zinc-400 font-mono bg-zinc-950/40 flex justify-between">
                  <span>STANDARD: 230V</span>
                  <span className="text-emerald-400">CLEAN SINE WAVE</span>
                </div>
              </Card>

              {/* CARD 4: Conductor Balance & Leakage */}
              <Card
                isFault={isFault}
                className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      LINE CURRENT BALANCE
                    </span>
                    <Badge variant={isFault ? "destructive" : "healthy"} className="text-[10px]">
                      {isFault ? "EXCEEDED" : "BALANCED"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <GitBranch className="h-7 w-7 text-emerald-400 shrink-0" />
                    <div>
                      <div
                        className={`text-2xl font-bold font-mono tabular-nums ${
                          isFault ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {telemetry?.idiff !== undefined ? telemetry.idiff.toFixed(3) : "0.000"}{" "}
                        <span className="text-sm text-zinc-500 font-normal">A</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {isFault ? "Unbalanced Leakage" : "Conductor Monitored"}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="border-t border-zinc-800/80 px-3 py-1 text-[10px] text-zinc-400 font-mono bg-zinc-950/40 flex justify-between">
                  <span>THRESHOLD: 0.350 A</span>
                  <span className={isFault ? "text-rose-400" : "text-emerald-400"}>
                    {isFault ? "CONDUCTOR LEAK" : "CONDUCTOR INTACT"}
                  </span>
                </div>
              </Card>
            </div>

            {/* ROW 2: SINGLE-LINE DIAGRAM (SLD) POWER FLOW */}
            <SingleLinePowerFlow
              telemetry={telemetry}
              selectedPoleId={selectedPoleId}
              onSelectPole={setSelectedPoleId}
            />

            {/* ROW 3: REAL GEOSPATIAL MAP (COL 8) + OPERATIONS DISPATCH STATION (COL 4) */}
            <div className="grid grid-cols-12 gap-3 min-h-[380px]">
              {/* Left (8 cols): Mapbox Vector GIS Map */}
              <div className="col-span-12 lg:col-span-8 flex flex-col">
                <GisFeederMap
                  telemetry={telemetry}
                  selectedPoleId={selectedPoleId}
                  onSelectPole={(p) => setSelectedPoleId(p.id)}
                />
              </div>

              {/* Right (4 cols): Operations & Incident Dispatch Hub */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 font-mono">
                {/* Feeder Status Overview */}
                <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm space-y-2.5 shadow-xs dark:shadow-none transition-colors">
                  <div className="flex items-center justify-between text-xs text-slate-800 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span>FEEDER ASSET HEALTH</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      2 POLES
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className={`flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm transition-opacity ${
                      isP1Stale ? "opacity-50 border-amber-500/50" : ""
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${telemetry?.p1?.isOnline ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-400 dark:bg-zinc-600"}`} />
                        <span className="text-slate-800 dark:text-zinc-200">Pole 1 (Incomer)</span>
                      </div>
                      <div className="text-slate-500 dark:text-zinc-400 tabular-nums flex items-center gap-1.5">
                        {isP1Stale && (
                          <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-400 animate-pulse font-bold">
                            STALE
                          </Badge>
                        )}
                        <span>{telemetry?.p1?.isOnline ? `${telemetry.p1.v.toFixed(1)}V • ${telemetry.p1.i.toFixed(2)}A` : "OFFLINE / STANDBY"}</span>
                      </div>
                    </div>

                    <div className={`flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm transition-opacity ${
                      isP2Stale ? "opacity-50 border-amber-500/50" : ""
                    }`}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            telemetry?.p2?.isOnline === false
                              ? "bg-rose-500 animate-pulse"
                              : "bg-emerald-500 dark:bg-emerald-400"
                          }`}
                        />
                        <span className="text-slate-800 dark:text-zinc-200">Pole 2 (Outgoing)</span>
                      </div>
                      <div className="text-slate-500 dark:text-zinc-400 tabular-nums flex items-center gap-1.5">
                        {isP2Stale && (
                          <Badge variant="warning" className="text-[9px] py-0 border-amber-500 text-amber-400 animate-pulse font-bold">
                            STALE
                          </Badge>
                        )}
                        <span>
                          {telemetry?.p2?.isOnline === false ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">OFFLINE / UNREACHABLE</span>
                          ) : (
                            `${telemetry?.p2?.v.toFixed(1)}V • ${telemetry?.p2?.i.toFixed(2)}A`
                          )}
                        </span>
                      </div>
                    </div>

                    {/* UPS 18650 Battery Rail Health */}
                    <div className="flex items-center justify-between p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 rounded-sm font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <BatteryCharging className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                        <span className="text-slate-800 dark:text-zinc-200">EDGE NODE UPS:</span>
                      </div>
                      <Badge
                        variant={telemetry?.fault_code === "OUTAGE_LAST_GASP" ? "warning" : "healthy"}
                        className={`text-[9px] py-0.5 ${
                          telemetry?.fault_code === "OUTAGE_LAST_GASP" ? "animate-pulse font-bold" : ""
                        }`}
                      >
                        {telemetry?.fault_code === "OUTAGE_LAST_GASP"
                          ? "UPS: BATTERY HOLD-UP ACTIVE"
                          : "UPS: 18650 READY (4.2V)"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Operations & Dispatch Action Hub */}
                <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm space-y-2.5 flex-1 flex flex-col justify-between shadow-xs dark:shadow-none transition-colors">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-800 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                        <span>QUICK OPERATOR ACTIONS</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant={openTicketsCount > 0 ? "destructive" : "outline"}
                        size="sm"
                        className="w-full justify-between text-xs font-mono font-bold"
                        onClick={() => setActiveView("OMS")}
                      >
                        <span className="flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5" />
                          <span>OUTAGE &amp; LINEMAN TICKETS</span>
                        </span>
                        <span className="bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 px-1.5 py-0.5 rounded-sm text-[10px]">
                          {openTicketsCount} OPEN
                        </span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between text-xs font-mono"
                        onClick={() => setActiveView("WAVEFORMS")}
                      >
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>WAVEFORM MONITOR</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between text-xs font-mono"
                        onClick={() => setActiveView("DIAGNOSTICS")}
                      >
                        <span className="flex items-center gap-2">
                          <Cpu className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>ENGINEERING DIAGNOSTICS</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      </Button>
                    </div>
                  </div>

                  {/* Operational Notice */}
                  <div className="border border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-950/40 p-2 rounded-sm text-[10px] text-slate-600 dark:text-zinc-400 space-y-0.5">
                    <div className="text-slate-800 dark:text-zinc-300 font-semibold">FEEDER SUPERVISION:</div>
                    <div>LoRa Mesh Supervised • Zero-latency trip isolation active</div>
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
          <div className="grid grid-cols-12 gap-3 min-h-[580px]">
            <div className="col-span-12 lg:col-span-8 flex flex-col h-[600px] min-h-[550px]">
              <GisFeederMap
                telemetry={telemetry}
                selectedPoleId={selectedPoleId}
                onSelectPole={(p) => setSelectedPoleId(p.id)}
              />
            </div>
            <div className="col-span-12 lg:col-span-4 flex flex-col h-[600px] min-h-[550px]">
              <FeederAssetTree
                telemetry={telemetry}
                selectedPoleId={selectedPoleId}
                onSelectPole={(id) => setSelectedPoleId(id)}
              />
            </div>
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
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW D: WORKFORCE & OUTAGE MANAGEMENT (OMS) */}
        {/* ============================================================== */}
        {activeView === "OMS" && (
          <div className="min-h-[500px]">
            <WorkforceOmsPanel
              tickets={tickets}
              onRefresh={fetchTickets}
              isBreakerTripped={isBreakerTripped}
              isFault={isFault}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW E: ENGINEERING & FIRMWARE DIAGNOSTICS */}
        {/* ============================================================== */}
        {activeView === "DIAGNOSTICS" && (
          <EngineeringDiagnostics
            telemetry={telemetry}
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
        {(activeView === "LOGS" || activeView === "OPERATOR") && (
          <Card className="col-span-12 flex flex-col font-mono">
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

            <div className="max-h-48 overflow-y-auto">
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
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-4">
                        Awaiting SCADA telemetry records...
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-zinc-400">
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
                        <TableCell className="text-zinc-300 font-semibold">
                          {log.source}
                        </TableCell>
                        <TableCell className="text-zinc-200">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-right text-zinc-400 text-[11px] truncate max-w-xs">
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
      <footer className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] px-3.5 py-1.5 rounded-sm flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400 shadow-xs dark:shadow-none transition-colors">
        <div className="flex items-center gap-3">
          <span>STATION: DISTRIBUTION_OFFICE_01</span>
          <span>•</span>
          <span>FEEDER: 11kV_CAMPUS_PRIMARY</span>
          <span>•</span>
          <span>TELEMETRY BUS: WAVESHARE LR1121 SUB-GHZ MESH</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400 dark:text-zinc-500 border-l border-slate-300 dark:border-zinc-800 pl-3">
            <Keyboard className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
            <span>[Esc]: Ack Alarm</span>
            <span>•</span>
            <span>[Alt+1..6]: Views</span>
            <span>•</span>
            <span>[Space]: Freeze Waveform</span>
          </div>
          <div>
            <span>MCA PROJECT // FISAT © 2026 // ADMS ENTERPRISE SUITE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
