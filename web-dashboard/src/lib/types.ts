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
  lat?: number; // GPS Latitude
  lng?: number; // GPS Longitude
  feederId?: string;
  dtrId?: string;
}

export interface HistoricalTelemetryPoint {
  timestamp: string;
  timeLabel: string;
  v1: number;
  v2: number;
  i1: number;
  i2: number;
  idiff: number;
  tripLimit: number;
  isFault: boolean;
  p1?: number; // Active Power Pole 1 (W)
  p2?: number; // Active Power Pole 2 (W)
  q1?: number; // Reactive Power Pole 1 (VAR)
  q2?: number; // Reactive Power Pole 2 (VAR)
  s1?: number; // Apparent Power Pole 1 (VA)
  s2?: number; // Apparent Power Pole 2 (VA)
  pf1?: number; // Power Factor Pole 1 (0.00 - 1.00)
  pf2?: number; // Power Factor Pole 2 (0.00 - 1.00)
  freq1?: number; // Frequency Pole 1 (Hz)
  freq2?: number; // Frequency Pole 2 (Hz)
  pLoss?: number; // Technical Line Loss (W) = |p1 - p2|
  vDrop?: number; // Voltage Drop (V) = |v1 - v2|
}

export interface FeederAsset {
  substationId: string;
  substationName: string;
  feederId: string;
  feederName: string;
  dtrId: string;
  dtrName: string;
  capacityKva: number;
  nominalVoltageV: number;
  totalPoles: number;
  activePoles: number;
}

export interface PermitToWork {
  ptwNumber: string;
  issuedTo: string;
  issuedAt: string;
  lineIsolated: boolean;
  earthingConfirmed: boolean;
  reclosingInterlockActive: boolean; // Prevents SCADA breaker close until cleared
  clearedAt?: string;
  linemanSignature?: string;
}

export interface TroubleTicket {
  ticketId: string;
  createdAt: string;
  feederId: string;
  feederName: string;
  affectedPole: string;
  gps: { lat: number; lng: number };
  faultType: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  status: "DISPATCHED" | "CREW_ON_SITE" | "PTW_ISSUED" | "REPAIRED" | "CLOSED";
  assignedCrew: string;
  assignedPhone: string;
  estimatedCustomers: number;
  ptw: PermitToWork | null;
  workLog: string[];
}

export interface GridTelemetry {
  timestamp: string; // ISO string
  gw_ms?: number;
  sec: "AES128" | "NONE";
  status: "OK" | "WARN" | "ALERT" | "TRIP" | "WAITING_DATA";
  fault: boolean; // boolean fault flag for prompt requirement
  fault_code: "NORMAL" | "DIFF_CURRENT_FAULT" | "OUTAGE_LAST_GASP" | "POLE_OFFLINE" | "THEFT_SUSPECTED" | string;
  idiff: number; // |I_A - I_B| (A)
  trip_limit: number; // 0.350 A (Indian distribution standard)
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
  history?: HistoricalTelemetryPoint[];
  tickets?: TroubleTicket[];
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
  ptwInterlockActive?: boolean; // When true, remote SCADA trip reset is safety locked
  mongoConnected?: boolean;
  dbName?: string;
}
