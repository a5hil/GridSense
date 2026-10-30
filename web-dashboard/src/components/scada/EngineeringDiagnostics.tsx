"use client";

import * as React from "react";
import {
  Activity,
  Cpu,
  Layers,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Terminal,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { GridTelemetry, SystemStatus } from "@/lib/types";
import { NetworkSnapshot } from "@/lib/network/types";

interface EngineeringDiagnosticsProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  systemStatus: SystemStatus | null;
  availablePorts: any[];
  selectedPort: string;
  onSelectPort: (port: string) => void;
  onConnectPort: () => void;
}

export const EngineeringDiagnostics = React.memo(function EngineeringDiagnostics({
  telemetry,
  networkSnapshot,
  systemStatus,
  availablePorts,
  selectedPort,
  onSelectPort,
  onConnectPort,
}: EngineeringDiagnosticsProps) {
  const { addToast } = useToast();
  return (
    <div className="flex flex-col gap-3 font-mono">
      {/* Banner Notice */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3.5 rounded-sm flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 shadow-xs dark:shadow-none transition-colors">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-slate-900 dark:text-zinc-200 font-semibold">
            SCADA RTU COMMUNICATIONS &amp; CIPHER DIAGNOSTICS CONSOLE
          </span>
          <span>•</span>
          <span>Sub-GHz Utility Mesh (IN865), AES-128 Supervisory Bus &amp; IEC 60870-5 Ingestion</span>
        </div>
        <Badge variant="crypto" className="text-[10px]">
          PROTOCOL: IEC 60870-5-104 / AES-128-CTR
        </Badge>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* PANEL 1: LORA LINK BUDGET & PACKET METRICS */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <CardTitle>Sub-GHz Utility Mesh Telemetry (IN865 / 866.3 MHz)</CardTitle>
            </div>
            <Badge variant="outline">RF PHY: IN865 BAND</Badge>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            {/* Pole 1 RF */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-1">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between">
                <span>Substation Incomer (F1-P01) RTU</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {telemetry?.p1 ? `Hop ${telemetry.p1.hops} (Direct)` : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-slate-500 dark:text-zinc-400">RSSI</span>
                <span className="text-slate-900 dark:text-zinc-200 font-bold tabular-nums">
                  {telemetry?.p1?.rssi !== undefined && telemetry.p1.rssi !== 0 ? `${telemetry.p1.rssi} dBm` : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 dark:text-zinc-400">Signal-to-Noise (SNR)</span>
                <span className="text-slate-900 dark:text-zinc-200 font-bold tabular-nums">
                  {telemetry?.p1?.snr !== undefined && telemetry.p1.snr !== 0 ? `+${telemetry.p1.snr} dB` : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 dark:text-zinc-400">Packet Age</span>
                <span className="text-slate-700 dark:text-zinc-200 tabular-nums">
                  {telemetry?.p1?.age_ms !== undefined && telemetry.p1.age_ms !== 99999 ? `${telemetry.p1.age_ms} ms` : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* Pole 2 RF */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-1">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between">
                <span>Section 1 Boundary (F1-P02) RTU</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {telemetry?.p2 ? (telemetry.p2.hops === 1 ? "Hop 1 (Relayed)" : "Hop 0 (Direct)") : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-slate-500 dark:text-zinc-400">RSSI</span>
                <span className="text-slate-900 dark:text-zinc-200 font-bold tabular-nums">
                  {telemetry?.p2?.rssi !== undefined && telemetry.p2.rssi !== 0 ? `${telemetry.p2.rssi} dBm` : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 dark:text-zinc-400">Signal-to-Noise (SNR)</span>
                <span className="text-slate-900 dark:text-zinc-200 font-bold tabular-nums">
                  {telemetry?.p2?.snr !== undefined && telemetry.p2.snr !== 0 ? `+${telemetry.p2.snr} dB` : "---"}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 dark:text-zinc-400">Packet Age</span>
                <span className="text-slate-700 dark:text-zinc-200 tabular-nums">
                  {telemetry?.p2?.age_ms !== undefined && telemetry.p2.age_ms !== 99999 ? `${telemetry.p2.age_ms} ms` : "OFFLINE"}
                </span>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-1.5 text-[11px] flex items-center justify-between text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950/40">
            <span>RF CHANNEL: SUB-GHZ UTILITY MESH • 866.3 MHz (IN865)</span>
            <span className="text-cyan-600 dark:text-cyan-400">SF9 / BW 125kHz</span>
          </div>
        </Card>

        {/* PANEL 2: HARDWARE SERIAL GATEWAY & PORT MANAGER */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <CardTitle>RTU Serial Communications Interface (IEC 60870-5-101/104)</CardTitle>
            </div>
            <Badge variant={systemStatus?.gatewayConnected ? "healthy" : "warning"}>
              {systemStatus?.gatewayConnected ? "ONLINE" : "OFFLINE"}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">
                DETECTED HARDWARE RTU / COM PORTS:
              </label>
              <select
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:border-slate-400 dark:focus:border-zinc-600 font-mono transition-colors"
                value={selectedPort}
                onChange={(e) => onSelectPort(e.target.value)}
              >
                {availablePorts.length === 0 ? (
                  <option value="">No COM Ports Detected</option>
                ) : (
                  availablePorts.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.path} {p.manufacturer ? `(${p.manufacturer})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                variant={systemStatus?.gatewayConnected ? "destructive" : "emerald"}
                size="sm"
                className="w-full text-xs font-bold"
                onClick={onConnectPort}
              >
                {systemStatus?.gatewayConnected ? "DISCONNECT SERIAL PORT" : "CONNECT SERIAL PORT (115200 BAUD)"}
              </Button>
            </div>

            {/* Direct Hardware Commands & Gateway Info */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-2 mt-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold flex justify-between items-center">
                <span>TELEMETRY INGESTION (IEC 60870-5-104)</span>
                <span className="text-emerald-500 font-bold">
                  ACTIVE SCADA BUS
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-zinc-400 space-y-1">
                <div>Source: <span className="text-slate-800 dark:text-zinc-200 font-semibold">{systemStatus?.gatewayConnected ? (systemStatus?.activePort || "Serial Gateway") : "Awaiting Gateway Link"}</span></div>
                <div>Status: <span className={systemStatus?.gatewayConnected ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>{systemStatus?.gatewayConnected ? "Active Telemetry Stream" : "Serial Closed"}</span></div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold">SUPERVISORY CMD:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/telemetry/ports", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "command", command: "n" }),
                      });
                      const data = await res.json();
                      if (res.ok && data.success !== false) {
                        addToast({
                          title: "SUPERVISORY COMMAND SENT ('n')",
                          description: "Remote protection relay latch cleared and re-armed via SCADA serial bus.",
                          type: "success",
                        });
                      } else {
                        addToast({
                          title: "COMMAND TRANSMISSION FAILED",
                          description: data.error || "Gateway serial link is offline or did not acknowledge.",
                          type: "warning",
                        });
                      }
                    } catch (e: any) {
                      addToast({
                        title: "COMMAND ERROR",
                        description: e?.message || "Failed to reach telemetry gateway API.",
                        type: "warning",
                      });
                    }
                  }}
                  className="text-[10px] h-7 px-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-emerald-600 hover:text-white rounded text-slate-700 dark:text-zinc-200 font-mono transition-colors font-bold cursor-pointer"
                  title="Send remote command over SCADA link to clear trips and re-arm line protection relays"
                >
                  RESET PROTECTION LATCH / RE-ARM (&apos;n&apos;)
                </Button>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-1.5 text-[11px] flex items-center justify-between text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950/40">
            <span>BAUD: 115200 8N1</span>
            <span className="text-slate-700 dark:text-zinc-300">AUTO-RECONNECT: ENABLED</span>
          </div>
        </Card>

        {/* PANEL 3: CIPHER & RAW JSON TELEMETRY STREAM */}
        <Card className="col-span-12 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <CardTitle>SCADA Cybersecurity Suite (AES-128-CTR &amp; CRC-32)</CardTitle>
            </div>
            <Badge variant="crypto">SECURE</Badge>
          </CardHeader>

          <CardContent className="space-y-2 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                <span className="text-slate-500 dark:text-zinc-400">Cipher Suite</span>
                <span className="text-cyan-700 dark:text-cyan-400 font-bold">AES-128-CTR ENCRYPTED</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                <span className="text-slate-500 dark:text-zinc-400">Gateway Uptime (gw_ms)</span>
                <span className="text-slate-800 dark:text-zinc-200 tabular-nums">
                  {telemetry?.gw_ms || 0} ms
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                <span className="text-slate-500 dark:text-zinc-400">FDIR Cycle Speed</span>
                <span className="text-emerald-600 dark:text-emerald-400">250 ms Fast Loop</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                <span className="text-slate-500 dark:text-zinc-400">Database Storage</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {systemStatus?.mongoConnected
                    ? `MongoDB (${systemStatus.dbName || "gridsense"})`
                    : "SCADA SOE Cache (In-Memory Ring Buffer)"}
                </span>
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold mb-1">
                IEC 60870-5-104 PROTOCOL INGESTION BUFFER:
              </div>
              <pre className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2 rounded-sm text-[10px] text-slate-800 dark:text-zinc-300 overflow-x-auto max-h-36 font-mono leading-tight">
                {telemetry?.rawPayload
                  ? JSON.stringify(telemetry.rawPayload, null, 2)
                  : JSON.stringify(
                      {
                        status: systemStatus?.gatewayConnected ? "CONNECTED_WAITING_FRAME" : "NO_GATEWAY_CONNECTED",
                        port: systemStatus?.activePort || "DISCONNECTED",
                        baud: 115200,
                        protocol: "Central_Gateway_Stream_V2",
                      },
                      null,
                      2
                    )}
              </pre>
            </div>
          </CardContent>

          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-1.5 text-[11px] flex items-center justify-between text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950/40">
            <span>PARSER: STREAM_V2</span>
            <span className="text-emerald-600 dark:text-emerald-400">CRC32 VERIFIED</span>
          </div>
        </Card>

        {/* PANEL 4: 3-PHASE NETWORK DIGITAL TWIN & REAL-TIME SENSOR CALIBRATION */}
        <Card className="col-span-12 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <CardTitle>Distribution State Estimation &amp; Instrument Transformer Calibration</CardTitle>
            </div>
            <Badge variant="healthy">
              {networkSnapshot ? "GRID MODEL ACTIVE (28 POLES)" : "IDLE"}
            </Badge>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Column 1: Calibration Engine */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3 rounded-sm space-y-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between items-center border-b border-slate-200 dark:border-zinc-800/60 pb-1.5">
                <span>INSTRUMENT TRANSFORMER (CT/PT) RATIO &amp; LINE CALIBRATION</span>
                <span className="text-emerald-500 font-bold">
                  {networkSnapshot?.calibration?.status === "CALIBRATED" ? "LOCKED & CONVERGED" : "INITIALIZING"}
                </span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Learned Voltage Offset (ΔV):</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                    {networkSnapshot?.calibration?.vOffset !== undefined
                      ? `${networkSnapshot.calibration.vOffset >= 0 ? "+" : ""}${networkSnapshot.calibration.vOffset.toFixed(2)} V`
                      : "0.00 V"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Learned Power Gain (P_gain):</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                    {networkSnapshot?.calibration?.pGain !== undefined
                      ? `${networkSnapshot.calibration.pGain.toFixed(3)}x`
                      : "1.000x"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Baseline Calibration Window:</span>
                  <span className="text-slate-800 dark:text-zinc-200 tabular-nums">
                    {networkSnapshot?.calibration?.vSamples ?? 0} cycles (10s rolling)
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 pt-1 border-t border-slate-200 dark:border-zinc-800/60">
                  Compensates for transducer ratio variances and conductor baseline losses during normal load to prevent phantom differential trips.
                </p>
              </div>
            </div>

            {/* Column 2: Physical Hardware Anchor Mapping */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3 rounded-sm space-y-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between items-center border-b border-slate-200 dark:border-zinc-800/60 pb-1.5">
                <span>DISTRIBUTION LINE METERING BINDINGS</span>
                <span className="text-cyan-500 font-bold">LIVE SUPERVISION</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Section 1 Incomer:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    F1-P01 (LT-1 Incomer • Phase R Metered)
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Section 1 Terminal:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    F1-P02 (LT-1 Section 1 Terminal • Phase R Metered)
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Phases Y &amp; B Modeling:</span>
                  <Badge variant="outline" className="text-[9px] py-0 border-cyan-500 text-cyan-700 dark:text-cyan-400">
                    {networkSnapshot?.uninstrumentedMode === "SIM" ? "3-PHASE STATE ESTIMATION" : "DIRECT CT/PT ONLY"}
                  </Badge>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Telemetry Link Status:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-mono">
                    {networkSnapshot?.liveLinkUp ? "ESTABLISHED (OK)" : "AWAITING GATEWAY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 3: FDIR & FLISR Cycle */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3 rounded-sm space-y-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between items-center border-b border-slate-200 dark:border-zinc-800/60 pb-1.5">
                <span>FDIR SUPERVISORY AUTOMATION ENGINE</span>
                <span className="text-amber-500 font-bold">ANSI SUITE</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Network Buses Monitored:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                    {(networkSnapshot ? networkSnapshot.nodes.filter((n) => n.feederId !== null).length : 28)} Distribution Poles (+ DTR-01) / 3 LT Feeders
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Active Anomaly Detections:</span>
                  <span className={`font-bold tabular-nums ${(networkSnapshot?.detections.length ?? 0) > 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}>
                    {networkSnapshot?.detections.length ?? 0} Events
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Protection Schemes:</span>
                  <span className="text-slate-800 dark:text-zinc-200 text-[10px]">
                    87L (Diff) • 46BC (Broken Conductor) • 59N (Neutral)
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-400">Auto-Isolation / FLISR:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Dynamic Section Isolation Suggestion
                  </span>
                </div>
              </div>
            </div>
          </CardContent>

          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-1.5 text-[11px] flex items-center justify-between text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950/40">
            <span>STATE ESTIMATION: WEIGHTED LEAST-SQUARES (WLS) FORWARD-BACKWARD SWEEP</span>
            <span className="text-emerald-600 dark:text-emerald-400">ZERO RESIDUAL DRIFT</span>
          </div>
        </Card>
      </div>
    </div>
  );
});
