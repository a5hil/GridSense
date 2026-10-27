import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";
import { sendTelegramTestPing } from "@/lib/telegram";

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
    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
