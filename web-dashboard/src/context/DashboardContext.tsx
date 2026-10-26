"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ScadaUser } from "@/lib/auth";
import { NetworkSnapshot } from "@/lib/network/types";
import { SystemStatus } from "@/lib/types";

export type ActiveView =
  | "OPERATOR"
  | "GIS"
  | "NETWORK"
  | "WAVEFORMS"
  | "OMS"
  | "COMMS"
  | "SOE"
  | "DIAGNOSTICS"
  | "LOGS";

interface DashboardContextType {
  // Sidebar state
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;

  // Navigation view
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  // System & Telemetry health states
  isFault: boolean;
  setIsFault: (isFault: boolean) => void;
  activeFaultAnsi: string | null;
  setActiveFaultAnsi: (ansi: string | null) => void;
  activeFaultTitle: string | null;
  setActiveFaultTitle: (title: string | null) => void;

  // Comms & Hardware States
  connectedSSE: boolean;
  setConnectedSSE: (connected: boolean) => void;
  isAudioMuted: boolean;
  setIsAudioMuted: React.Dispatch<React.SetStateAction<boolean>>;
  toggleAudioMuted: () => void;
  lastHeartbeat: string;
  setLastHeartbeat: (time: string) => void;

  // Operator Profile
  currentUser: ScadaUser | null;
  setCurrentUser: (user: ScadaUser | null) => void;
  handleLogout: () => void;

  // Macro metrics & Badges
  networkSnapshot: NetworkSnapshot | null;
  setNetworkSnapshot: (snap: NetworkSnapshot | null) => void;
  openTicketsCount: number;
  setOpenTicketsCount: (count: number) => void;
  systemStatus: SystemStatus | null;
  setSystemStatus: (status: SystemStatus | null) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<ActiveView>("OPERATOR");
  const [isFault, setIsFault] = useState<boolean>(false);
  const [activeFaultAnsi, setActiveFaultAnsi] = useState<string | null>(null);
  const [activeFaultTitle, setActiveFaultTitle] = useState<string | null>(null);
  const [connectedSSE, setConnectedSSE] = useState<boolean>(true);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("--:--:--");
  const [currentUser, setCurrentUser] = useState<ScadaUser | null>(null);
  const [networkSnapshot, setNetworkSnapshot] = useState<NetworkSnapshot | null>(null);
  const [openTicketsCount, setOpenTicketsCount] = useState<number>(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Load user profile on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);
  const toggleAudioMuted = () => setIsAudioMuted((prev) => !prev);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  return (
    <DashboardContext.Provider
      value={{
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        toggleSidebar,
        activeView,
        setActiveView,
        isFault,
        setIsFault,
        activeFaultAnsi,
        setActiveFaultAnsi,
        activeFaultTitle,
        setActiveFaultTitle,
        connectedSSE,
        setConnectedSSE,
        isAudioMuted,
        setIsAudioMuted,
        toggleAudioMuted,
        lastHeartbeat,
        setLastHeartbeat,
        currentUser,
        setCurrentUser,
        handleLogout,
        networkSnapshot,
        setNetworkSnapshot,
        openTicketsCount,
        setOpenTicketsCount,
        systemStatus,
        setSystemStatus,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
