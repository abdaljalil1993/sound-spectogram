import { UserRole } from "../entities/User";

export type DeviceMatrix = number[][];

export interface CompressedDeviceMatrixPayload {
  format: "gzip-base64-json-v1";
  rows: number;
  cols: number;
  payload: string;
}

export type StoredDeviceMatrix = DeviceMatrix | CompressedDeviceMatrixPayload;

export type DeviceIdentifier = number | string;

export interface IncomingDeviceDataPayload {
  deviceId: DeviceIdentifier;
  timestamp: string;
  startTime?: string;
  endTime?: string;
  data: DeviceMatrix;
  frequencyBins?: number[];
}

export interface DeviceDataBroadcastPayload {
  deviceId: number;
  deviceName?: string;
  sourceDeviceId?: DeviceIdentifier;
  timestamp: string;
  startTime?: string;
  endTime?: string;
  data: DeviceMatrix;
  frequencyBins?: number[];
  persisted?: boolean;
}

export interface JwtUserPayload {
  userId: number;
  username: string;
  role: UserRole;
}
