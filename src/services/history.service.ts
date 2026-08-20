import { Between, MoreThanOrEqual, Repository } from "typeorm";
import { gzipSync, gunzipSync } from "zlib";
import { AppDataSource } from "../config/data-source";
import { DeviceHistory } from "../entities/DeviceHistory";
import { HttpError } from "../utils/http-error";
import {
  CompressedDeviceMatrixPayload,
  DeviceDataBroadcastPayload,
  IncomingDeviceDataPayload,
  StoredDeviceMatrix
} from "../utils/types";
import {
  isPositiveInteger,
  validateDeviceMatrix,
  validateIncomingDevicePayload
} from "../utils/validation";
import { DeviceService } from "./device.service";

export class HistoryService {
  private readonly historyRepo: Repository<DeviceHistory>;
  private readonly deviceService: DeviceService;

  constructor() {
    this.historyRepo = AppDataSource.getRepository(DeviceHistory);
    this.deviceService = new DeviceService();
  }

  private compressMatrix(matrix: number[][]): StoredDeviceMatrix {
    const rows = matrix.length;
    const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
    const rawJson = JSON.stringify(matrix);
    const compressed = gzipSync(Buffer.from(rawJson, "utf8"));

    return {
      format: "gzip-base64-json-v1",
      rows,
      cols,
      payload: compressed.toString("base64")
    };
  }

  private isCompressedMatrixPayload(value: unknown): value is CompressedDeviceMatrixPayload {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const raw = value as Record<string, unknown>;
    return (
      raw.format === "gzip-base64-json-v1" &&
      typeof raw.rows === "number" &&
      typeof raw.cols === "number" &&
      typeof raw.payload === "string"
    );
  }

  private decodeMatrix(stored: StoredDeviceMatrix): number[][] {
    if (Array.isArray(stored)) {
      return stored as number[][];
    }

    if (!this.isCompressedMatrixPayload(stored)) {
      throw new HttpError(500, "Stored matrix payload format is invalid");
    }

    try {
      const inflated = gunzipSync(Buffer.from(stored.payload, "base64")).toString("utf8");
      const parsed = JSON.parse(inflated);
      const validation = validateDeviceMatrix(parsed);
      if (!validation.valid) {
        throw new Error(validation.message || "decoded matrix is invalid");
      }

      return parsed as number[][];
    } catch (_error) {
      throw new HttpError(500, "Failed to decode stored matrix payload");
    }
  }

  private decodeHistoryItems(items: DeviceHistory[]): DeviceHistory[] {
    return items.map((item) => {
      const resolvedEnd = item.endTime || item.timestamp;
      const resolvedStart = item.startTime || resolvedEnd;

      return {
        ...item,
        timestamp: resolvedEnd,
        startTime: resolvedStart,
        endTime: resolvedEnd,
        data: this.decodeMatrix(item.data),
        frequencyBins: Array.isArray(item.frequencyBins) ? item.frequencyBins : null
      };
    });
  }

  private async normalizeIncomingPayload(payload: unknown): Promise<{
    parsed: IncomingDeviceDataPayload;
    parsedDate: Date;
    parsedStartDate: Date;
    parsedEndDate: Date;
    resolvedDeviceId: number;
    resolvedDeviceName: string;
  }> {
    const validation = validateIncomingDevicePayload(payload);
    if (!validation.valid || !validation.parsed || !validation.parsedDate) {
      throw new HttpError(400, validation.message || "Invalid payload");
    }

    const parsed: IncomingDeviceDataPayload = validation.parsed;
    const parsedStartDate = new Date(parsed.startTime || parsed.timestamp);
    const parsedEndDate = new Date(parsed.endTime || parsed.timestamp);
    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      throw new HttpError(400, "start_time/end_time are invalid");
    }

    if (parsedStartDate.getTime() > parsedEndDate.getTime()) {
      throw new HttpError(400, "start_time must be before or equal to end_time");
    }

    const device = await this.deviceService.resolveDeviceIdentifier(parsed.deviceId);

    return {
      parsed,
      parsedDate: validation.parsedDate,
      parsedStartDate,
      parsedEndDate,
      resolvedDeviceId: device.id,
      resolvedDeviceName: device.name
    };
  }

  async buildBroadcastPayload(payload: unknown): Promise<DeviceDataBroadcastPayload> {
    const normalized = await this.normalizeIncomingPayload(payload);

    return {
      deviceId: normalized.resolvedDeviceId,
      deviceName: normalized.resolvedDeviceName,
      sourceDeviceId: normalized.parsed.deviceId,
      timestamp: normalized.parsedDate.toISOString(),
      startTime: normalized.parsedStartDate.toISOString(),
      endTime: normalized.parsedEndDate.toISOString(),
      data: normalized.parsed.data,
      frequencyBins: normalized.parsed.frequencyBins,
      intensityType: normalized.parsed.intensityType,
      persisted: false
    };
  }

  async saveIncomingDeviceData(payload: unknown): Promise<DeviceDataBroadcastPayload> {
    const normalized = await this.normalizeIncomingPayload(payload);

    const existing = await this.historyRepo.findOne({
      where: {
        deviceId: normalized.resolvedDeviceId,
        startTime: normalized.parsedStartDate,
        endTime: normalized.parsedEndDate
      }
    });

    if (existing) {
      console.info("[HistoryService] Duplicate packet skipped", {
        deviceId: normalized.resolvedDeviceId,
        deviceName: normalized.resolvedDeviceName,
        startTime: normalized.parsedStartDate.toISOString(),
        endTime: normalized.parsedEndDate.toISOString(),
        existingHistoryId: existing.id
      });

      return {
        deviceId: existing.deviceId,
        deviceName: normalized.resolvedDeviceName,
        sourceDeviceId: normalized.parsed.deviceId,
        timestamp: existing.timestamp.toISOString(),
        startTime: (existing.startTime || normalized.parsedStartDate).toISOString(),
        endTime: (existing.endTime || normalized.parsedEndDate).toISOString(),
        data: normalized.parsed.data,
        frequencyBins: normalized.parsed.frequencyBins,
        intensityType: normalized.parsed.intensityType,
        persisted: true
      };
    }

    const entity = this.historyRepo.create({
      deviceId: normalized.resolvedDeviceId,
      timestamp: normalized.parsedEndDate,
      startTime: normalized.parsedStartDate,
      endTime: normalized.parsedEndDate,
      data: this.compressMatrix(normalized.parsed.data),
      frequencyBins: normalized.parsed.frequencyBins ?? null
    });

    const saved = await this.historyRepo.save(entity);

    console.info("[HistoryService] Packet inserted", {
      deviceId: saved.deviceId,
      deviceName: normalized.resolvedDeviceName,
      startTime: normalized.parsedStartDate.toISOString(),
      endTime: normalized.parsedEndDate.toISOString(),
      historyId: saved.id
    });

    return {
      deviceId: saved.deviceId,
      deviceName: normalized.resolvedDeviceName,
      sourceDeviceId: normalized.parsed.deviceId,
      timestamp: saved.timestamp.toISOString(),
      startTime: (saved.startTime || normalized.parsedStartDate).toISOString(),
      endTime: (saved.endTime || normalized.parsedEndDate).toISOString(),
      data: normalized.parsed.data,
      frequencyBins: normalized.parsed.frequencyBins,
      intensityType: normalized.parsed.intensityType,
      persisted: true
    };
  }

  async getLatest24Hours(deviceId: number): Promise<DeviceHistory[]> {
    if (!isPositiveInteger(deviceId)) {
      throw new HttpError(400, "device id must be a positive integer");
    }

    await this.deviceService.verifyDeviceExists(deviceId);

    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const items = await this.historyRepo.find({
      where: {
        deviceId,
        timestamp: MoreThanOrEqual(fromDate)
      },
      order: {
        timestamp: "ASC"
      }
    });

    return this.decodeHistoryItems(items);
  }

  async getHistoryByDateRange(deviceId: number, from: Date, to: Date): Promise<DeviceHistory[]> {
    if (!isPositiveInteger(deviceId)) {
      throw new HttpError(400, "device id must be a positive integer");
    }

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new HttpError(400, "from and to must be valid dates");
    }

    if (from > to) {
      throw new HttpError(400, "from must be before to");
    }

    await this.deviceService.verifyDeviceExists(deviceId);

    const items = await this.historyRepo.find({
      where: {
        deviceId,
        timestamp: Between(from, to)
      },
      order: {
        timestamp: "ASC"
      }
    });

    return this.decodeHistoryItems(items);
  }
}
