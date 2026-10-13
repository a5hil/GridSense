export interface PoleData {
  id: string; // "Pole-A" / "Pole 1" or "Pole-B" / "Pole 2"
  label: string;
  role: "Incomer" | "Outgoing" | "Branch";
  v: number; // Voltage (V)
  i: number; // Current (A)
  p?: number; // Active Power (W)
  pf?: number; // Power Factor (0.00 - 1.00)
  freq?: number; // Frequency (Hz)
  energy?: number; // Cumulative Energy (kWh)
  rssi?: number; // LoRa RSSI (dBm)
  snr?: number; // LoRa SNR (dB)
  relay?: number; // Relaying Pole ID
  hops?: number; // Mesh Hops (0 = direct)
  age_ms?: number; // Telemetry age
  lastSeen?: string;
  isOnline: boolean;
}

export interface GridTelemetry {
  timestamp: string; // ISO string
  gw_ms?: number;
  sec: "AES128" | "NONE";
  status: "OK" | "WARN" | "ALERT" | "TRIP";
  fault: boolean; // boolean fault flag for prompt requirement
  fault_code: "NORMAL" | "DIFF_CURRENT_FAULT" | "OUTAGE_LAST_GASP" | "POLE_OFFLINE" | "THEFT_SUSPECTED";
  idiff: number; // |I_A - I_B| (A)
  trip_limit: number; // 0.350 A or 0.500 A
  nodes: PoleData[]; // Nodes array as required by prompt
  p1: PoleData;
  p2: PoleData;
  rawPayload?: any;
  lastGasp?: {
    pole: number;
    relay: number;
    hops: number;
    v_prev: number;
    i_prev: number;
    rssi: number;
    action: string;
  } | null;
}

export interface SCADAEventLog {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  source: string;
  message: string;
  details?: string;
}

export interface SystemStatus {
  gatewayConnected: boolean;
  activePort: string;
  baudRate: number;
  isSimulated: boolean;
  operatorAck: boolean;
  activeAlarm: {
    active: boolean;
    title: string;
    description: string;
    timestamp: string;
    faultCode: string;
  } | null;
}
