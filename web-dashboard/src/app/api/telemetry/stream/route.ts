import { NextRequest } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import { omsManager } from "@/lib/oms-state";
import { networkTwin } from "@/lib/network/twin";
import "@/lib/serial-reader"; // Trigger serial reader discovery

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send immediate initial state (including tickets, history, and OMS settings in a single frame)
      const { history: _h, tickets: _t, ...cleanInitialTelemetry } = telemetryStore.getTelemetry() as any;
      const initialPayload = JSON.stringify({
        type: "INITIAL",
        telemetry: cleanInitialTelemetry,
        status: telemetryStore.getStatus(),
        logs: telemetryStore.getLogs().slice(0, 20),
        history: telemetryStore.getHistory(),
        tickets: omsManager.getTickets(),
        omsSettings: omsManager.getSettings(),
        networkSnapshot: networkTwin.getSnapshot(),
      });
      controller.enqueue(encoder.encode(`data: ${initialPayload}\n\n`));

      // 2. Listener for telemetry updates
      const updateListener = (data: any) => {
        try {
          const payload = JSON.stringify({
            type: "UPDATE",
            ...data,
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          cleanup?.();
        }
      };

      // 3. Listener for digital twin updates
      const snapshotListener = (snapshot: any) => {
        try {
          const payload = JSON.stringify({
            type: "NETWORK_SNAPSHOT",
            networkSnapshot: snapshot,
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          cleanup?.();
        }
      };

      // 4. Listener for new event logs
      const logListener = (log: any) => {
        try {
          const payload = JSON.stringify({
            type: "LOG",
            log,
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          cleanup?.();
        }
      };

      telemetryStore.on("update", updateListener);
      telemetryStore.on("log", logListener);
      networkTwin.on("snapshot", snapshotListener);

      // Heartbeat ping every 3 seconds so the client SSE 5s watchdog receives active data frames
      const pingInterval = setInterval(() => {
        try {
          const heartbeat = JSON.stringify({
            type: "HEARTBEAT",
            timestamp: Date.now(),
          });
          controller.enqueue(encoder.encode(`data: ${heartbeat}\n\n`));
        } catch (e) {
          cleanup?.();
        }
      }, 3000);

      let isClosed = false;
      cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(pingInterval);
        telemetryStore.off("update", updateListener);
        telemetryStore.off("log", logListener);
        networkTwin.off("snapshot", snapshotListener);
      };

      // Clean up on request abort or stream close
      req.signal.addEventListener("abort", () => cleanup?.(), { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
