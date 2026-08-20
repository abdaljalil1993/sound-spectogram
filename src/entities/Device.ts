import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { DeviceHistory } from "./DeviceHistory";

@Entity({ name: "devices" })
export class Device {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ type: "double", nullable: true })
  minFrequency!: number | null;

  @Column({ type: "double", nullable: true })
  maxFrequency!: number | null;

  @OneToMany(() => DeviceHistory, (history) => history.device)
  histories!: DeviceHistory[];
}
