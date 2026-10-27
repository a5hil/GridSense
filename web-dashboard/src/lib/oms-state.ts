import { PermitToWork, TroubleTicket, OmsSettings } from "./types";
import { getStoredTickets, saveTicketRecord } from "./db";
import { sendTelegramDispatchAlert } from "./telegram";

class OmsManager {
  private tickets: TroubleTicket[] = [];
  private ticketCounter = 42;
  private ptwCounter = 901;
  private initialized = false;

  private settings: OmsSettings = {
    soakDurationMinutes: 15,
    safetyOverrideEnabled: true,
    linemanPhone: "+919037129026",
    notifyOnEscalation: true,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    telegramEnabled: true,
  };

  constructor() {
    this.tickets = [];
    this.initFromDb().catch(() => {});
  }

  public async initFromDb(): Promise<void> {
    if (this.initialized) return;
    try {
      const stored = await getStoredTickets();
      if (stored && stored.length > 0) {
        this.tickets = stored;
        stored.forEach((t) => {
          const num = parseInt(t.ticketId.replace(/\D/g, ""), 10);
          if (!isNaN(num) && num > this.ticketCounter) {
            this.ticketCounter = num;
          }
        });
      }
      this.initialized = true;
    } catch {
      // Memory fallback
    }
  }

  public getSettings(): OmsSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<OmsSettings>): OmsSettings {
    this.settings = { ...this.settings, ...updates };
    return { ...this.settings };
  }

  public getTickets(): TroubleTicket[] {
    this.checkSoakExpirations();
    return this.tickets;
  }

  public getActiveTicket(): TroubleTicket | null {
    this.checkSoakExpirations();
    return (
      this.tickets.find(
        (t) =>
          t.status !== "CLOSED" &&
          t.status !== "MAINTENANCE_SUPPRESSED" &&
          t.status !== "REPAIRED"
      ) || null
    );
  }

  /**
   * Check and escalate any WATCHING tickets whose soak duration has elapsed.
   */
  public checkSoakExpirations(): void {
    const now = Date.now();
    for (const t of this.tickets) {
      if (t.status === "WATCHING" && t.soakExpiresAt) {
        const expires = new Date(t.soakExpiresAt).getTime();
        if (now >= expires) {
          t.status = "ESCALATED";
          const time = new Date().toLocaleTimeString();
          t.workLog.push(
            `${time} - Outage persisted beyond ${t.soakDurationMinutes || 15}m soak observation. Escalated to SCADA Operator for field dispatch.`
          );
          saveTicketRecord(t).catch(() => {});
        }
      }
    }
  }

  /**
   * Registers a new incident for observation (Soak Watchlist).
   * If safetyOverride is active and fault is a severe physical hazard (e.g. broken conductor ANSI 46BC),
   * it escalates immediately for public safety.
   */
  public registerIncidentForObservation(params: {
    faultCode: string;
    affectedPole: string;
    gps: { lat: number; lng: number };
    idiff: number;
    severity?: "CRITICAL" | "HIGH" | "MEDIUM";
    feederId?: string;
    feederName?: string;
    estimatedCustomers?: number;
    source?: "LIVE" | "TRAINING";
  }): TroubleTicket {
    this.checkSoakExpirations();

    // Check if open ticket already exists for this feeder section
    const existing = this.getActiveTicket();
    if (existing) return existing;

    this.ticketCounter++;
    const ticketId = `TT-2026-10-00${this.ticketCounter}`;
    const timestamp = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString();

    // Check if fault is severe physical hazard (broken conductor / high current physical contact)
    const faultUpper = params.faultCode.toUpperCase();
    const isPhysicalHazard =
      (faultUpper.includes("46BC") ||
        faultUpper.includes("BROKEN") ||
        faultUpper.includes("PHYSICAL") ||
        (faultUpper.includes("87L") && params.idiff >= 0.35)) &&
      !faultUpper.includes("POWERCUT") &&
      !faultUpper.includes("ANSI 27");

    const bypassSoak = this.settings.safetyOverrideEnabled && isPhysicalHazard;

    let initialStatus: TroubleTicket["status"] = "WATCHING";
    let soakExpiresAt: string | undefined = undefined;
    const workLog: string[] = [];

    if (bypassSoak) {
      initialStatus = "ESCALATED";
      workLog.push(
        `${timeStr} - SAFETY CRITICAL OVERRIDE: Physical line hazard (${params.faultCode}). Soak observation bypassed for public safety.`
      );
      workLog.push(
        `${timeStr} - Incident escalated directly to SCADA Operator for immediate field crew dispatch.`
      );
    } else {
      initialStatus = "WATCHING";
      const soakMins = this.settings.soakDurationMinutes || 15;
      soakExpiresAt = new Date(Date.now() + soakMins * 60000).toISOString();
      workLog.push(
        `${timeStr} - Incident detected (${params.faultCode}). Placed in Soak Watchlist for ${soakMins}m observation [${params.source || "LIVE"}].`
      );
      workLog.push(
        `${timeStr} - Lineman dispatch withheld. Monitoring for automatic restoration or temporary switching.`
      );
    }

    const newTicket: TroubleTicket = {
      ticketId,
      createdAt: timestamp,
      feederId: params.feederId || "FEEDER_04_SECTOR4",
      feederName: params.feederName || "Feeder 04 (Sector 4 Primary)",
      affectedPole: params.affectedPole,
      gps: params.gps,
      faultType: params.faultCode,
      severity: params.severity || "CRITICAL",
      status: initialStatus,
      assignedCrew: "",
      assignedPhone: this.settings.linemanPhone || "+919447012345",
      estimatedCustomers: params.estimatedCustomers ?? 28,
      ptw: null,
      source: params.source,
      soakExpiresAt,
      soakDurationMinutes: this.settings.soakDurationMinutes,
      safetyBypassTriggered: bypassSoak,
      workLog,
    };

    this.tickets.unshift(newTicket);
    saveTicketRecord(newTicket).catch(() => {});

    return newTicket;
  }

  /**
   * Backward-compatible alias for registerIncidentForObservation.
   */
  public autoCreateTicketForFault(params: {
    faultCode: string;
    affectedPole: string;
    gps: { lat: number; lng: number };
    idiff: number;
    severity?: "CRITICAL" | "HIGH" | "MEDIUM";
    feederId?: string;
    feederName?: string;
    estimatedCustomers?: number;
    source?: "LIVE" | "TRAINING";
  }): TroubleTicket {
    return this.registerIncidentForObservation(params);
  }

  /**
   * If a watched incident restores power before soak timer expires,
   * auto-clear it as a momentary transient outage (no lineman dispatch).
   * Refuses to clear if power has NOT restored (e.g. still 0V powercut).
   */
  public autoClearTransientIfRestored(feederId?: string, isPowerRestored: boolean = true): TroubleTicket | null {
    if (!isPowerRestored) return null;

    const active = this.getActiveTicket();
    if (active && active.status === "WATCHING") {
      const now = new Date();
      const elapsedMs = now.getTime() - new Date(active.createdAt).getTime();
      const elapsedMins = Math.max(1, Math.round(elapsedMs / 60000));

      active.status = "CLOSED";
      active.assignedCrew = ""; // explicitly empty to reflect zero crew dispatched
      active.workLog.push(
        `${now.toLocaleTimeString()} - Power restored naturally after ~${elapsedMins}m. Auto-cleared as transient outage; zero lineman dispatched.`
      );
      saveTicketRecord(active).catch(() => {});
      return active;
    }
    return null;
  }

  /**
   * Operator manually dispatches a specific field crew.
   */
  public manualDispatchCrew(
    ticketId: string,
    params: {
      crewName: string;
      crewPhone: string;
      crewType: string;
      operatorNotes?: string;
    }
  ): TroubleTicket | null {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return null;

    ticket.status = "DISPATCHED";
    ticket.assignedCrew = params.crewName;
    ticket.assignedPhone = params.crewPhone;
    ticket.assignedCrewType = params.crewType;
    ticket.operatorNotes = params.operatorNotes;

    const time = new Date().toLocaleTimeString();
    ticket.workLog.push(
      `${time} - Manual field dispatch authorized by SCADA Operator: ${params.crewName} (${params.crewType}).`
    );
    if (params.operatorNotes) {
      ticket.workLog.push(`${time} - Directive: "${params.operatorNotes}"`);
    }

    // Automated silent background alert via Telegram Bot API
    if (this.settings.telegramBotToken && this.settings.telegramChatId && this.settings.telegramEnabled !== false) {
      sendTelegramDispatchAlert({
        botToken: this.settings.telegramBotToken,
        chatId: this.settings.telegramChatId,
        ticket,
        crewName: params.crewName,
        crewType: params.crewType,
        operatorNotes: params.operatorNotes,
      }).then((res) => {
        const timeNow = new Date().toLocaleTimeString();
        if (res.success) {
          ticket.workLog.push(`${timeNow} - Telegram Bot Alert delivered to field crew (Message ID: #${res.messageId}).`);
        } else {
          ticket.workLog.push(`${timeNow} - Telegram dispatch notice: ${res.error}`);
        }
        saveTicketRecord(ticket).catch(() => {});
      }).catch(() => {});
    }

    saveTicketRecord(ticket).catch(() => {});
    return ticket;
  }

  /**
   * Operator flags incident as scheduled local maintenance (e.g. tree trimming, transformer oiling).
   */
  public flagAsScheduledMaintenance(
    ticketId: string,
    reason?: string
  ): TroubleTicket | null {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return null;

    ticket.status = "MAINTENANCE_SUPPRESSED";
    const time = new Date().toLocaleTimeString();
    ticket.workLog.push(
      `${time} - Operator flagged incident as scheduled local maintenance: ${reason || "Planned Line Maintenance"}. Alarms suppressed; emergency dispatch cancelled.`
    );

    saveTicketRecord(ticket).catch(() => {});
    return ticket;
  }

  /**
   * Operator bypasses remaining soak time on demand and escalates immediately.
   */
  public escalateEarly(ticketId: string): TroubleTicket | null {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return null;

    ticket.status = "ESCALATED";
    const time = new Date().toLocaleTimeString();
    ticket.workLog.push(
      `${time} - SCADA Operator manually bypassed remaining soak duration. Escalated for crew dispatch.`
    );

    saveTicketRecord(ticket).catch(() => {});
    return ticket;
  }

  public updateTicketStatus(
    ticketId: string,
    status: TroubleTicket["status"],
    logMessage?: string
  ): TroubleTicket | null {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return null;

    ticket.status = status;
    const time = new Date().toLocaleTimeString();

    if (logMessage) {
      ticket.workLog.push(`${time} - ${logMessage}`);
    } else {
      ticket.workLog.push(`${time} - Status updated to ${status}`);
    }

    saveTicketRecord(ticket).catch(() => {});
    return ticket;
  }

  public issuePtw(ticketId: string, linemanName: string): PermitToWork | null {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return null;

    this.ptwCounter++;
    const ptwNumber = `PTW-2026-${this.ptwCounter}`;
    const ptw: PermitToWork = {
      ptwNumber,
      issuedTo: linemanName,
      issuedAt: new Date().toISOString(),
      lineIsolated: true,
      earthingConfirmed: true,
      reclosingInterlockActive: true, // HARD SAFETY INTERLOCK
      linemanSignature: `${linemanName} (DigiCert Verified)`,
    };

    ticket.ptw = ptw;
    ticket.status = "PTW_ISSUED";
    ticket.workLog.push(
      `${new Date().toLocaleTimeString()} - Digital PTW ${ptwNumber} ISSUED. SCADA Recloser Interlocked!`
    );

    saveTicketRecord(ticket).catch(() => {});
    return ptw;
  }

  public clearPtw(ticketId: string, notes: string): boolean {
    const ticket = this.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return false;

    if (ticket.ptw) {
      ticket.ptw.reclosingInterlockActive = false;
      ticket.ptw.clearedAt = new Date().toISOString();
    }
    ticket.status = "CLOSED";
    ticket.workLog.push(
      `${new Date().toLocaleTimeString()} - PTW Cleared. Repairs: "${notes}". Safety interlock removed. Ticket CLOSED.`
    );

    saveTicketRecord(ticket).catch(() => {});
    return true;
  }
}

const globalForOms = globalThis as unknown as { omsManager?: OmsManager };

function initManager(): OmsManager {
  if (globalForOms.omsManager) {
    Object.setPrototypeOf(globalForOms.omsManager, OmsManager.prototype);
    const existing = globalForOms.omsManager as any;
    if (!existing.settings) {
      existing.settings = {
        soakDurationMinutes: 15,
        safetyOverrideEnabled: true,
        linemanPhone: "+919037129026",
        notifyOnEscalation: true,
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
        telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
        telegramEnabled: true,
      };
    } else {
      if (existing.settings.linemanPhone === "+919447012345") {
        existing.settings.linemanPhone = "+919037129026";
      }
      if (existing.settings.telegramEnabled === undefined) {
        existing.settings.telegramEnabled = true;
      }
      if (existing.settings.telegramBotToken === undefined) {
        existing.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
      }
      if (existing.settings.telegramChatId === undefined) {
        existing.settings.telegramChatId = process.env.TELEGRAM_CHAT_ID || "";
      }
    }
    return globalForOms.omsManager;
  }
  const manager = new OmsManager();
  if (process.env.NODE_ENV !== "production") {
    globalForOms.omsManager = manager;
  }
  return manager;
}

export const omsManager = initManager();
