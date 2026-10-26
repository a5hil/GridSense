"use client";

import React, { useState, useEffect } from "react";
import { Zap, ShieldCheck, Activity, Cpu, CheckCircle2, Radio, Server } from "lucide-react";

interface PlatformLoadingOverlayProps {
  isDataReady: boolean;
  onFinished: () => void;
}

interface InitStep {
  label: string;
  subtext: string;
  icon: React.ReactNode;
}

const STEPS: InitStep[] = [
  {
    label: "OPERATOR SESSION VERIFIED",
    subtext: "Validating cryptographic token & Angamaly Dispatch credentials...",
    icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
  },
  {
    label: "SUBSTATION GATEWAY LINK",
    subtext: "Connecting to Angamaly 33/11kV RTUs via IEC 60870-5-104 pipeline...",
    icon: <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />,
  },
  {
    label: "DIGITAL TWIN TOPOLOGY SYNC",
    subtext: "Calculating 3-phase load-flow & 28-pole differential current matrix...",
    icon: <Cpu className="h-4 w-4 text-amber-400" />,
  },
  {
    label: "ANSI 87L PROTECTION CALIBRATION",
    subtext: "Arming fast differential relays (pickup ΔI=0.35A, delay 150ms)...",
    icon: <Activity className="h-4 w-4 text-purple-400" />,
  },
  {
    label: "SCADA ADMS CONSOLE READY",
    subtext: "Telemetry stream synchronized. Launching real-time monitoring...",
    icon: <Server className="h-4 w-4 text-emerald-300" />,
  },
];

export function PlatformLoadingOverlay({ isDataReady, onFinished }: PlatformLoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Total initialization time: ~2200ms
    const intervalTime = 35;
    const increment = 1.6;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90 && !isDataReady) {
          // Pause at 90% if network/telemetry is still stabilizing
          return 90;
        }

        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isDataReady]);

  // Synchronize step index with progress percentage
  useEffect(() => {
    if (progress < 25) setCurrentStepIndex(0);
    else if (progress < 50) setCurrentStepIndex(1);
    else if (progress < 75) setCurrentStepIndex(2);
    else if (progress < 95) setCurrentStepIndex(3);
    else setCurrentStepIndex(4);

    if (progress >= 100) {
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
        const completeTimer = setTimeout(() => {
          onFinished();
        }, 600);
        return () => clearTimeout(completeTimer);
      }, 400);

      return () => clearTimeout(fadeTimer);
    }
  }, [progress, onFinished]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#07080a] text-zinc-100 flex flex-col justify-between p-6 sm:p-10 font-mono transition-opacity duration-600 ease-out select-none ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background Subtle Substation Grid Aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-500" />

      {/* TOP PROTOCOL BANNER */}
      <div className="relative z-10 flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-sm bg-gradient-to-br from-emerald-600 to-cyan-700 flex items-center justify-center border border-emerald-400/40">
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest text-zinc-100">
              GRIDSENSE SCADA ADMS
            </div>
            <div className="text-[10px] text-zinc-500">
              ANGAMALY 33/11kV SUBSTATION DISPATCH
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="hidden sm:inline">IEC 61850 • IEEE C37.118</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-emerald-400 font-bold uppercase tracking-wider">
            BOOT SEQUENCE ACTIVE
          </span>
        </div>
      </div>

      {/* CENTER INITIALIZATION CORE */}
      <div className="relative z-10 max-w-lg w-full mx-auto my-auto py-8">
        {/* Radar / Core Visual */}
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <div className="relative mb-4">
            <div className="h-20 w-20 rounded-full border border-emerald-500/30 flex items-center justify-center animate-spin [animation-duration:8s]">
              <div className="h-14 w-14 rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-cyan-500 border-l-transparent animate-spin [animation-duration:2.5s]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="h-6 w-6 text-emerald-400 fill-emerald-400/40 animate-pulse" />
            </div>
          </div>

          <h2 className="text-sm font-black tracking-widest text-zinc-100 uppercase mb-1">
            INITIALIZING DISPATCH CONSOLE
          </h2>
          <p className="text-[11px] text-zinc-400 max-w-sm">
            Stabilizing telemetry feeds, digital twin load-flow, and ANSI 87L differential relays before rendering.
          </p>
        </div>

        {/* PROGRESS BAR */}
        <div className="mb-6 bg-zinc-950/80 border border-zinc-800 p-3 rounded-sm shadow-xl">
          <div className="flex items-center justify-between text-[11px] mb-2 font-bold">
            <span className="text-zinc-400 tracking-wider uppercase">
              System Stabilization
            </span>
            <span className="text-emerald-400 font-mono">
              {Math.round(progress)}%
            </span>
          </div>

          <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-400 transition-all duration-100 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* INITIALIZATION STEP CHECKLIST */}
        <div className="space-y-2 bg-[#0c0e12] border border-zinc-800/80 p-3.5 rounded-sm">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex || progress >= 100;
            const isCurrent = idx === currentStepIndex && progress < 100;

            return (
              <div
                key={idx}
                className={`flex items-start gap-2.5 p-2 rounded text-[11px] transition-all duration-300 ${
                  isCurrent
                    ? "bg-zinc-900/90 border border-emerald-500/40 shadow-sm"
                    : isDone
                    ? "text-zinc-400 opacity-80"
                    : "text-zinc-600 opacity-40"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    step.icon
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-bold tracking-wide truncate ${
                      isCurrent
                        ? "text-emerald-300"
                        : isDone
                        ? "text-zinc-200"
                        : "text-zinc-500"
                    }`}
                  >
                    {step.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">
                    {step.subtext}
                  </div>
                </div>
                <div className="text-[9px] font-mono shrink-0">
                  {isDone ? (
                    <span className="text-emerald-400 font-bold">OK</span>
                  ) : isCurrent ? (
                    <span className="text-cyan-400 animate-pulse">RUNNING</span>
                  ) : (
                    <span className="text-zinc-600">WAIT</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FOOTER SYSTEM METRICS */}
      <div className="relative z-10 border-t border-zinc-800/80 pt-3 flex flex-wrap items-center justify-between text-[10px] text-zinc-500">
        <div>
          <span>RTU CLUSTER: P01 (PRIMARY) • P02 (SECONDARY)</span>
        </div>
        <div className="flex items-center gap-4">
          <span>SAMPLING: 50.0 Hz</span>
          <span>•</span>
          <span>MAX ALLOWED LATENCY: 250ms</span>
          <span>•</span>
          <span className="text-zinc-400">DISPATCH READY</span>
        </div>
      </div>
    </div>
  );
}
