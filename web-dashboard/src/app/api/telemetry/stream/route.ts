import { NextRequest } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import { networkTwin } from "@/lib/network/twin";
import "@/lib/serial-reader"; // Trigger serial reader discovery

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send immediate initial state
      const initialPayload = JSON.stringify({
        type: "INITIAL",
        telemetry: telemetryStore.getTelemetry(),
        status: telemetryStore.getStatus(),
        logs: telemetryStore.getLogs().slice(0, 20),
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

      // Heartbeat ping every 10 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          cleanup?.();
        }
      }, 10000);

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
