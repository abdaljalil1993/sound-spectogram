import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { Device } from "./Device";
import { StoredDeviceMatrix } from "../utils/types";

@Entity({ name: "device_histories" })
@Index(["deviceId", "timestamp"])
@Index(["deviceId", "startTime", "endTime"], { unique: true })
export class DeviceHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int" })
  deviceId!: number;

  @ManyToOne(() => Device, (device) => device.histories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "deviceId" })
  device!: Device;

  @Column({ type: "datetime" })
  timestamp!: Date;

  @Column({ type: "datetime", nullable: true })
  startTime!: Date | null;

  @Column({ type: "datetime", nullable: true })
  endTime!: Date | null;

  @Column({ type: "json" })
  data!: StoredDeviceMatrix;

  @Column({ type: "json", nullable: true })
  frequencyBins!: number[] | null;
}
