import { Server, Socket } from "socket.io";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { DeviceService } from "../services/device.service";
import { HistoryService } from "../services/history.service";
import { TelemetryRecordInput, TelemetryService } from "../services/telemetry.service";
import { HttpError } from "../utils/http-error";
import { verifyJwt } from "../utils/jwt";
import { CheckAiStatusRequestPayload } from "../utils/types";

const historyService = new HistoryService();
const deviceService = new DeviceService();
const telemetryService = new TelemetryService();
const userRepo = AppDataSource.getRepository(User);

interface SocketAck {
  ok: boolean;
  message?: string;
  data?: unknown;
}

interface TelemetryStatusEntry {
  deviceIdentifier: number | string;
  telemetry: TelemetryRecordInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildTelemetryStatusEntry(raw: Record<string, unknown>, fallbackIdentifier?: string): TelemetryStatusEntry | null {
  const deviceIdentifierRaw =
    raw.device_id ?? raw.deviceId ?? raw.id ?? raw.name ?? raw.deviceName ?? raw.key ?? fallbackIdentifier;

  let deviceIdentifier: number | string | null = null;
  if (typeof deviceIdentifierRaw === "number" && Number.isFinite(deviceIdentifierRaw)) {
    deviceIdentifier = deviceIdentifierRaw;
  } else if (typeof deviceIdentifierRaw === "string" && deviceIdentifierRaw.trim()) {
    deviceIdentifier = deviceIdentifierRaw.trim();
  }

  if (deviceIdentifier === null) {
    return null;
  }

  return {
    deviceIdentifier,
    telemetry: {
      recordedAt: toOptionalString(raw.recordedAt ?? raw.timestamp),
      date: toOptionalString(raw.date),
      time: toOptionalString(raw.time),
      battery: toOptionalFiniteNumber(raw.battery),
      temperature: toOptionalFiniteNumber(raw.temperature),
      uptime: toOptionalString(raw.uptime),
      internet: toOptionalString(raw.internet),
      ping: toOptionalFiniteNumber(raw.ping),
      interfaceName: toOptionalString(raw.interfaceName ?? raw.interface)
    }
  };
}

function extractTelemetryStatusEntries(payload: unknown): TelemetryStatusEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (isRecord(payload) && Array.isArray(payload.devices)) {
    return payload.devices
      .map((item) => (isRecord(item) ? buildTelemetryStatusEntry(item) : null))
      .filter((item): item is TelemetryStatusEntry => !!item);
  }

  if (Array.isArray(payload)) {
    return payload
      .map((item) => (isRecord(item) ? buildTelemetryStatusEntry(item) : null))
      .filter((item): item is TelemetryStatusEntry => !!item);
  }

  if (isRecord(payload)) {
    const singleEntry = buildTelemetryStatusEntry(payload);
    if (singleEntry && ("device_id" in payload || "deviceId" in payload)) {
      return [singleEntry];
    }

    return Object.keys(payload)
      .map((key) => {
        const item = payload[key];
        return isRecord(item) ? buildTelemetryStatusEntry(item, key) : null;
      })
      .filter((item): item is TelemetryStatusEntry => !!item);
  }

  return [];
}

function extractAiStatusRange(payload: unknown): { startTime: string; endTime: string } {
  if (typeof payload !== "object" || payload === null) {
    throw new HttpError(400, "payload must be an object");
  }

  const raw = payload as CheckAiStatusRequestPayload;
  const startTime = String(raw.startTime ?? raw.start_time ?? raw.from ?? "").trim();
  const endTime = String(raw.endTime ?? raw.end_time ?? raw.to ?? "").trim();

  if (!startTime || !endTime) {
    throw new HttpError(400, "payload must include startTime and endTime");
  }

  return { startTime, endTime };
}

async function handleIncomingDeviceData(
  io: Server,
  payload: unknown,
  ack?: (response: SocketAck) => void
): Promise<void> {
  try {
    const savedPayload = await historyService.saveIncomingDeviceData(payload);
    io.to("all-devices").emit("device:data", savedPayload);
    if (Number.isFinite(savedPayload.deviceId)) {
      io.to(`device:${savedPayload.deviceId}`).emit("device:data", savedPayload);
    }

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
      io.to("all-devices").emit("device:data", livePayload);
      if (Number.isFinite(livePayload.deviceId)) {
        io.to(`device:${livePayload.deviceId}`).emit("device:data", livePayload);
      }
    } catch (fallbackError) {
      console.error("Failed to build fallback live payload", fallbackError);
    }

    io.to("dashboards").emit("device:error", { message });

    if (typeof ack === "function") {
      ack({ ok: false, message });
    }
  }
}

export function registerDeviceSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    const token = String(socket.handshake.auth?.token || "").trim();
    if (token) {
      try {
        const payload = verifyJwt(token);
        void userRepo
          .findOne({ where: { id: payload.userId, username: payload.username, role: payload.role }, relations: { devices: true } })
          .then((user) => {
            if (!user) {
              return;
            }

            socket.join("dashboards");
            if (user.role !== UserRole.ADMIN) {
              user.devices.forEach((device) => {
                socket.join(`device:${device.id}`);
              });
            } else {
              socket.join("all-devices");
            }
          })
          .catch((error) => {
            console.error("Failed to join socket rooms", error);
          });
      } catch (_error) {
        socket.disconnect(true);
        return;
      }
    }

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
      intensityType: raw.intensityType,
      confidence: raw.confidence
    });

    await handleIncomingDeviceData(io, data, ack);
};

    const handleDeviceStatus = async (payload: unknown, ack?: (response: SocketAck) => void): Promise<void> => {
      console.log("🚨 devices_status event received");

      let parsedPayload: unknown = payload;
      if (typeof payload === "string") {
        try {
          parsedPayload = JSON.parse(payload);
        } catch (_error) {
          console.log("error ..... Raw devices_status payload:", payload);
          if (typeof ack === "function") {
            ack({ ok: true, message: "devices_status received", data: payload });
          }
          return;
        }
      }

      console.dir(parsedPayload, { depth: null });

      const telemetryEntries = extractTelemetryStatusEntries(parsedPayload);
      for (const entry of telemetryEntries) {
        try {
          const device = await deviceService.resolveDeviceIdentifier(entry.deviceIdentifier);
          await telemetryService.recordIfNeeded(device.id, entry.telemetry);
        } catch (error) {
          console.warn("Skipping telemetry status payload for unknown device", {
            deviceIdentifier: entry.deviceIdentifier,
            message: error instanceof Error ? error.message : "unknown error"
          });
        }
      }

      io.to("dashboards").emit("devices_status", parsedPayload);
      socket.emit("devices_status", parsedPayload);

      if (typeof ack === "function") {
        ack({ ok: true, message: "devices_status received", data: parsedPayload });
      }
    };

    const handleCheckAiStatus = async (payload: unknown, ack?: (response: SocketAck) => void): Promise<void> => {
      console.log("check_ai_status event received");
      console.dir(payload, { depth: null });

      try {
        const parsedPayload = typeof payload === "string" ? JSON.parse(payload) : payload;
        const { startTime, endTime } = extractAiStatusRange(parsedPayload);
        const items = await historyService.getAiStatusByDateRange(startTime, endTime);

        const response = {
          ok: true,
          data: {
            startTime,
            endTime,
            items
          }
        } satisfies SocketAck;

        if (typeof ack === "function") {
          ack(response);
          return;
        }

        socket.emit("check_ai_status_result", response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to check AI status";
        const response = { ok: false, message } satisfies SocketAck;

        if (typeof ack === "function") {
          ack(response);
          return;
        }

        socket.emit("check_ai_status_result", response);
      }
    };

    socket.on("devices_status", handleDeviceStatus);
    socket.on("check_ai_status", handleCheckAiStatus);
    socket.on("send_data", handleSendData);
    socket.on("device:data", handleSendData);
  });
}
