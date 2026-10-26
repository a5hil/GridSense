"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Activity,
  AudioWaveform,
  Wrench,
  Cpu,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useDashboard, ActiveView } from "@/context/DashboardContext";

interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  badgeVariant?: "warning" | "destructive" | "normal";
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isSidebarCollapsed,
    toggleSidebar,
    activeView,
    setActiveView,
    networkSnapshot,
    openTicketsCount,
  } = useDashboard();

  const isSettingsPage = pathname === "/settings";

  // Calculate dynamic badge indicators
  const detectionCount = networkSnapshot?.detections?.length ?? 0;

  const navItems: NavItem[] = [
    {
      id: "OPERATOR",
      label: "Operations Desk",
      icon: LayoutDashboard,
    },
    {
      id: "GIS",
      label: "Geospatial GIS",
      icon: MapPin,
    },
    {
      id: "NETWORK",
      label: "Network Model (3Φ)",
      icon: Activity,
      badgeCount: detectionCount,
      badgeVariant: "destructive",
    },
    {
      id: "WAVEFORMS",
      label: "Power Quality & Waveforms",
      icon: AudioWaveform,
    },
    {
      id: "OMS",
      label: "OMS & Field Dispatch",
      icon: Wrench,
      badgeCount: openTicketsCount,
      badgeVariant: "warning",
    },
    {
      id: "COMMS",
      label: "Communications & RTU",
      icon: Cpu,
    },
    {
      id: "SOE",
      label: "Sequence of Events (SOE)",
      icon: Clock,
    },
  ];

  const handleNavClick = (viewId: ActiveView) => {
    setActiveView(viewId);
    if (pathname !== "/") {
      router.push("/");
    }
  };

  return (
    <aside
      className={`h-screen flex flex-col justify-between border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] font-mono select-none overflow-hidden will-change-[width] transition-[width] duration-250 ease-[cubic-bezier(0.2,0,0,1)] shrink-0 z-40 ${
        isSidebarCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* 1. TOP BRAND LOGO & COLLAPSE TOGGLE */}
      <div>
        <div className="h-14 border-b border-slate-200 dark:border-zinc-800 flex items-center px-3 overflow-hidden">
          {/* Brand Icon / Morphing Toggle in Collapsed Mode */}
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <button
              onClick={isSidebarCollapsed ? toggleSidebar : () => { setActiveView("OPERATOR"); if (pathname !== "/") router.push("/"); }}
              className="h-9 w-9 rounded-sm bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400/70 hover:bg-emerald-500/20 flex items-center justify-center transition-all group cursor-pointer"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Operations Desk"}
            >
              <Zap className={`h-4 w-4 text-emerald-400 fill-emerald-400 ${isSidebarCollapsed ? "group-hover:hidden" : ""}`} />
              {isSidebarCollapsed && (
                <ChevronRight className="h-4 w-4 text-emerald-400 hidden group-hover:block" />
              )}
            </button>
          </div>

          {/* Brand Title (Smooth fade & collapse) */}
          <Link
            href="/"
            onClick={() => setActiveView("OPERATOR")}
            className={`flex flex-col min-w-0 transition-all duration-200 ease-out overflow-hidden whitespace-nowrap ${
              isSidebarCollapsed
                ? "max-w-0 opacity-0 pointer-events-none ml-0"
                : "max-w-[130px] opacity-100 ml-2.5"
            }`}
          >
            <span className="text-xs font-black tracking-wider text-slate-900 dark:text-zinc-100 truncate">
              GRIDSENSE
            </span>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest truncate">
              ADMS 2.0
            </span>
          </Link>

          {/* Collapse Button (ChevronLeft) */}
          <button
            onClick={toggleSidebar}
            className={`p-1.5 rounded-sm text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all duration-200 shrink-0 cursor-pointer ml-auto ${
              isSidebarCollapsed ? "opacity-0 pointer-events-none scale-75 w-0 p-0 overflow-hidden" : "opacity-100"
            }`}
            title="Collapse Sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* 2. PRIMARY NAVIGATION (TOP) */}
        <div className="py-3 px-3 space-y-1.5 overflow-hidden">
          <div
            className={`px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 overflow-hidden whitespace-nowrap transition-all duration-200 ease-out ${
              isSidebarCollapsed ? "h-0 opacity-0 mb-0" : "h-4 opacity-100 mb-1"
            }`}
          >
            GRID SUPERVISION
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = !isSettingsPage && activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full h-10 flex items-center rounded-sm transition-all duration-150 relative group cursor-pointer select-none ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-bold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60 border border-transparent"
                }`}
              >
                {/* Fixed Icon Container */}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      isActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300"
                    }`}
                  />
                </div>

                {/* Label & Badges in Expanded Mode (smoothly collapses) */}
                <div
                  className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 transition-all duration-200 ease-out overflow-hidden whitespace-nowrap ${
                    isSidebarCollapsed
                      ? "max-w-0 opacity-0 pointer-events-none translate-x-1"
                      : "max-w-[180px] opacity-100 translate-x-0"
                  }`}
                >
                  <span className="truncate text-xs tracking-wide">
                    {item.label}
                  </span>

                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      className={`ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-xs shrink-0 ${
                        item.badgeVariant === "destructive"
                          ? "bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse"
                          : "bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/40"
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </div>

                {/* Indicator Pip in Collapsed Mode */}
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0c0d10] transition-opacity duration-200 ${
                      isSidebarCollapsed ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
                    } ${
                      item.badgeVariant === "destructive"
                        ? "bg-rose-500 animate-pulse"
                        : "bg-amber-500"
                    }`}
                  />
                )}

                {/* Floating Tooltip in Collapsed Mode */}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0f1115] border border-zinc-700 text-zinc-100 text-[11px] font-mono rounded-sm shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[100] flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="text-[9px] px-1 bg-amber-500/30 text-amber-300 border border-amber-500/50 rounded-xs">
                        {item.badgeCount}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SECONDARY NAVIGATION (BOTTOM): SETTINGS */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800 overflow-hidden">
        <Link
          href="/settings"
          className={`w-full h-10 flex items-center rounded-sm transition-all duration-150 relative group cursor-pointer select-none ${
            isSettingsPage
              ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-bold"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60 border border-transparent"
          }`}
        >
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <Settings
              className={`h-4 w-4 shrink-0 transition-transform duration-300 group-hover:rotate-45 ${
                isSettingsPage
                  ? "text-cyan-600 dark:text-cyan-400"
                  : "text-slate-500 dark:text-zinc-500"
              }`}
            />
          </div>

          <div
            className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 transition-all duration-200 ease-out overflow-hidden whitespace-nowrap ${
              isSidebarCollapsed
                ? "max-w-0 opacity-0 pointer-events-none translate-x-1"
                : "max-w-[180px] opacity-100 translate-x-0"
            }`}
          >
            <span className="truncate text-xs tracking-wide">
              Settings
            </span>
            <span className="text-[9px] font-mono text-slate-400 dark:text-zinc-500 ml-auto">
              v2.0
            </span>
          </div>

          {/* Floating Tooltip in Collapsed Mode */}
          {isSidebarCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0f1115] border border-zinc-700 text-zinc-100 text-[11px] font-mono rounded-sm shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[100]">
              Settings (v2.0)
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}
