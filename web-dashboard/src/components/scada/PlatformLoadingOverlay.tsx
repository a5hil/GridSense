"use client";

import React, { useState, useEffect } from "react";
import { Zap } from "lucide-react";

interface PlatformLoadingOverlayProps {
  isDataReady?: boolean;
  onFinished: () => void;
}

export function PlatformLoadingOverlay({ onFinished }: PlatformLoadingOverlayProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Clean, simple 1.8-second delay to let background feeds stabilize
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      const finishTimer = setTimeout(() => {
        onFinished();
      }, 400);
      return () => clearTimeout(finishTimer);
    }, 1800);

    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#090a0d] text-zinc-100 flex flex-col items-center justify-center font-sans transition-opacity duration-400 ease-out select-none ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center text-center max-w-sm px-6">
        {/* Simple Brand Icon with Spinner Ring */}
        <div className="relative mb-5">
          <div className="h-16 w-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="h-6 w-6 text-emerald-400 fill-emerald-400" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-lg font-bold tracking-wide text-zinc-100 mb-1">
          Loading GridSense
        </h1>

        {/* Subtext */}
        <p className="text-xs text-zinc-400">
          Initializing telemetry &amp; distribution network...
        </p>
      </div>
    </div>
  );
}
