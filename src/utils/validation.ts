import { IncomingDeviceDataPayload } from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateDeviceMatrix(data: unknown): { valid: boolean; message?: string } {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, message: "data must be a non-empty 2D array" };
  }

  for (const row of data) {
    if (!Array.isArray(row) || row.length === 0) {
      return { valid: false, message: "each row must be a non-empty array" };
    }

    for (const value of row) {
      if (!isFiniteNumber(value)) {
        return { valid: false, message: "data must contain only finite numbers" };
      }
    }
  }

  return { valid: true };
}

export function validateIncomingDevicePayload(payload: unknown): {
  valid: boolean;
  message?: string;
  parsed?: IncomingDeviceDataPayload;
  parsedDate?: Date;
} {
  if (typeof payload !== "object" || payload === null) {
    return { valid: false, message: "payload must be an object" };
  }

  const outer = payload as Record<string, unknown>;
  const raw =
    typeof outer.data === "object" &&
    outer.data !== null &&
    !Array.isArray(outer.data) &&
    "deviceId" in (outer.data as Record<string, unknown>)
      ? (outer.data as Record<string, unknown>)
      : outer;

  const deviceIdRaw = raw.deviceId;
  const isStringDeviceId = typeof deviceIdRaw === "string" && deviceIdRaw.trim().length > 0;
  if (!isPositiveInteger(deviceIdRaw) && !isStringDeviceId) {
    return { valid: false, message: "deviceId must be a positive integer or non-empty string" };
  }

  const timestampCandidate =
    (typeof raw.timestamp === "string" && raw.timestamp.trim()) ||
    (typeof raw.end_time === "string" && raw.end_time.trim()) ||
    (typeof raw.endTime === "string" && raw.endTime.trim()) ||
    (typeof raw.start_time === "string" && raw.start_time.trim()) ||
    (typeof raw.startTime === "string" && raw.startTime.trim()) ||
    new Date().toISOString();

  const timestamp = String(timestampCandidate);
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return { valid: false, message: "timestamp is invalid" };
  }

  const matrixValidation = validateDeviceMatrix(raw.data);
  if (!matrixValidation.valid) {
    return { valid: false, message: matrixValidation.message };
  }

  const matrixRows = (raw.data as unknown[]).length;

  const intensityTypeRaw =
    typeof raw.intensityType === "string" ? raw.intensityType.trim().toLowerCase() : undefined;
  let parsedIntensityType: IncomingDeviceDataPayload["intensityType"];
  if (intensityTypeRaw) {
    if (
      intensityTypeRaw !== "normalized" &&
      intensityTypeRaw !== "uint8" &&
      intensityTypeRaw !== "magnitude" &&
      intensityTypeRaw !== "db"
    ) {
      return {
        valid: false,
        message: "intensityType must be one of normalized, uint8, magnitude, db"
      };
    }

    parsedIntensityType = intensityTypeRaw;
  }

  const rawFrequencyBins = raw.frequencyBins ?? raw.freq ?? raw.frequencies;
  let parsedFrequencyBins: number[] | undefined;
  if (rawFrequencyBins !== undefined) {
    if (!Array.isArray(rawFrequencyBins) || rawFrequencyBins.length === 0) {
      return { valid: false, message: "frequency bins must be a non-empty array when provided" };
    }

    const bins: number[] = [];
    for (const item of rawFrequencyBins) {
      const value = Array.isArray(item) ? item[0] : item;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { valid: false, message: "frequency bins must contain only finite numbers" };
      }
      bins.push(n);
    }

    if (bins.length !== matrixRows) {
      return {
        valid: false,
        message: `frequency bins length (${bins.length}) must match data rows (${matrixRows})`
      };
    }

    parsedFrequencyBins = bins;
  }

  const startTimeCandidate =
    (typeof raw.start_time === "string" && raw.start_time.trim()) ||
    (typeof raw.startTime === "string" && raw.startTime.trim()) ||
    timestamp;
  const endTimeCandidate =
    (typeof raw.end_time === "string" && raw.end_time.trim()) ||
    (typeof raw.endTime === "string" && raw.endTime.trim()) ||
    timestamp;

  const startTime = String(startTimeCandidate);
  const endTime = String(endTimeCandidate);
  const parsedStart = new Date(startTime);
  const parsedEnd = new Date(endTime);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    return { valid: false, message: "start_time/end_time are invalid" };
  }

  if (parsedStart.getTime() > parsedEnd.getTime()) {
    return { valid: false, message: "start_time must be before or equal to end_time" };
  }

  return {
    valid: true,
    parsedDate,
    parsed: {
      deviceId: isStringDeviceId ? deviceIdRaw.trim() : (deviceIdRaw as number),
      timestamp,
      startTime,
      endTime,
      data: raw.data as number[][],
      frequencyBins: parsedFrequencyBins,
      intensityType: parsedIntensityType
    }
  };
}
