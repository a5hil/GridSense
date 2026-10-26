"use client";

import React, { useState, useEffect, useRef } from "react";
import { Zap, Loader2 } from "lucide-react";

interface PlatformLoadingOverlayProps {
  isDataReady?: boolean;
  onFinished: () => void;
}

const PROCESS_STEPS = [
  "Connecting to distribution substation...",
  "Synchronizing real-time telemetry...",
  "Loading grid digital twin model...",
  "Calibrating protection & fault detection...",
  "Launching dispatch console...",
];

export function PlatformLoadingOverlay({ onFinished }: PlatformLoadingOverlayProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  
  // Use a ref so parent re-renders never cancel the timer
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  // Cycle through process steps every 850ms
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < PROCESS_STEPS.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 850);

    return () => clearInterval(stepInterval);
  }, []);

  // Main exit timer: exactly 4.2 seconds total
  useEffect(() => {
    const totalDuration = 4200;

    const timer = setTimeout(() => {
      setIsFadingOut(true);
      const finishTimer = setTimeout(() => {
        if (onFinishedRef.current) {
          onFinishedRef.current();
        }
      }, 400);

      return () => clearTimeout(finishTimer);
    }, totalDuration);

    return () => clearTimeout(timer);
  }, []); // Empty dependency array ensures it runs once on mount and NEVER gets stuck

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#08090c] text-zinc-100 flex flex-col items-center justify-center font-mono transition-opacity duration-400 ease-out select-none ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background Subtle Substation Grid Aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-6">
        {/* Animated Brand Icon */}
        <div className="relative mb-6">
          {/* Subtle outer pulsing aura */}
          <div className="absolute -inset-2 rounded-full bg-emerald-500/20 blur-md animate-pulse" />
          
          {/* Outer rotating ring */}
          <div className="h-16 w-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 border-r-cyan-400 animate-spin" />
          
          {/* Glowing Center Zap Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="h-7 w-7 text-emerald-400 fill-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-base font-bold tracking-widest text-zinc-100 uppercase mb-2">
          GridSense SCADA ADMS
        </h1>

        {/* Dynamic Process Status Step */}
        <div className="h-8 flex items-center justify-center gap-2 text-xs text-zinc-300 font-sans transition-all duration-200">
          <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin shrink-0" />
          <span className="truncate">{PROCESS_STEPS[stepIndex]}</span>
        </div>

        {/* Step dots indicator */}
        <div className="flex items-center gap-1.5 mt-3">
          {PROCESS_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? "w-5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : i < stepIndex
                  ? "w-2 bg-emerald-600/60"
                  : "w-2 bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
