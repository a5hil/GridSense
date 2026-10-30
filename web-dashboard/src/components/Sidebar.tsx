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
      className={`h-screen flex flex-col justify-between border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] font-mono select-none overflow-hidden will-change-[width] transition-[width] duration-200 ease-in-out shrink-0 z-40 ${
        isSidebarCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* 1. TOP BRAND LOGO & COLLAPSE TOGGLE */}
      <div>
        <div
          className={`h-14 border-b border-slate-200 dark:border-zinc-800 flex items-center transition-colors ${
            isSidebarCollapsed ? "justify-center px-0" : "justify-between px-3.5"
          }`}
        >
          {!isSidebarCollapsed ? (
            <>
              <Link
                href="/"
                onClick={() => setActiveView("OPERATOR")}
                className="flex items-center gap-2.5 overflow-hidden"
              >
                <div className="h-8 w-8 rounded-sm bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-emerald-400 fill-emerald-400" />
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

              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-sm text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            /* Perfectly centered morphing toggle button in collapsed mode */
            <button
              onClick={toggleSidebar}
              className="h-9 w-9 rounded-sm bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400/70 hover:bg-emerald-500/20 flex items-center justify-center transition-all group cursor-pointer"
              title="Expand Sidebar"
            >
              <Zap className="h-4 w-4 text-emerald-400 fill-emerald-400 group-hover:hidden" />
              <ChevronRight className="h-4 w-4 text-emerald-400 hidden group-hover:block" />
            </button>
          )}
        </div>

        {/* 2. PRIMARY NAVIGATION (TOP) */}
        <div className={`py-3 space-y-1.5 ${isSidebarCollapsed ? "px-2" : "px-2.5"}`}>
          {!isSidebarCollapsed && (
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
              GRID SUPERVISION
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              !isSettingsPage &&
              (activeView === item.id ||
                (item.id === "COMMS" && activeView === "DIAGNOSTICS") ||
                (item.id === "SOE" && activeView === "LOGS"));

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`transition-all duration-150 relative group cursor-pointer ${
                  isSidebarCollapsed
                    ? "w-10 h-10 mx-auto flex items-center justify-center rounded-sm"
                    : "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-semibold tracking-wide font-sans"
                } ${
                  isActive
                    ? isSidebarCollapsed
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold border-l-2 border-emerald-500 dark:border-emerald-400 shadow-xs"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60"
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

                {/* Badges in Expanded Mode */}
                {!isSidebarCollapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs shrink-0 ${
                      item.badgeVariant === "destructive"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/40"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40"
                    }`}
                  >
                    {item.badgeCount}
                  </span>
                )}

                {/* Indicator Pip in Collapsed Mode */}
                {isSidebarCollapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0c0d10] ${
                      item.badgeVariant === "destructive"
                        ? "bg-rose-500"
                        : "bg-amber-500"
                    }`}
                  />
                )}

                {/* Floating Tooltip in Collapsed Mode */}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-white dark:bg-[#0f1115] border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-[11px] font-mono rounded-sm shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[100] flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="text-[10px] px-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded-xs">
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
      <div className={`p-2 border-t border-slate-200 dark:border-zinc-800 ${isSidebarCollapsed ? "px-2" : "px-2.5"}`}>
        <Link
          href="/settings"
          className={`transition-all relative group cursor-pointer ${
            isSidebarCollapsed
              ? "w-10 h-10 mx-auto flex items-center justify-center rounded-sm"
              : "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-semibold tracking-wide font-sans"
          } ${
            isSettingsPage
              ? isSidebarCollapsed
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                : "bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold border-l-2 border-emerald-500 dark:border-emerald-400 shadow-xs"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900/60"
          }`}
        >
          <Settings
            className={`h-4 w-4 shrink-0 transition-transform group-hover:rotate-45 ${
              isSettingsPage
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 dark:text-zinc-500"
            }`}
          />

          {!isSidebarCollapsed && (
            <>
              <span className="truncate flex-1 text-left">
                Settings
              </span>
              <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                v2.0
              </span>
            </>
          )}

          {/* Floating Tooltip in Collapsed Mode */}
          {isSidebarCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-white dark:bg-[#0f1115] border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-[11px] font-mono rounded-sm shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[100]">
              Settings (v2.0)
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}
