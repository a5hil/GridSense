import { NextRequest } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import "@/lib/serial-reader"; // Trigger serial reader discovery


export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send immediate initial state
      const initialPayload = JSON.stringify({
        type: "INITIAL",
        telemetry: telemetryStore.getTelemetry(),
        status: telemetryStore.getStatus(),
        logs: telemetryStore.getLogs().slice(0, 20),
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
          // stream closed
        }
      };

      // 3. Listener for new event logs
      const logListener = (log: any) => {
        try {
          const payload = JSON.stringify({
            type: "LOG",
            log,
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          // stream closed
        }
      };

      telemetryStore.on("update", updateListener);
      telemetryStore.on("log", logListener);

      // Heartbeat ping every 10 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(pingInterval);
        }
      }, 10000);

      // Clean up on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        telemetryStore.off("update", updateListener);
        telemetryStore.off("log", logListener);
      });
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
