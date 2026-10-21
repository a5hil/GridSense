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
import { GridTelemetry, SystemStatus } from "@/lib/types";

interface EngineeringDiagnosticsProps {
  telemetry: GridTelemetry | null;
  systemStatus: SystemStatus | null;
  availablePorts: any[];
  selectedPort: string;
  onSelectPort: (port: string) => void;
  onConnectPort: () => void;
}

export function EngineeringDiagnostics({
  telemetry,
  systemStatus,
  availablePorts,
  selectedPort,
  onSelectPort,
  onConnectPort,
}: EngineeringDiagnosticsProps) {
  return (
    <div className="flex flex-col gap-3 font-mono">
      {/* Banner Notice */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 p-3 rounded-sm flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 shadow-xs dark:shadow-none transition-colors">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-slate-900 dark:text-zinc-200 font-semibold">
            ENGINEERING &amp; FIRMWARE DIAGNOSTICS CONSOLE
          </span>
          <span>•</span>
          <span>LoRa RF PHY, AES-128 Crypto &amp; Gateway Hardware Bus</span>
        </div>
        <Badge variant="crypto" className="text-[10px]">
          FIRMWARE BUILD: v2.4-AES128
        </Badge>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* PANEL 1: LORA LINK BUDGET & PACKET METRICS */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <CardTitle>LoRa Sub-GHz Link Metrics</CardTitle>
            </div>
            <Badge variant="outline">LR1121 SUB-GHZ RF MESH</Badge>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            {/* Pole 1 RF */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-1">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase flex justify-between">
                <span>Pole 1 (Incomer) RF</span>
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
                <span>Pole 2 (Outgoing) RF</span>
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
            <span>FREQUENCY: 866.3 MHz (IN865)</span>
            <span className="text-cyan-600 dark:text-cyan-400">SF9 / BW 125kHz</span>
          </div>
        </Card>

        {/* PANEL 2: HARDWARE SERIAL GATEWAY & PORT MANAGER */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <CardTitle>ESP32-S3 Hardware Gateway Port</CardTitle>
            </div>
            <Badge variant={systemStatus?.gatewayConnected ? "healthy" : "warning"}>
              {systemStatus?.gatewayConnected ? "OPEN" : "CLOSED"}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">
                DETECTED SERIAL PORTS:
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
                {systemStatus?.gatewayConnected ? "DISCONNECT PORT" : "CONNECT 115200 BAUD"}
              </Button>
            </div>

            {/* Direct Hardware Commands & Gateway Info */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-2 mt-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold flex justify-between items-center">
                <span>TELEMETRY INGESTION</span>
                <span className="text-emerald-500 font-bold">
                  LIVE HARDWARE BUS
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-zinc-400 space-y-1">
                <div>Source: <span className="text-slate-800 dark:text-zinc-200 font-semibold">{systemStatus?.gatewayConnected ? (systemStatus?.activePort || "Serial Gateway") : "Awaiting Gateway Link"}</span></div>
                <div>Status: <span className={systemStatus?.gatewayConnected ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>{systemStatus?.gatewayConnected ? "Active LoRa Ingestion" : "Serial Closed"}</span></div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold">HARDWARE CMD:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await fetch("/api/telemetry/ports", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "command", command: "n" }),
                      });
                    } catch (e) {}
                  }}
                  className="text-[10px] h-7 px-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-emerald-600 hover:text-white rounded text-slate-700 dark:text-zinc-200 font-mono transition-colors font-bold"
                  title="Send 'n' command over serial to clear undervoltage/fault on physical nodes"
                >
                  RESET HARDWARE ('n')
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
              <CardTitle>AES-128 Cipher &amp; Raw Frame</CardTitle>
            </div>
            <Badge variant="crypto">SECURE</Badge>
          </CardHeader>

          <CardContent className="space-y-2 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                <span className="text-slate-500 dark:text-zinc-400">Cipher Suite</span>
                <span className="text-cyan-700 dark:text-cyan-400 font-bold">AES-128-CTR HARDWARE</span>
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
                  MongoDB (gridsense: 27017)
                </span>
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold mb-1">
                LIVE JSON TELEMETRY INGESTION FRAME:
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
      </div>
    </div>
  );
}
