"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Flame,
  Radio,
  RefreshCw,
  ShieldCheck,
  Zap,
  Terminal,
  Power,
  Sliders,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { GridTelemetry, SCADAEventLog, SystemStatus } from "@/lib/types";

export default function SCADADashboard() {
  const { addToast } = useToast();

  const [telemetry, setTelemetry] = React.useState<GridTelemetry | null>(null);
  const [systemStatus, setSystemStatus] = React.useState<SystemStatus | null>(null);
  const [logs, setLogs] = React.useState<SCADAEventLog[]>([]);
  const [connectedSSE, setConnectedSSE] = React.useState(false);
  const [lastHeartbeat, setLastHeartbeat] = React.useState<string>("--:--:--");
  const [selectedScenario, setSelectedScenario] = React.useState<string>("NORMAL");
  const [availablePorts, setAvailablePorts] = React.useState<any[]>([]);
  const [selectedPort, setSelectedPort] = React.useState<string>("");
  const [isAcking, setIsAcking] = React.useState(false);

  // Track if fault toast is currently raised to prevent multiple toasts for the same continuous fault
  const activeFaultToastRef = React.useRef<string | null>(null);

  // 1. Establish SSE real-time stream
  React.useEffect(() => {
    let eventSource: EventSource | null = null;

    function connectSSE() {
      eventSource = new EventSource("/api/telemetry/stream");

      eventSource.onopen = () => {
        setConnectedSSE(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastHeartbeat(new Date().toLocaleTimeString());

          if (data.type === "INITIAL" || data.type === "UPDATE") {
            if (data.telemetry) setTelemetry(data.telemetry);
            if (data.status) setSystemStatus(data.status);
            if (data.logs) setLogs(data.logs);
          } else if (data.type === "LOG" && data.log) {
            setLogs((prev) => [data.log, ...prev.slice(0, 30)]);
          }
        } catch (err) {
          console.error("SSE parse error", err);
        }
      };

      eventSource.onerror = () => {
        setConnectedSSE(false);
        if (eventSource) eventSource.close();
        setTimeout(connectSSE, 3000);
      };
    }

    connectSSE();

    // Query available serial ports
    fetch("/api/telemetry/ports")
      .then((res) => res.json())
      .then((data) => {
        if (data.ports) setAvailablePorts(data.ports);
        if (data.ports && data.ports.length > 0) {
          setSelectedPort(data.ports[0].path);
        }
      })
      .catch(() => {});

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // 2. Destructive Persistent Toast Handler on Fault Detection
  React.useEffect(() => {
    if (!telemetry) return;

    const isDifferentialFault = telemetry.fault || telemetry.idiff > 0.5;
    const isLastGasp = telemetry.fault_code === "OUTAGE_LAST_GASP";

    if ((isDifferentialFault || isLastGasp) && !activeFaultToastRef.current) {
      const faultTitle = isLastGasp
        ? "CRITICAL ALARM: LAST GASP OUTAGE"
        : "CRITICAL ALARM: DIFFERENTIAL TRIP (|IA - IB| > 0.5A)";

      const faultDesc = isLastGasp
        ? `Pole 2 power lost! Capacitor dying gasp transmitted over LoRa. Immediate line crew dispatch recommended.`
        : `Feeder Differential Current ΔI = ${telemetry.idiff.toFixed(3)} A (Exceeds trip limit 0.500 A). Possible ground fault, conductor break, or illegal tap.`;

      const toastId = addToast({
        title: faultTitle,
        description: faultDesc,
        type: "destructive",
        persistent: true, // Non-auto-dismissing: operator must click Acknowledge
        onAcknowledge: async () => {
          activeFaultToastRef.current = null;
          await handleAcknowledgeAlarm();
        },
      });

      activeFaultToastRef.current = toastId;
    }

    // Reset ref when fault is cleared
    if (!isDifferentialFault && !isLastGasp) {
      activeFaultToastRef.current = null;
    }
  }, [telemetry, addToast]);

  // Acknowledge Alarm handler
  const handleAcknowledgeAlarm = async () => {
    setIsAcking(true);
    try {
      await fetch("/api/telemetry/ack", { method: "POST" });
    } catch (err) {
      console.error("Ack error", err);
    } finally {
      setIsAcking(false);
    }
  };

  // Simulation switch handler
  const handleSimulationSwitch = async (scenario: string) => {
    setSelectedScenario(scenario);
    try {
      await fetch("/api/telemetry/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
    } catch (err) {
      console.error(err);
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

  const isFault = telemetry?.fault || (telemetry?.idiff ?? 0) > 0.5;
  const isAlarmUnacked = isFault && systemStatus?.operatorAck === false;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col p-3 md:p-4 gap-3 select-none">
      {/* 1. TOP SCADA HEADER BAR */}
      <header className="border border-zinc-800 bg-[#0f1012] p-3 rounded-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 border border-zinc-700 bg-zinc-900 rounded-sm">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold uppercase tracking-wider text-zinc-100 font-mono">
                GRIDSENSE SCADA // DISTRIBUTION OFFICE FDIR
              </h1>
              <Badge variant="outline" className="text-[10px]">
                REV 2.0
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              SUB-GHZ LORA MESH PROTECTION // 868 MHZ // ESP32-S3 GATEWAY
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          {/* Security Badge */}
          <Badge variant="crypto" className="flex items-center gap-1.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>SEC: AES-128 ENCRYPTED</span>
          </Badge>

          {/* Gateway Serial Port Status */}
          <Badge
            variant={systemStatus?.gatewayConnected ? "healthy" : "warning"}
            className="flex items-center gap-1.5 py-1"
          >
            <Radio className="h-3.5 w-3.5" />
            <span>
              {systemStatus?.isSimulated
                ? "PORT: SIMULATOR"
                : `PORT: ${systemStatus?.activePort || "DISCONNECTED"} @ 115200`}
            </span>
          </Badge>

          {/* SSE Pipeline Stream */}
          <Badge
            variant={connectedSSE ? "healthy" : "destructive"}
            className="flex items-center gap-1.5 py-1"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>PIPE: {connectedSSE ? "LIVE SSE" : "OFFLINE"}</span>
          </Badge>

          {/* Clock */}
          <div className="border border-zinc-800 bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] text-zinc-400 tabular-nums">
            TICK: <span className="text-zinc-200">{lastHeartbeat}</span>
          </div>
        </div>
      </header>

      {/* 2. PERSISTENT OPERATOR ALARM BANNER (ACTIVE ON FAULT) */}
      {isFault && (
        <div className="border border-rose-600 bg-rose-950/60 p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 animate-pulse ring-1 ring-rose-500">
          <div className="flex items-center gap-3">
            <AlertOctagon className="h-6 w-6 text-rose-400 animate-bounce" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider font-mono text-rose-200 flex items-center gap-2">
                <span>FEEDER ANOMALY DETECTED // FDIR DECISION: {telemetry?.fault_code}</span>
                {isAlarmUnacked && (
                  <span className="bg-rose-900 border border-rose-500 text-rose-100 text-[10px] px-2 py-0.2 rounded-sm">
                    OPERATOR ACK REQUIRED
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-rose-300">
                Differential current ΔI ={" "}
                <span className="font-bold underline">
                  {telemetry?.idiff.toFixed(3)} A
                </span>{" "}
                exceeds protection threshold (0.500 A). Conductor integrity compromised.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold"
              onClick={handleAcknowledgeAlarm}
              disabled={isAcking}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {isAcking ? "CLEARING..." : "ACKNOWLEDGE & RESET FAULT"}
            </Button>
          </div>
        </div>
      )}

      {/* 3. BENTO BOX GRID: 12-COLUMN INDUSTRIAL SCADA MATRIX */}
      <main className="grid grid-cols-12 gap-3 flex-1">
        {/* PANEL 1: CENTRAL FDIR DIFFERENTIAL CORE (Cols 1-4) */}
        <Card isFault={isFault} className="col-span-12 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <CardTitle>FDIR Differential Protection</CardTitle>
            </div>
            <Badge variant={isFault ? "trip" : "healthy"}>
              {isFault ? "TRIP / ALERT" : "SUPERVISED"}
            </Badge>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {/* Primary Differential Metric */}
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 rounded-sm flex flex-col items-center justify-center">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                INTER-POLE CURRENT DIFFERENCE (ΔI = |IA - IB|)
              </span>
              <div
                className={`text-4xl md:text-5xl font-mono font-bold tabular-nums tracking-tight my-1 ${
                  isFault ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {telemetry ? telemetry.idiff.toFixed(3) : "0.000"}
                <span className="text-lg text-zinc-500 ml-1">A</span>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                TRIP THRESHOLD: <span className="text-zinc-200">0.500 A</span> | TOL:{" "}
                <span className="text-zinc-200">±0.020 A</span>
              </div>
            </div>

            {/* Differential Status Parameters */}
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Span Protection Zone</span>
                <span className="text-zinc-200 font-semibold">Pole 1 (Incomer) ➔ Pole 2 (Outgoing)</span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">FDIR Status Code</span>
                <span className={isFault ? "text-rose-400 font-bold" : "text-emerald-400"}>
                  {telemetry?.fault_code || "NORMAL"}
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Circuit Relay Interlock</span>
                <span className="text-zinc-200">
                  {isFault ? "TRIP COMMAND DISPATCHED" : "CLOSED / ENERGIZED"}
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Security Cipher</span>
                <span className="text-cyan-400">AES-128-CBC (HARDWARE ACCEL)</span>
              </div>

              <div className="flex justify-between items-baseline pb-1">
                <span className="text-zinc-400">Central Gateway Uptime</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.gw_ms ? `${(telemetry.gw_ms / 1000).toFixed(1)}s` : "0.0s"}
                </span>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-zinc-800/80 px-3.5 py-2 text-[11px] font-mono flex items-center justify-between text-zinc-400 bg-zinc-950/40">
            <span>PROTECTION LOOP: 250ms</span>
            <span className={isFault ? "text-rose-400 font-bold" : "text-emerald-400"}>
              {isFault ? "FAULT LOCKOUT ACTIVE" : "SYSTEM HEALTHY"}
            </span>
          </div>
        </Card>

        {/* PANEL 2: POLE 1 (INCOMER / NODE A) (Cols 5-8) */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <CardTitle>Pole 1 // Incomer (Node A)</CardTitle>
            </div>
            <Badge variant="healthy">ROLE: INCOMER</Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* V & I Main Gauges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-zinc-800/80 bg-zinc-950/60 p-2.5 rounded-sm">
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Voltage (V)</div>
                <div className="text-2xl font-mono font-bold text-zinc-100 tabular-nums mt-0.5">
                  {telemetry ? telemetry.p1.v.toFixed(1) : "230.0"}
                  <span className="text-xs text-zinc-500 ml-1">V</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Freq: 50.00 Hz</div>
              </div>

              <div className="border border-zinc-800/80 bg-zinc-950/60 p-2.5 rounded-sm">
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Current (I)</div>
                <div className="text-2xl font-mono font-bold text-zinc-100 tabular-nums mt-0.5">
                  {telemetry ? telemetry.p1.i.toFixed(3) : "2.450"}
                  <span className="text-xs text-zinc-500 ml-1">A</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">PF: 0.96 IND</div>
              </div>
            </div>

            {/* Sub-Metrics Table */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Active Power (P)</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry ? telemetry.p1.p?.toFixed(1) || (telemetry.p1.v * telemetry.p1.i * 0.96).toFixed(1) : "563.9"} W
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Cumulative Energy</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p1.energy ? telemetry.p1.energy.toFixed(2) : "14.85"} kWh
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">LoRa RSSI / SNR</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p1.rssi || -32} dBm / +{telemetry?.p1.snr || 15} dB
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Mesh Route Topology</span>
                <span className="text-emerald-400">Direct Gateway (Hop 0)</span>
              </div>

              <div className="flex justify-between items-baseline pb-1">
                <span className="text-zinc-400">Telemetry Age</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p1.age_ms || 0} ms
                </span>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-zinc-800/80 px-3.5 py-2 text-[11px] font-mono flex items-center justify-between text-zinc-400 bg-zinc-950/40">
            <span>NODE ID: ESP32-S3-P1</span>
            <span className="text-emerald-400">TX PERIOD: 2000ms</span>
          </div>
        </Card>

        {/* PANEL 3: POLE 2 (OUTGOING / NODE B) (Cols 9-12) */}
        <Card
          isFault={telemetry?.p2.isOnline === false || isFault}
          className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between"
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  telemetry?.p2.isOnline === false ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
                }`}
              />
              <CardTitle>Pole 2 // Outgoing (Node B)</CardTitle>
            </div>
            <Badge
              variant={telemetry?.p2.isOnline === false ? "destructive" : "healthy"}
            >
              {telemetry?.p2.isOnline === false ? "OUTAGE DETECTED" : "ROLE: OUTGOING"}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* V & I Main Gauges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-zinc-800/80 bg-zinc-950/60 p-2.5 rounded-sm">
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Voltage (V)</div>
                <div className="text-2xl font-mono font-bold text-zinc-100 tabular-nums mt-0.5">
                  {telemetry ? telemetry.p2.v.toFixed(1) : "230.1"}
                  <span className="text-xs text-zinc-500 ml-1">V</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Freq: 50.00 Hz</div>
              </div>

              <div className="border border-zinc-800/80 bg-zinc-950/60 p-2.5 rounded-sm">
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Current (I)</div>
                <div
                  className={`text-2xl font-mono font-bold tabular-nums mt-0.5 ${
                    isFault ? "text-rose-400" : "text-zinc-100"
                  }`}
                >
                  {telemetry ? telemetry.p2.i.toFixed(3) : "2.430"}
                  <span className="text-xs text-zinc-500 ml-1">A</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">PF: 0.96 IND</div>
              </div>
            </div>

            {/* Sub-Metrics Table */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Active Power (P)</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry ? telemetry.p2.p?.toFixed(1) || (telemetry.p2.v * telemetry.p2.i * 0.96).toFixed(1) : "559.1"} W
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Cumulative Energy</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p2.energy ? telemetry.p2.energy.toFixed(2) : "14.79"} kWh
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">LoRa RSSI / SNR</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p2.rssi || -28} dBm / +{telemetry?.p2.snr || 16} dB
                </span>
              </div>

              <div className="flex justify-between items-baseline border-b border-zinc-800/60 pb-1">
                <span className="text-zinc-400">Mesh Route Topology</span>
                <span className="text-emerald-400">
                  {telemetry?.p2.hops === 1 ? "Relayed via Pole 1 (Hop 1)" : "Direct Gateway (Hop 0)"}
                </span>
              </div>

              <div className="flex justify-between items-baseline pb-1">
                <span className="text-zinc-400">Telemetry Age</span>
                <span className="text-zinc-200 tabular-nums">
                  {telemetry?.p2.age_ms || 120} ms
                </span>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-zinc-800/80 px-3.5 py-2 text-[11px] font-mono flex items-center justify-between text-zinc-400 bg-zinc-950/40">
            <span>NODE ID: ESP32-S3-P2</span>
            <span className={telemetry?.p2.isOnline === false ? "text-rose-400 font-bold" : "text-emerald-400"}>
              {telemetry?.p2.isOnline === false ? "NODE OFFLINE" : "ONLINE / SYNCED"}
            </span>
          </div>
        </Card>

        {/* PANEL 4: FEEDER SINGLE LINE DIAGRAM (SLD) & VECTOR TOPOLOGY (Cols 1-7) */}
        <Card className="col-span-12 lg:col-span-7 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <CardTitle>Feeder Single Line Diagram (SLD) // Span Protected Zone</CardTitle>
            </div>
            <Badge variant="outline">230V 50Hz DISTRIBUTION SPAN</Badge>
          </CardHeader>

          <CardContent className="p-4">
            <div className="border border-zinc-800 bg-zinc-950 p-4 rounded-sm flex flex-col justify-between min-h-[160px]">
              {/* SLD Graphic */}
              <div className="flex items-center justify-between relative px-4 py-3">
                {/* Pole 1 Node */}
                <div className="flex flex-col items-center z-10">
                  <div className="border-2 border-emerald-500 bg-zinc-900 px-3 py-2 rounded-sm text-center">
                    <span className="text-[10px] text-zinc-400 uppercase font-mono block">INCOMER</span>
                    <span className="text-xs font-bold font-mono text-zinc-100">POLE 1</span>
                    <span className="text-[11px] font-mono block text-emerald-400 tabular-nums">
                      {telemetry?.p1.i.toFixed(2) || "2.45"} A
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-400 mt-1">CT_SENSOR_1</span>
                </div>

                {/* Overhead Feeder Line */}
                <div className="flex-1 flex flex-col items-center mx-3 relative">
                  <div
                    className={`h-[3px] w-full ${
                      isFault ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                    }`}
                  />

                  {/* Differential Calculation Vector */}
                  <div
                    className={`border px-2 py-1 rounded-sm text-[10px] font-mono mt-2 z-10 ${
                      isFault
                        ? "border-rose-500 bg-rose-950/90 text-rose-200 animate-pulse font-bold"
                        : "border-zinc-800 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    ΔI: {telemetry?.idiff.toFixed(3) || "0.020"} A
                    {isFault ? " [LEAKAGE FAULT!]" : " [BALANCED]"}
                  </div>

                  <span className="text-[9px] text-zinc-400 font-mono mt-1">
                    SUB-GHZ 868MHz AES-128 LORA MESH
                  </span>
                </div>

                {/* Pole 2 Node */}
                <div className="flex flex-col items-center z-10">
                  <div
                    className={`border-2 bg-zinc-900 px-3 py-2 rounded-sm text-center ${
                      telemetry?.p2.isOnline === false
                        ? "border-rose-500"
                        : isFault
                        ? "border-rose-400"
                        : "border-emerald-500"
                    }`}
                  >
                    <span className="text-[10px] text-zinc-400 uppercase font-mono block">OUTGOING</span>
                    <span className="text-xs font-bold font-mono text-zinc-100">POLE 2</span>
                    <span
                      className={`text-[11px] font-mono block tabular-nums ${
                        isFault ? "text-rose-400 font-bold" : "text-emerald-400"
                      }`}
                    >
                      {telemetry?.p2.i.toFixed(2) || "2.43"} A
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-400 mt-1">CT_SENSOR_2</span>
                </div>
              </div>

              {/* SLD Diagnostic Subtext */}
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>PROTECTION LOGIC: Kirchhoff Current Law (KCL)</span>
                <span>STATUS: {isFault ? "FAULT TRIP DISPATCHED" : "NORMAL CONDUCTION"}</span>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-zinc-800/80 px-3.5 py-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/40">
            FDIR DECISION ENGINE: LOCAL ESP32-S3 EMBEDDED REAL-TIME CALCULATOR
          </div>
        </Card>

        {/* PANEL 5: OPERATOR SERIAL INTERFACE & SCENARIO TESTING (Cols 8-12) */}
        <Card className="col-span-12 lg:col-span-5 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-400" />
              <CardTitle>Operator Controls & Injection Suite</CardTitle>
            </div>
            <Badge variant="outline">CONTROL DESK</Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Serial Hardware Connection Settings */}
            <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 rounded-sm space-y-2">
              <div className="text-[11px] font-mono text-zinc-400 uppercase flex justify-between">
                <span>GATEWAY HARDWARE SERIAL (115200 BAUD)</span>
                <span className={systemStatus?.gatewayConnected ? "text-emerald-400" : "text-zinc-500"}>
                  {systemStatus?.gatewayConnected ? "ONLINE" : "STANDBY"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-2 py-1 rounded-sm font-mono flex-1 focus:outline-none"
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                >
                  {availablePorts.length === 0 ? (
                    <option value="">No COM Ports Detected</option>
                  ) : (
                    availablePorts.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.path} ({p.manufacturer || "USB Serial"})
                      </option>
                    ))
                  )}
                </select>

                <Button
                  variant={systemStatus?.gatewayConnected ? "destructive" : "emerald"}
                  size="sm"
                  onClick={handlePortConnect}
                >
                  <Power className="h-3.5 w-3.5 mr-1" />
                  {systemStatus?.gatewayConnected ? "DISCONNECT" : "CONNECT"}
                </Button>
              </div>
            </div>

            {/* Test Simulation Controls */}
            <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 rounded-sm space-y-2">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">
                SCADA DIAGNOSTIC INJECTION (TEST HARNESS)
              </div>
              <div className="grid grid-cols-3 gap-1.5 font-mono">
                <Button
                  variant={selectedScenario === "NORMAL" ? "emerald" : "outline"}
                  size="sm"
                  className="text-[10px] px-1"
                  onClick={() => handleSimulationSwitch("NORMAL")}
                >
                  NORMAL (2.45A)
                </Button>

                <Button
                  variant={selectedScenario === "FAULT_HIGH_IDIFF" ? "destructive" : "outline"}
                  size="sm"
                  className="text-[10px] px-1"
                  onClick={() => handleSimulationSwitch("FAULT_HIGH_IDIFF")}
                >
                  FAULT (&gt;0.5A)
                </Button>

                <Button
                  variant={selectedScenario === "LAST_GASP" ? "destructive" : "outline"}
                  size="sm"
                  className="text-[10px] px-1"
                  onClick={() => handleSimulationSwitch("LAST_GASP")}
                >
                  LAST GASP
                </Button>
              </div>
            </div>

            {/* Manual Alarm Reset */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono text-zinc-400">
                ACTIVE OPERATOR ALARM:
              </span>
              <Button
                variant={isFault ? "destructive" : "secondary"}
                size="sm"
                className="font-mono text-xs font-bold"
                onClick={handleAcknowledgeAlarm}
                disabled={!isFault}
              >
                CLEAR ALARM / ACK
              </Button>
            </div>
          </CardContent>

          <div className="border-t border-zinc-800/80 px-3.5 py-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/40">
            MONGODB ARCHIVAL: <span className="text-emerald-400">PERSISTENT (gridsense)</span>
          </div>
        </Card>

        {/* PANEL 6: LIVE SCADA EVENT & AUDIT LOG TABLE (Cols 1-12) */}
        <Card className="col-span-12 flex flex-col">
          <CardHeader className="py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <CardTitle>SCADA Sequential Event Recorder (SER) // Real-Time Audit Log</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono">
              ENTRIES: {logs.length}
            </Badge>
          </CardHeader>

          <div className="max-h-60 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">TIMESTAMP</TableHead>
                  <TableHead className="w-24">SEVERITY</TableHead>
                  <TableHead className="w-32">SUBSYSTEM</TableHead>
                  <TableHead>EVENT MESSAGE / OPERATOR DIRECTIVE</TableHead>
                  <TableHead className="w-48 text-right">PAYLOAD DETAILS</TableHead>
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
      </main>

      {/* 4. FOOTER STATUS BAR */}
      <footer className="border border-zinc-800 bg-[#0f1012] px-3.5 py-1.5 rounded-sm flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400">
        <div className="flex items-center gap-3">
          <span>STATION: DISTRIBUTION_OFFICE_01</span>
          <span>•</span>
          <span>TELEMETRY BUS: SX1262 LoRa 868MHz HF</span>
          <span>•</span>
          <span>HOP LIMIT (TTL): 3</span>
        </div>
        <div>
          <span>MCA PROJECT // FISAT © 2026</span>
        </div>
      </footer>
    </div>
  );
}
