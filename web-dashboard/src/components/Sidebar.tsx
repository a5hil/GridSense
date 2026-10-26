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
      className={`h-screen flex flex-col justify-between border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] font-mono select-none transition-all duration-300 ease-in-out shrink-0 z-40 ${
        isSidebarCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* 1. TOP BRAND LOGO & COLLAPSE TOGGLE */}
      <div>
        <div className="h-14 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between px-3.5">
          {!isSidebarCollapsed && (
            <Link
              href="/"
              onClick={() => setActiveView("OPERATOR")}
              className="flex items-center gap-2.5 overflow-hidden"
            >
              <div className="h-8 w-8 rounded-sm bg-slate-900 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-emerald-500 fill-emerald-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black tracking-wider text-slate-900 dark:text-zinc-100 truncate">
                  GRIDSENSE
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest truncate">
                  ADMS 2.0
                </span>
              </div>
            </Link>
          )}

          {isSidebarCollapsed && (
            <Link
              href="/"
              onClick={() => setActiveView("OPERATOR")}
              className="mx-auto h-8 w-8 rounded-sm bg-slate-900 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 flex items-center justify-center shrink-0"
              title="GridSense ADMS"
            >
              <Zap className="h-4 w-4 text-emerald-500 fill-emerald-500" />
            </Link>
          )}

          <button
            onClick={toggleSidebar}
            className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
            title={isSidebarCollapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* 2. PRIMARY NAVIGATION (TOP) */}
        <div className="py-3 px-2 space-y-1">
          <div
            className={`px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 ${
              isSidebarCollapsed ? "text-center" : ""
            }`}
          >
            {isSidebarCollapsed ? "NAV" : "GRID SUPERVISION"}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = !isSettingsPage && activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-sm text-xs font-semibold tracking-wide transition-all duration-150 relative group ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-600/50 shadow-xs"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60 border border-transparent"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300"
                  }`}
                />

                {!isSidebarCollapsed && (
                  <span className="truncate flex-1 text-left">
                    {item.label}
                  </span>
                )}

                {/* Badges */}
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-xs font-mono shrink-0 ${
                      item.badgeVariant === "destructive"
                        ? "bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse"
                        : "bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/40"
                    } ${isSidebarCollapsed ? "absolute top-1 right-1 h-2 w-2 p-0 rounded-full" : ""}`}
                  >
                    {!isSidebarCollapsed && item.badgeCount}
                  </span>
                )}

                {/* Tooltip on collapsed hover */}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 dark:bg-zinc-950 border border-slate-700 dark:border-zinc-700 text-white text-[11px] font-mono rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SECONDARY NAVIGATION (BOTTOM): SETTINGS */}
      <div className="p-2 border-t border-slate-200 dark:border-zinc-800 space-y-1">
        <Link
          href="/settings"
          title={isSidebarCollapsed ? "System Settings" : undefined}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-sm text-xs font-semibold tracking-wide transition-all relative group ${
            isSettingsPage
              ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-600/50 shadow-xs"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60 border border-transparent"
          }`}
        >
          <Settings
            className={`h-4 w-4 shrink-0 transition-transform group-hover:rotate-45 ${
              isSettingsPage
                ? "text-cyan-600 dark:text-cyan-400"
                : "text-slate-500 dark:text-zinc-500"
            }`}
          />

          {!isSidebarCollapsed && (
            <span className="truncate flex-1 text-left">
              Settings &amp; Parameters
            </span>
          )}

          {isSidebarCollapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 dark:bg-zinc-950 border border-slate-700 dark:border-zinc-700 text-white text-[11px] font-mono rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              Settings &amp; Parameters
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}
