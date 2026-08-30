import { state } from "./state.js";
import { DEFAULT_LIVE_WINDOW_MS, MAX_PACKETS_IN_MEMORY } from "./constants.js";
import { formatNaiveDateTimeMs } from "./utils.js";
import { getPacketStartMs, getPacketEndMs, getPacketTimestampMs, normalizePacketTiming, getPacketKey } from "./packet-timing.js";

export function rebuildPacketKeySet() {
  state.currentPacketKeys = new Set();
  for (var i = 0; i < state.currentPackets.length; i += 1) {
    var key = getPacketKey(state.currentPackets[i], state.selectedDeviceId);
    if (key) {
      state.currentPacketKeys.add(key);
    }
  }
}

export function insertPacketSorted(packet) {
  normalizePacketTiming(packet);
  var packetTime = getPacketStartMs(packet);
  if (!Number.isFinite(packetTime)) {
    return false;
  }

  var packetKey = getPacketKey(packet, state.selectedDeviceId);
  if (packetKey && state.currentPacketKeys.has(packetKey)) {
    return false;
  }

  var low = 0;
  var high = state.currentPackets.length;
  while (low < high) {
    var mid = Math.floor((low + high) / 2);
    var midTime = getPacketStartMs(state.currentPackets[mid]);
    if (!Number.isFinite(midTime) || packetTime < midTime) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  state.currentPackets.splice(low, 0, packet);
  if (packetKey) {
    state.currentPacketKeys.add(packetKey);
  }

  if (state.currentPackets.length > MAX_PACKETS_IN_MEMORY) {
    var overflow = state.currentPackets.length - MAX_PACKETS_IN_MEMORY;
    var removed = state.currentPackets.splice(0, overflow);
    for (var r = 0; r < removed.length; r += 1) {
      var removedKey = getPacketKey(removed[r], state.selectedDeviceId);
      if (removedKey) {
        state.currentPacketKeys.delete(removedKey);
      }
    }
  }

  return true;
}

export function getLatestPacketEndMs() {
  if (!state.currentPackets.length) {
    return NaN;
  }

  var latest = state.currentPackets[state.currentPackets.length - 1];
  var endMs = getPacketEndMs(latest);
  if (Number.isFinite(endMs)) {
    return endMs;
  }

  var startMs = getPacketStartMs(latest);
  if (Number.isFinite(startMs)) {
    return startMs;
  }

  return getPacketTimestampMs(latest);
}

export function findFirstVisiblePacketIndex(packets, fromMs) {
  var low = 0;
  var high = packets.length - 1;
  var result = packets.length;

  while (low <= high) {
    var mid = Math.floor((low + high) / 2);
    var packetEnd = getPacketEndMs(packets[mid]);
    if (!Number.isFinite(packetEnd) || packetEnd >= fromMs) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return result;
}

export function findLastVisiblePacketIndex(packets, toMs) {
  var low = 0;
  var high = packets.length - 1;
  var result = -1;

  while (low <= high) {
    var mid = Math.floor((low + high) / 2);
    var packetStart = getPacketStartMs(packets[mid]);
    if (!Number.isFinite(packetStart) || packetStart <= toMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

export function getVisiblePackets(fromMs, toMs) {
  if (!state.currentPackets.length) {
    return [];
  }

  var startIndex = findFirstVisiblePacketIndex(state.currentPackets, fromMs);
  var endIndex = findLastVisiblePacketIndex(state.currentPackets, toMs);
  if (startIndex > endIndex || startIndex >= state.currentPackets.length || endIndex < 0) {
    return [];
  }

  return state.currentPackets.slice(startIndex, endIndex + 1);
}

export function getInitialLoadRangeIso() {
  var toMs = Date.now();
  var fromMs = toMs - DEFAULT_LIVE_WINDOW_MS;
  return {
    fromIso: formatNaiveDateTimeMs(fromMs, true),
    toIso: formatNaiveDateTimeMs(toMs, true)
  };
}

export function getRecentRangeIso(hours) {
  var safeHours = Number(hours);
  if (!Number.isFinite(safeHours) || safeHours <= 0) {
    safeHours = 2;
  }

  var toMs = Date.now();
  var fromMs = toMs - Math.round(safeHours * 60 * 60 * 1000);
  return {
    fromIso: formatNaiveDateTimeMs(fromMs, true),
    toIso: formatNaiveDateTimeMs(toMs, true)
  };
}
