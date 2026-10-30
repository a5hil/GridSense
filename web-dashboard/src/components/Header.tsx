"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/context/DashboardContext";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Header() {
  const {
    isFault,
    activeFaultAnsi,
    lastHeartbeat,
    currentUser,
    handleLogout,
  } = useDashboard();

  const [clockTime, setClockTime] = useState<string>("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    setClockTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    const interval = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] px-4 flex items-center justify-between font-mono select-none shrink-0 z-30 transition-colors">
      {/* 1. LEFT: CLEAN BREADCRUMB NAVIGATION & DYNAMIC HEALTH PILL */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
          <Link
            href="/"
            className="text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-bold"
          >
            GridSense ADMS
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-600 shrink-0" />
          <span className="text-slate-600 dark:text-zinc-300 font-semibold truncate hidden sm:inline">
            Angamaly 33/11kV
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-600 shrink-0 hidden sm:inline" />
          <span className="text-slate-900 dark:text-zinc-100 font-black truncate">
            Feeder 04
          </span>
        </nav>

        {/* Dynamic System Health Status Pill */}
        <Badge
          variant={isFault ? "destructive" : "healthy"}
          className={`ml-2 text-[10px] py-0.5 px-2 flex items-center gap-1.5 font-bold uppercase shrink-0 ${
            isFault ? "animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" : ""
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isFault ? "bg-white animate-ping" : "bg-emerald-400"
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
      <div className="flex items-center gap-2.5 shrink-0">
        <ThemeToggle />

        {/* Live IST Digital Clock */}
        <div
          suppressHydrationWarning
          className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] text-slate-600 dark:text-zinc-400 tabular-nums hidden md:block"
        >
          CLOCK (IST):{" "}
          <span className="text-slate-900 dark:text-zinc-200 font-bold">
            {clockTime || lastHeartbeat || "--:--:--"}
          </span>
        </div>

        {/* Operator Profile Dropdown / Pill */}
        {currentUser ? (
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 border border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700/60 flex items-center justify-center text-[10px] font-bold">
                {(currentUser.name || currentUser.username || "O").charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col text-left leading-tight hidden sm:flex">
                <span className="font-bold text-slate-800 dark:text-zinc-200 truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
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
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-bold uppercase transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            <span>Login</span>
          </Link>
        )}
      </div>
    </header>
  );
}
