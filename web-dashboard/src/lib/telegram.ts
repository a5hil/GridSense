import { TroubleTicket } from "./types";

export interface TelegramDispatchResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Sends an emergency lineman dispatch order directly to a Telegram User or Group.
 * Zero external browser tabs or operator logins required.
 */
export async function sendTelegramDispatchAlert(params: {
  botToken: string;
  chatId: string;
  ticket: TroubleTicket;
  crewName?: string;
  crewType?: string;
  operatorNotes?: string;
}): Promise<TelegramDispatchResult> {
  const token = params.botToken?.trim();
  const chatId = params.chatId?.trim();

  if (!token || !chatId) {
    return {
      success: false,
      error: "Telegram Bot Token or Chat ID is not configured. Please set them in GridSense Settings.",
    };
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${params.ticket.gps.lat.toFixed(6)},${params.ticket.gps.lng.toFixed(6)}`;
  const now = new Date().toLocaleTimeString();

  const messageText = `🚨 *KSEB EMERGENCY OUTAGE DISPATCH* 🚨
━━━━━━━━━━━━━━━━━━━━━━
⚡ *Ticket ID:* \`#${params.ticket.ticketId}\`
📍 *Feeder:* ${params.ticket.feederName}
⚠️ *Fault Code:* *${params.ticket.faultType}*
🎯 *Affected Location:* *${params.ticket.affectedPole}*
🧭 *GPS Waypoint:* \`${params.ticket.gps.lat.toFixed(6)}, ${params.ticket.gps.lng.toFixed(6)}\`
🗺️ *Navigation:* [Open GPS Navigation in Google Maps](${mapsUrl})
👷 *Designated Field Unit:* ${params.crewName || "Primary Line Patrol"} (${params.crewType || "Overhead Line Crew"})
⏰ *Dispatched At:* ${now}
${params.operatorNotes ? `📝 *Operator Instructions:* _"${params.operatorNotes}"_\n` : ""}━━━━━━━━━━━━━━━━━━━━━━
🛡️ *CEA Regulation 44 Safety Protocol:*
1. Verify physical line de-energization and discharge grounding prior to crossarm ascent.
2. Confirm digital PTW lockout status with SCADA Control Center.`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      return { success: true, messageId: data.result?.message_id };
    } else {
      return {
        success: false,
        error: data.description || "Telegram API rejected the dispatch message",
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Network timeout connecting to Telegram Bot API",
    };
  }
}

/**
 * Sends a test verification ping to confirm bot token and chat ID connectivity.
 */
export async function sendTelegramTestPing(params: {
  botToken: string;
  chatId: string;
}): Promise<TelegramDispatchResult> {
  const token = params.botToken?.trim();
  const chatId = params.chatId?.trim();

  if (!token || !chatId) {
    return {
      success: false,
      error: "Both Telegram Bot Token and Chat ID are required for verification.",
    };
  }

  const timeStr = new Date().toLocaleTimeString();
  const text = `⚡ *GridSense ADMS 2.0 — Telegram Bot Verified* ⚡
━━━━━━━━━━━━━━━━━━━━━━
✓ Connection test successful!
📡 *Substation:* Angamaly 33/11kV Substation
🛰️ *Feeder Supervised:* Feeder 04 (Angamaly North)
🕒 *Timestamp:* ${timeStr}

Field crews in this chat will now automatically receive high-priority outage dispatch alerts with GPS navigation coordinates.`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    const data = await res.json();
    if (data.ok) {
      return { success: true, messageId: data.result?.message_id };
    } else {
      return {
        success: false,
        error: data.description || "Telegram API rejected test message",
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to contact Telegram API",
    };
  }
}
