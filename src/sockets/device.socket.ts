import { Server, Socket } from "socket.io";
import { HistoryService } from "../services/history.service";

const historyService = new HistoryService();

interface SocketAck {
  ok: boolean;
  message?: string;
  data?: unknown;
}

async function handleIncomingDeviceData(
  io: Server,
  payload: unknown,
  ack?: (response: SocketAck) => void
): Promise<void> {
  try {
    const savedPayload = await historyService.saveIncomingDeviceData(payload);
    io.emit("device:data", savedPayload);

    if (typeof ack === "function") {
      ack({ ok: true, data: savedPayload });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process socket payload";
    const errorObject = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
      sqlMessage?: string;
    };

    console.error("Failed to persist incoming device packet", {
      message,
      code: errorObject?.code,
      errno: errorObject?.errno,
      sqlState: errorObject?.sqlState,
      sqlMessage: errorObject?.sqlMessage
    });

    try {
      const livePayload = await historyService.buildBroadcastPayload(payload);
      io.emit("device:data", livePayload);
    } catch (fallbackError) {
      console.error("Failed to build fallback live payload", fallbackError);
    }

    io.emit("device:error", { message });

    if (typeof ack === "function") {
      ack({ ok: false, message });
    }
  }
}

export function registerDeviceSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("disconnect", (reason: string) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });

    socket.on("client:heartbeat", (payload: unknown, ack?: (response: unknown) => void) => {
      const response = {
        ok: true,
        serverTime: new Date().toISOString(),
        clientPayload: payload ?? null
      };

      socket.emit("server:heartbeat", response);

      if (typeof ack === "function") {
        ack(response);
      }
    });

    // const handleSendData = async (payload: unknown, ack?: (response: SocketAck) => void): Promise<void> => {
    //     // console.log("data from device ",(payload as any).data);
    //        console.log("data from device ",(payload as any).data.deviceId);
    //           console.log("data from device ",(payload as any).data.start_time);
    //              console.log("data from device ",(payload as any).data.end_time);
        
    //         //   console.log("data from device ",payload);
    //   await handleIncomingDeviceData(io, payload, ack);
    // };

const handleSendData = async (payload: unknown, ack?: (response: SocketAck) => void): Promise<void> => {
    if (payload === undefined || payload === null) {
      if (typeof ack === "function") {
        ack({ ok: false, message: "payload is empty" });
      }
      return;
    }

    let data: unknown = payload;
    try {
      data = typeof payload === "string" ? JSON.parse(payload) : payload;
    } catch (_error) {
      if (typeof ack === "function") {
        ack({ ok: false, message: "payload string is not valid JSON" });
      }
      return;
    }

    const raw = data as Record<string, unknown>;
    const maybeMatrix = Array.isArray(raw.data) ? raw.data : null;
    console.log("Incoming device packet", {
      deviceId: raw.deviceId,
      start_time: raw.start_time,
      end_time: raw.end_time,
      rows: maybeMatrix ? maybeMatrix.length : undefined,
      cols: maybeMatrix && Array.isArray(maybeMatrix[0]) ? maybeMatrix[0].length : undefined,
      freq: raw.frequencies,
      intensityType: raw.intensityType
    });

    await handleIncomingDeviceData(io, data, ack);
};

    socket.on("send_data", handleSendData);
  });
}
