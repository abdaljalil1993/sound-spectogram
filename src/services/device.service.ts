import { In, Repository } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Device } from "../entities/Device";
import { DeviceHistory } from "../entities/DeviceHistory";
import { UserRole } from "../entities/User";
import { HttpError } from "../utils/http-error";
import { AuthorizedUser } from "../utils/types";
import { DeviceIdentifier } from "../utils/types";

interface CreateDeviceInput {
  name: string;
  description?: string;
  minFrequency?: number | null;
  maxFrequency?: number | null;
}

interface UpdateDeviceInput {
  name?: string;
  description?: string | null;
  minFrequency?: number | null;
  maxFrequency?: number | null;
}

export interface DeviceWithLatestStatus extends Device {
  latestStatusAiStatus: number | null;
  latestStatusConfidence: number | null;
  latestStatusTimestamp: string | null;
}

export class DeviceService {
  private readonly deviceRepo: Repository<Device>;
  private readonly historyRepo: Repository<DeviceHistory>;

  constructor() {
    this.deviceRepo = AppDataSource.getRepository(Device);
    this.historyRepo = AppDataSource.getRepository(DeviceHistory);
  }

  async createDevice(input: CreateDeviceInput): Promise<Device> {
    const device = this.deviceRepo.create({
      name: input.name,
      description: input.description ?? null,
      minFrequency: input.minFrequency ?? null,
      maxFrequency: input.maxFrequency ?? null
    });

    return this.deviceRepo.save(device);
  }

  async getDevices(): Promise<Device[]> {
    return this.deviceRepo.find({ order: { id: "ASC" } });
  }

  async getDevicesForUser(user?: AuthorizedUser): Promise<Device[]> {
    if (!user || user.role === UserRole.ADMIN) {
      return this.getDevices();
    }

    const allowedIds = Array.isArray(user.allowedDeviceIds)
      ? Array.from(new Set(user.allowedDeviceIds.filter((deviceId) => Number.isInteger(deviceId) && deviceId > 0)))
      : [];

    if (allowedIds.length === 0) {
      return [];
    }

    return this.deviceRepo.find({
      where: { id: In(allowedIds) },
      order: { id: "ASC" }
    });
  }

  async getDevicesWithLatestStatus(user?: AuthorizedUser): Promise<DeviceWithLatestStatus[]> {
    const devices = await this.getDevicesForUser(user);
    if (!devices.length) {
      return [];
    }

    const deviceIds = devices.map((device) => device.id);
    const latestRows = await this.historyRepo
      .createQueryBuilder("dh")
      .select("dh.deviceId", "deviceId")
      .addSelect("dh.aiStatus", "aiStatus")
      .addSelect("dh.confidence", "confidence")
      .addSelect("dh.timestamp", "timestamp")
      .where("dh.deviceId IN (:...deviceIds)", { deviceIds })
      .andWhere(
        "dh.id = (SELECT dh2.id FROM device_histories dh2 WHERE dh2.deviceId = dh.deviceId ORDER BY dh2.timestamp DESC, dh2.id DESC LIMIT 1)"
      )
      .getRawMany<{
        deviceId: number;
        aiStatus: number | null;
        confidence: string | number | null;
        timestamp: string | null;
      }>();

    const latestByDeviceId = new Map<number, { aiStatus: number | null; confidence: number | null; timestamp: string | null }>();
    latestRows.forEach((row) => {
      const confidenceNumber = Number(row.confidence);
      latestByDeviceId.set(Number(row.deviceId), {
        aiStatus: row.aiStatus === null || row.aiStatus === undefined ? null : Number(row.aiStatus),
        confidence: Number.isFinite(confidenceNumber) ? confidenceNumber : null,
        timestamp: row.timestamp ?? null
      });
    });

    return devices.map((device) => {
      const latest = latestByDeviceId.get(device.id);
      return {
        ...device,
        latestStatusAiStatus: latest ? latest.aiStatus : null,
        latestStatusConfidence: latest ? latest.confidence : null,
        latestStatusTimestamp: latest ? latest.timestamp : null
      };
    });
  }

  async getDeviceById(id: number): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) {
      throw new HttpError(404, "Device not found");
    }
    return device;
  }

  async requireDeviceAccess(user: AuthorizedUser | undefined, deviceId: number): Promise<Device> {
    const device = await this.getDeviceById(deviceId);

    if (!user || user.role === UserRole.ADMIN) {
      return device;
    }

    const allowedIds = Array.isArray(user.allowedDeviceIds) ? user.allowedDeviceIds : [];
    if (!allowedIds.includes(device.id)) {
      throw new HttpError(403, "You do not have permission to access this device");
    }

    return device;
  }

  async updateDevice(id: number, input: UpdateDeviceInput): Promise<Device> {
    const device = await this.getDeviceById(id);

    if (input.name !== undefined) {
      device.name = input.name;
    }

    if (input.description !== undefined) {
      device.description = input.description;
    }

    if (input.minFrequency !== undefined) {
      device.minFrequency = input.minFrequency;
    }

    if (input.maxFrequency !== undefined) {
      device.maxFrequency = input.maxFrequency;
    }

    return this.deviceRepo.save(device);
  }

  async deleteDevice(id: number): Promise<void> {
    const device = await this.getDeviceById(id);
    await this.deviceRepo.remove(device);
  }

  async verifyDeviceExists(deviceId: number): Promise<Device> {
    return this.getDeviceById(deviceId);
  }

  async resolveDeviceIdentifier(deviceIdentifier: DeviceIdentifier): Promise<Device> {
    if (typeof deviceIdentifier === "number") {
      return this.getDeviceById(deviceIdentifier);
    }

    const normalizedName = deviceIdentifier.trim();
    if (!normalizedName) {
      throw new HttpError(400, "deviceId string cannot be empty");
    }

    const device = await this.deviceRepo.findOne({ where: { name: normalizedName } });
    if (!device) {
      throw new HttpError(404, `Device not found for name: ${normalizedName}`);
    }

    return device;
  }
}
