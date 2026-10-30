import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";
import { sendTelegramTestPing } from "@/lib/telegram";
import { telemetryStore } from "@/lib/telemetry-state";
import { updateFdirLimits } from "@/lib/network/fdir";
import { networkTwin } from "@/lib/network/twin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const settings = omsManager.getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "test_telegram") {
      const botToken = body.botToken || omsManager.getSettings().telegramBotToken || "";
      const chatId = body.chatId || omsManager.getSettings().telegramChatId || "";
      const pingRes = await sendTelegramTestPing({ botToken, chatId });
      return NextResponse.json(pingRes);
    }

    const updated = omsManager.updateSettings(body);

    // Apply live protection & FDIR parameters to backend engines
    updateFdirLimits({
      ...(typeof updated.differentialPickupA === "number" ? { diffMinA: updated.differentialPickupA } : {}),
      ...(typeof updated.brokenNeutralSpreadV === "number" ? { brokenNeutralSpreadV: updated.brokenNeutralSpreadV } : {}),
      ...(typeof updated.undervoltageV === "number" ? { undervoltageV: updated.undervoltageV } : {}),
      ...(typeof updated.overvoltageV === "number" ? { overvoltageV: updated.overvoltageV } : {}),
      ...(typeof updated.overcurrentA === "number" ? { overcurrentA: updated.overcurrentA } : {}),
    });

    telemetryStore.updateProtectionConfig({
      pickupA: updated.differentialPickupA,
      tripDelayMs: updated.tripDelayMs,
    });

    if (typeof updated.refreshRateMs === "number") {
      networkTwin.setTickIntervalMs(updated.refreshRateMs);
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
