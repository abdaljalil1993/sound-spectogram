import { parseFlexibleTimeMs } from "./utils.js";

export function normalizeFrequencyBins(rawBins) {
  if (!Array.isArray(rawBins) || rawBins.length === 0) {
    return null;
  }

  var bins = [];
  for (var i = 0; i < rawBins.length; i += 1) {
    var item = rawBins[i];
    var value;
    if (Array.isArray(item)) {
      if (!item.length) {
        return null;
      }
      value = Number(item[0]);
    } else {
      value = Number(item);
    }

    if (!Number.isFinite(value)) {
      return null;
    }

    bins.push(value);
  }

  return bins;
}

export function getPacketFrequencyBins(packet) {
  if (!packet) {
    return null;
  }

  if (Array.isArray(packet.__frequencyBins)) {
    return packet.__frequencyBins;
  }

  var bins = normalizeFrequencyBins(packet.frequencyBins || packet.freq || packet.frequencies);
  packet.__frequencyBins = bins;
  return bins;
}

export function getPacketStartMs(packet) {
  if (!packet) {
    return NaN;
  }

  if (Number.isFinite(packet.__startMs)) {
    return packet.__startMs;
  }

  var value = parseFlexibleTimeMs(packet.startTime || packet.start_time || packet.timestamp);
  if (Number.isFinite(value)) {
    packet.__startMs = value;
  }
  return value;
}

export function getPacketEndMs(packet) {
  if (!packet) {
    return NaN;
  }

  if (Number.isFinite(packet.__endMs)) {
    return packet.__endMs;
  }

  var value = parseFlexibleTimeMs(packet.endTime || packet.end_time || packet.timestamp);
  if (Number.isFinite(value)) {
    packet.__endMs = value;
  }
  return value;
}

export function getPacketTimestampMs(packet) {
  if (!packet) {
    return NaN;
  }

  if (Number.isFinite(packet.__timestampMs)) {
    return packet.__timestampMs;
  }

  var value = parseFlexibleTimeMs(
    packet.timestamp || packet.endTime || packet.end_time || packet.startTime || packet.start_time
  );
  if (Number.isFinite(value)) {
    packet.__timestampMs = value;
  }
  return value;
}

export function normalizePacketTiming(packet) {
  if (!packet) {
    return packet;
  }

  getPacketStartMs(packet);
  getPacketEndMs(packet);
  getPacketTimestampMs(packet);
  return packet;
}

// selectedDeviceId is passed explicitly — this module has no shared-state coupling.
export function getPacketKey(packet, selectedDeviceId) {
  if (!packet) {
    return "";
  }

  var deviceId = Number(packet.deviceId);
  if (!Number.isFinite(deviceId)) {
    deviceId = Number(selectedDeviceId);
  }

  var startMs = getPacketStartMs(packet);
  var endMs = getPacketEndMs(packet);
  var timeMs = getPacketTimestampMs(packet);
  if (!Number.isFinite(startMs)) {
    startMs = timeMs;
  }
  if (!Number.isFinite(endMs)) {
    endMs = startMs;
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "";
  }

  return String(deviceId) + "|" + String(startMs) + "|" + String(endMs);
}

export function getPacketInterval(packet) {
  var startMs = getPacketStartMs(packet);
  var endMs = getPacketEndMs(packet);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  if (endMs < startMs) {
    var swap = startMs;
    startMs = endMs;
    endMs = swap;
  }

  return { startMs: startMs, endMs: endMs };
}

export function getPacketValueAt(packet, row, col) {
  if (!packet || !Array.isArray(packet.data) || packet.data.length === 0 || !Array.isArray(packet.data[0])) {
    return NaN;
  }

  if (!Array.isArray(packet.data[row])) {
    return NaN;
  }

  var value = packet.data[row][col];
  return Number.isFinite(value) ? value : NaN;
}
