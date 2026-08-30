import "dotenv/config";
import zlib from "zlib";
import mysql from "mysql2/promise";
import { io } from "socket.io-client";

const config = {
  socketUrl: process.env.SOCKET_URL || `http://localhost:${process.env.PORT || 3111}`,
  eventName: process.env.REPLAY_EVENT_NAME || "send_data",
  deviceId: parseOptionalInteger(process.env.REPLAY_DEVICE_ID),
  limit: parsePositiveInteger(process.env.REPLAY_LIMIT, 120),
  emitIntervalMs: parsePositiveInteger(process.env.REPLAY_INTERVAL_MS, 60000),
  startDelayMs: parsePositiveInteger(process.env.REPLAY_START_DELAY_MS, 1000),
  loop: parseBoolean(process.env.REPLAY_LOOP, true),
  shiftToNow: parseBoolean(process.env.REPLAY_SHIFT_TO_NOW, false),
  verbose: parseBoolean(process.env.REPLAY_VERBOSE, true),
  generateBinsWhenMissing: parseBoolean(process.env.REPLAY_GENERATE_BINS_WHEN_MISSING, true),
  forceMinFrequencyHz: parseOptionalNumber(process.env.REPLAY_FORCE_MIN_FREQUENCY_HZ),
  forceMaxFrequencyHz: parseOptionalNumber(process.env.REPLAY_FORCE_MAX_FREQUENCY_HZ)
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  dateStrings: true
});

let socket;
let shuttingDown = false;

try {
  const selectedDeviceId = await resolveReplayDeviceId(connection, config.deviceId);
  const deviceProfile = await loadDeviceProfile(connection, selectedDeviceId);
  const rows = await loadRecentHistoryRows(connection, selectedDeviceId, config.limit);
  if (!rows.length) {
    throw new Error(`No history rows found for device ${selectedDeviceId}`);
  }

  const fallbackMinHz = Number.isFinite(config.forceMinFrequencyHz)
    ? config.forceMinFrequencyHz
    : (Number.isFinite(deviceProfile?.minFrequency) ? Number(deviceProfile.minFrequency) : 0);
  const fallbackMaxHz = Number.isFinite(config.forceMaxFrequencyHz)
    ? config.forceMaxFrequencyHz
    : deriveDefaultMaxFrequencyHz(deviceProfile);

  const replayPackets = buildReplayPackets(rows, {
    shiftToNow: config.shiftToNow,
    emitIntervalMs: config.emitIntervalMs,
    generateBinsWhenMissing: config.generateBinsWhenMissing,
    fallbackMinHz,
    fallbackMaxHz
  });

  log(`Picked device ${selectedDeviceId} with ${replayPackets.length} packets.`);
  log(`Socket target: ${config.socketUrl}`);
  log(`Mode: ${config.shiftToNow ? "synthetic-now (writes new rows)" : "replay-existing (duplicate-safe)"}`);
  log(
    `Frequency bins: ${config.generateBinsWhenMissing ? `auto-generate missing (${fallbackMinHz}-${fallbackMaxHz} Hz)` : "pass-through only"}`
  );
  log(`Loop: ${config.loop ? "on" : "off"}`);

  socket = io(config.socketUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    timeout: 10000
  });

  socket.on("connect", async () => {
    log(`Connected as ${socket.id}`);
    await sleep(config.startDelayMs);
    runReplayLoop(socket, replayPackets).catch((error) => {
      console.error("Replay loop failed:", error);
      shutdown(1);
    });
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error.message || error);
  });

  socket.on("disconnect", (reason) => {
    log(`Disconnected: ${reason}`);
  });

  socket.on("device:error", (payload) => {
    console.error("Server device:error:", payload);
  });

  socket.on("device:data", (payload) => {
    if (!payload || Number(payload.deviceId) !== selectedDeviceId) {
      return;
    }

    if (config.verbose) {
      log(
        `Broadcast device:data for device ${payload.deviceId} @ ${payload.endTime || payload.timestamp} persisted=${String(payload.persisted)}`
      );
    }
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await safeCloseConnection(connection);
  process.exit(1);
}

async function runReplayLoop(activeSocket, replayPackets) {
  let cycle = 0;
  while (!shuttingDown) {
    cycle += 1;
    log(`Starting replay cycle ${cycle}`);

    for (let index = 0; index < replayPackets.length; index += 1) {
      if (shuttingDown) {
        return;
      }

      const packet = replayPackets[index];
      const ack = await emitWithAck(activeSocket, config.eventName, packet);

      if (config.verbose) {
        log(
          `Emitted ${index + 1}/${replayPackets.length} start=${packet.startTime} end=${packet.endTime} ack=${JSON.stringify(ack)}`
        );
      }

      await sleep(config.emitIntervalMs);
    }

    if (!config.loop) {
      log("Replay completed. Loop is off.");
      await shutdown(0);
      return;
    }
  }
}

async function emitWithAck(activeSocket, eventName, payload) {
  return await new Promise((resolve) => {
    activeSocket.emit(eventName, payload, (response) => {
      resolve(response ?? null);
    });
  });
}

async function resolveReplayDeviceId(db, explicitDeviceId) {
  if (Number.isInteger(explicitDeviceId) && explicitDeviceId > 0) {
    return explicitDeviceId;
  }

  const [rows] = await db.execute(
    `
      SELECT deviceId, COUNT(*) AS packetCount, MAX(timestamp) AS latestTimestamp
      FROM device_histories
      GROUP BY deviceId
      ORDER BY latestTimestamp DESC, packetCount DESC
      LIMIT 1
    `
  );

  const first = Array.isArray(rows) ? rows[0] : null;
  const deviceId = Number(first && first.deviceId);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    throw new Error("Unable to auto-select a device from device_histories");
  }

  return deviceId;
}

async function loadRecentHistoryRows(db, deviceId, limit) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM (
        SELECT id, deviceId, timestamp, startTime, endTime, data, frequencyBins, aiStatus
        FROM device_histories
        WHERE deviceId = ?
        ORDER BY timestamp DESC
        LIMIT ?
      ) recent_packets
      ORDER BY timestamp ASC
    `,
    [deviceId, limit]
  );

  return Array.isArray(rows) ? rows.map(normalizeHistoryRow) : [];
}

async function loadDeviceProfile(db, deviceId) {
  const [rows] = await db.execute(
    `SELECT id, minFrequency, maxFrequency FROM devices WHERE id = ? LIMIT 1`,
    [deviceId]
  );

  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) {
    return null;
  }

  return {
    id: Number(first.id),
    minFrequency: parseOptionalNumber(first.minFrequency),
    maxFrequency: parseOptionalNumber(first.maxFrequency)
  };
}

function normalizeHistoryRow(row) {
  const rawData = parseJsonField(row.data);
  const rawFrequencyBins = parseJsonField(row.frequencyBins);

  return {
    id: Number(row.id),
    deviceId: Number(row.deviceId),
    timestamp: normalizeNaiveDateTimeString(row.timestamp),
    startTime: normalizeNaiveDateTimeString(row.startTime || row.timestamp),
    endTime: normalizeNaiveDateTimeString(row.endTime || row.timestamp),
    data: decodeStoredMatrix(rawData),
    frequencyBins: normalizeFrequencyBins(rawFrequencyBins),
    aiStatus: row.aiStatus === null || row.aiStatus === undefined ? undefined : Number(row.aiStatus)
  };
}

function buildReplayPackets(rows, options) {
  if (!options.shiftToNow) {
    return rows.map((row) => ({
      deviceId: row.deviceId,
      timestamp: row.timestamp,
      startTime: row.startTime,
      endTime: row.endTime,
      data: row.data,
      frequencyBins: resolveFrequencyBins(row, options),
      aiStatus: row.aiStatus
    }));
  }

  const baseNowMs = Date.now();
  return rows.map((row, index) => {
    const originalStartMs = Date.parse(row.startTime);
    const originalEndMs = Date.parse(row.endTime || row.timestamp);
    const durationMs = Number.isFinite(originalEndMs - originalStartMs) && originalEndMs >= originalStartMs
      ? Math.max(1000, originalEndMs - originalStartMs)
      : 1000;

    const syntheticEndMs = baseNowMs + index * options.emitIntervalMs;
    const syntheticStartMs = syntheticEndMs - durationMs;

    return {
      deviceId: row.deviceId,
      timestamp: formatLocalNaiveDateTime(new Date(syntheticEndMs)),
      startTime: formatLocalNaiveDateTime(new Date(syntheticStartMs)),
      endTime: formatLocalNaiveDateTime(new Date(syntheticEndMs)),
      data: row.data,
      frequencyBins: resolveFrequencyBins(row, options),
      aiStatus: row.aiStatus
    };
  });
}

function resolveFrequencyBins(row, options) {
  if (Array.isArray(row.frequencyBins) && row.frequencyBins.length === row.data.length) {
    return row.frequencyBins;
  }

  if (!options.generateBinsWhenMissing) {
    return undefined;
  }

  const rowCount = Array.isArray(row.data) ? row.data.length : 0;
  if (!Number.isInteger(rowCount) || rowCount < 2) {
    return undefined;
  }

  const minHz = Number.isFinite(options.fallbackMinHz) ? Number(options.fallbackMinHz) : 0;
  const maxHz = Number.isFinite(options.fallbackMaxHz) ? Number(options.fallbackMaxHz) : 250;
  if (maxHz <= minHz) {
    return undefined;
  }

  const step = (maxHz - minHz) / (rowCount - 1);
  const bins = [];
  for (let i = 0; i < rowCount; i += 1) {
    bins.push(minHz + i * step);
  }

  return bins;
}

function deriveDefaultMaxFrequencyHz(deviceProfile) {
  if (deviceProfile && Number.isFinite(deviceProfile.maxFrequency)) {
    const half = Number(deviceProfile.maxFrequency) / 2;
    if (Number.isFinite(half) && half > 0) {
      return half;
    }
  }

  return 250;
}

function decodeStoredMatrix(stored) {
  if (Array.isArray(stored)) {
    return stored;
  }

  if (!stored || typeof stored !== "object") {
    throw new Error("History row matrix payload is missing or invalid");
  }

  if (stored.format !== "gzip-base64-json-v1" || typeof stored.payload !== "string") {
    throw new Error("Unsupported matrix payload format in device_histories");
  }

  const inflated = zlib.gunzipSync(Buffer.from(stored.payload, "base64")).toString("utf8");
  const parsed = JSON.parse(inflated);
  if (!Array.isArray(parsed) || !parsed.length || !Array.isArray(parsed[0])) {
    throw new Error("Decoded matrix payload is invalid");
  }

  return parsed;
}

function normalizeFrequencyBins(value) {
  if (!Array.isArray(value) || !value.length) {
    return null;
  }

  const bins = value.map((item) => Number(Array.isArray(item) ? item[0] : item));
  return bins.every((item) => Number.isFinite(item)) ? bins : null;
}

function parseJsonField(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return value;
}

function normalizeNaiveDateTimeString(value) {
  if (value instanceof Date) {
    return formatLocalNaiveDateTime(value);
  }

  if (typeof value === "number") {
    return formatLocalNaiveDateTime(new Date(value));
  }

  if (typeof value !== "string") {
    throw new Error("Unsupported datetime value in history row");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Empty datetime value in history row");
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(trimmed)) {
    return trimmed.replace(" ", "T");
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid datetime value: ${trimmed}`);
  }

  return formatLocalNaiveDateTime(parsed);
}

function formatLocalNaiveDateTime(value) {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  const millis = String(value.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}`.replace(/\.000$/, "");
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function printHelp() {
  console.log(`
Fake Live DB Replay Client

Reads packets from device_histories and replays them over Socket.IO as if they were arriving live.

Usage:
  node examples/fake-live-db-replay-client.mjs

Environment variables:
  SOCKET_URL=http://localhost:3111
  REPLAY_DEVICE_ID=1
  REPLAY_LIMIT=120
  REPLAY_INTERVAL_MS=700
  REPLAY_START_DELAY_MS=1000
  REPLAY_LOOP=true
  REPLAY_SHIFT_TO_NOW=false
  REPLAY_VERBOSE=true
  REPLAY_EVENT_NAME=send_data
  REPLAY_GENERATE_BINS_WHEN_MISSING=true
  REPLAY_FORCE_MIN_FREQUENCY_HZ=0
  REPLAY_FORCE_MAX_FREQUENCY_HZ=250

Modes:
  REPLAY_SHIFT_TO_NOW=false  Replays original timestamps. Safe for DB because duplicate rows are skipped by the server.
  REPLAY_SHIFT_TO_NOW=true   Rewrites timestamps near now. Better live illusion, but it will insert synthetic rows into DB.

Frequency bins behavior:
  If a row has no frequencyBins, this script can auto-generate them to stabilize y-axis scaling.
  Default range is device.minFrequency to (device.maxFrequency / 2), or 0..250 when unavailable.
`);
}

function log(message) {
  console.log(`[fake-live-replay] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(code) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log("Shutting down...");

  if (socket) {
    socket.close();
  }

  await safeCloseConnection(connection);
  process.exit(code);
}

async function safeCloseConnection(db) {
  try {
    await db.end();
  } catch {
    // ignore close errors for disposable script
  }
}