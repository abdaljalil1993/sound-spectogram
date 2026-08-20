import { Repository } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Device } from "../entities/Device";
import { HttpError } from "../utils/http-error";
import { DeviceIdentifier } from "../utils/types";

interface CreateDeviceInput {
  name: string;
  description?: string;
}

interface UpdateDeviceInput {
  name?: string;
  description?: string | null;
}

export class DeviceService {
  private readonly deviceRepo: Repository<Device>;

  constructor() {
    this.deviceRepo = AppDataSource.getRepository(Device);
  }

  async createDevice(input: CreateDeviceInput): Promise<Device> {
    const device = this.deviceRepo.create({
      name: input.name,
      description: input.description ?? null
    });

    return this.deviceRepo.save(device);
  }

  async getDevices(): Promise<Device[]> {
    return this.deviceRepo.find({ order: { id: "ASC" } });
  }

  async getDeviceById(id: number): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) {
      throw new HttpError(404, "Device not found");
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
