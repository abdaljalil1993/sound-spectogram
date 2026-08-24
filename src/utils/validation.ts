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

function parseTimestampLike(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.abs(value) < 1e12 ? value * 1000 : value;
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const normalized = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
      const parsedNumeric = new Date(normalized);
      return Number.isFinite(parsedNumeric.getTime()) ? parsedNumeric : null;
    }

    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
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
    raw.timestamp ??
    raw.end_time ??
    raw.endTime ??
    raw.start_time ??
    raw.startTime ??
    new Date().toISOString();

  const parsedDate = parseTimestampLike(timestampCandidate);
  if (!parsedDate) {
    return { valid: false, message: "timestamp is invalid" };
  }
  const timestamp = parsedDate.toISOString();

  const matrixValidation = validateDeviceMatrix(raw.data);
  if (!matrixValidation.valid) {
    return { valid: false, message: matrixValidation.message };
  }

  const matrixRows = (raw.data as unknown[]).length;

  const intensityTypeValue =
    typeof raw.intensityType === "string"
      ? raw.intensityType
      : typeof raw.intensity_type === "string"
        ? raw.intensity_type
        : undefined;
  const intensityTypeRaw = intensityTypeValue ? intensityTypeValue.trim().toLowerCase() : undefined;
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

  const rawFrequencyBins =
    raw.frequencyBins ??
    raw.frequency_bins ??
    raw.freq ??
    raw.frequencies ??
    raw.frequency ??
    raw.bin_frequencies;
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

  const startTimeCandidate = raw.start_time ?? raw.startTime ?? timestamp;
  const endTimeCandidate = raw.end_time ?? raw.endTime ?? timestamp;

  const parsedStart = parseTimestampLike(startTimeCandidate);
  const parsedEnd = parseTimestampLike(endTimeCandidate);
  if (!parsedStart || !parsedEnd) {
    return { valid: false, message: "start_time/end_time are invalid" };
  }

  const startTime = parsedStart.toISOString();
  const endTime = parsedEnd.toISOString();

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
