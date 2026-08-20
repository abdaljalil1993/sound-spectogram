import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export enum UserRole {
  ADMIN = "admin",
  EMP = "emp"
}

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 100, unique: true })
  username!: string;

  @Column({ type: "varchar", length: 255 })
  password!: string;

  @Column({ type: "enum", enum: UserRole, default: UserRole.EMP })
  role!: UserRole;

  @Column({ type: "varchar", length: 500, nullable: true })
  token!: string | null;
}
