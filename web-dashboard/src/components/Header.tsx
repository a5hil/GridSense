"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Clock, LogOut, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDashboard, ActiveView } from "@/context/DashboardContext";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const VIEW_LABELS: Record<ActiveView, string> = {
  OPERATOR: "Operations Desk",
  GIS: "Geospatial GIS",
  NETWORK: "Network Model (3Φ)",
  WAVEFORMS: "Power Quality & Waveforms",
  OMS: "OMS & Field Dispatch",
  COMMS: "Communications & RTU",
  DIAGNOSTICS: "Communications & RTU",
  SOE: "Sequence of Events (SOE)",
  LOGS: "Sequence of Events (SOE)",
};

// Single source of truth for the header clock: always 24h, always IST,
// regardless of browser locale. Isolated component so its 1s tick
// never re-renders the Header or any context consumers.
const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const LiveIstClock = React.memo(function LiveIstClock() {
  const spanRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      if (spanRef.current) {
        spanRef.current.textContent = IST_TIME_FORMATTER.format(new Date());
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      ref={spanRef}
      suppressHydrationWarning
      className="text-slate-900 dark:text-zinc-200 font-bold"
    >
      --:--:--
    </span>
  );
});

export function Header() {
  const pathname = usePathname();
  const {
    activeView,
    setActiveView,
    isFault,
    activeFaultAnsi,
    currentUser,
    handleLogout,
    systemStatus,
    scadaSettings,
  } = useDashboard();

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const isAlarmUnacked = isFault && systemStatus?.operatorAck === false;
  const activeSectionLabel =
    pathname === "/settings" ? "System Settings" : VIEW_LABELS[activeView] || "Operations Desk";
  const shortSubstation = scadaSettings?.substationName
    ? scadaSettings.substationName.replace(/\s*Substation\s*$/i, "")
    : "Angamaly 33/11kV";
  const feederLabel = scadaSettings?.feederId || "Feeder 04";

  return (
    <header className="h-14 border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0d10]/95 backdrop-blur-xs px-4 lg:px-5 flex items-center justify-between font-mono select-none shrink-0 z-30 transition-colors">
      {/* 1. LEFT: STREAMLINED BREADCRUMB NAVIGATION & SCADA HEALTH PILL */}
      <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
          <Link
            href="/"
            onClick={() => setActiveView("OPERATOR")}
            className="text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-bold shrink-0"
          >
            GridSense ADMS
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-700 shrink-0" />
          <span className="text-slate-600 dark:text-zinc-300 font-medium truncate hidden md:inline">
            {shortSubstation}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-700 shrink-0 hidden md:inline" />
          <span className="text-slate-600 dark:text-zinc-300 font-medium truncate hidden sm:inline">
            {feederLabel}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-700 shrink-0 hidden sm:inline" />
          <span className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
            {activeSectionLabel}
          </span>
        </nav>

        <div className="h-3.5 w-[1px] bg-slate-200 dark:bg-zinc-800 mx-0.5 hidden sm:block shrink-0" />

        {/* Dynamic System Health Status Pill */}
        <Badge
          variant={isFault ? "destructive" : "healthy"}
          className={`h-6 text-[9.5px] px-2 flex items-center gap-1.5 font-bold uppercase tracking-wider shrink-0 transition-all ${
            isAlarmUnacked ? "animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.45)]" : ""
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isFault
                ? isAlarmUnacked
                  ? "bg-rose-600 dark:bg-white animate-ping"
                  : "bg-rose-600 dark:bg-rose-400"
                : "bg-emerald-500 dark:bg-emerald-400"
            }`}
          />
          <span>
            {isFault
              ? activeFaultAnsi
                ? `FEEDER ALERT (${activeFaultAnsi})`
                : "FEEDER ALERT"
              : "FEEDER HEALTHY"}
          </span>
        </Badge>
      </div>

      {/* 2. RIGHT ACTIONS: THEME TOGGLE, DIGITAL CLOCK (IST) & OPERATOR PROFILE */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Day / SCADA Dark Theme Toggle */}
        <ThemeToggle />

        {/* Live IST Telemetry Clock */}
        <div
          suppressHydrationWarning
          className="h-8 flex items-center gap-1.5 px-2.5 rounded-sm border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/80 text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums hidden md:flex font-mono shadow-2xs"
        >
          <Clock className="h-3 w-3 text-slate-400 dark:text-zinc-500 shrink-0" />
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
            IST:
          </span>
          <LiveIstClock />
        </div>

        {/* Operator Profile Dropdown / Pill */}
        {currentUser && (
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="h-8 flex items-center gap-2 border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/80 px-2 rounded-sm text-[11px] hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer shadow-2xs"
            >
              <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300/80 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700/60 flex items-center justify-center text-[9px] font-bold shrink-0">
                {(currentUser.name || currentUser.username || "O").charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col text-left leading-none hidden sm:flex justify-center gap-0.5">
                <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200 truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-[8.5px] text-emerald-600 dark:text-emerald-400 font-bold tracking-wider uppercase font-mono">
                  {currentUser.role}
                </span>
              </div>
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0f1115] border border-slate-200 dark:border-zinc-800 rounded-sm shadow-xl p-3 z-50 text-xs font-mono"
                onMouseLeave={() => setIsProfileOpen(false)}
              >
                <div className="pb-2.5 mb-2.5 border-b border-slate-200 dark:border-zinc-800">
                  <div className="font-bold text-slate-900 dark:text-zinc-100 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Badge: <span className="text-slate-700 dark:text-zinc-300">{currentUser.badgeId}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Station: <span className="text-slate-700 dark:text-zinc-300">{currentUser.station || "Angamaly 33/11kV"}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors text-left font-bold"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Logout Dispatch Console</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
