import { state } from "./state.js";
import { ONE_HOUR_WINDOW_MS } from "./constants.js";
import { clamp, formatNaiveDateTimeMs } from "./utils.js";
import { getPacketInterval } from "./packet-timing.js";
import { getLatestPacketEndMs } from "./packet-store.js";

// scheduleRender and markInteractionActive are injected once by dashboard.js via initViewport()
var _scheduleRender = null;
var _markInteractionActive = null;

export function initViewport(deps) {
  _scheduleRender = deps.scheduleRender;
  _markInteractionActive = deps.markInteractionActive;
}

export function syncLatestLiveViewport(anchorMs) {
  var latestToMs = Number.isFinite(anchorMs) ? anchorMs : getLatestPacketEndMs();
  if (!Number.isFinite(latestToMs)) {
    latestToMs = Date.now();
  }
  var latestFromMs = latestToMs - state.currentLiveWindowMs;
  state.activeRangeMode = state.currentLiveWindowMs === ONE_HOUR_WINDOW_MS ? "latest1h" : "latest30m";
  state.activeFromIso = formatNaiveDateTimeMs(latestFromMs, true);
  state.activeToIso = formatNaiveDateTimeMs(latestToMs, true);
  state.viewportFromMs = latestFromMs;
  state.viewportToMs = latestToMs;
  state.followLatest24 = true;
}

export function getCurrentViewSpanMs() {
  if (!Number.isFinite(state.viewportFromMs) || !Number.isFinite(state.viewportToMs)) {
    return null;
  }
  return state.viewportToMs - state.viewportFromMs;
}

export function panViewport(direction, ratio) {
  var span = getCurrentViewSpanMs();
  if (!span || span <= 0) {
    return;
  }

  state.liveManualBrowseActive = true;
  var panRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.2;
  var shift = Math.max(30 * 1000, Math.round(span * panRatio));
  state.viewportFromMs += direction * shift;
  state.viewportToMs += direction * shift;
  _scheduleRender({ skipTable: false });
}

export function zoomViewport(factor) {
  zoomViewportAt(factor, 0.5);
}

export function zoomViewportAt(factor, anchorFraction) {
  var span = getCurrentViewSpanMs();
  if (!span || span <= 0) {
    return;
  }

  state.liveManualBrowseActive = true;
  var anchor = clamp(anchorFraction, 0, 1);
  var anchorTime = state.viewportFromMs + span * anchor;
  var newSpan = Math.round(span * factor);
  var minSpan = 60 * 1000;
  var maxSpan = 7 * 24 * 60 * 60 * 1000;
  newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

  state.viewportFromMs = anchorTime - newSpan * anchor;
  state.viewportToMs = state.viewportFromMs + newSpan;
  _scheduleRender({ skipTable: true });
  _markInteractionActive();
}

export function resetViewport() {
  if (state.liveFollowEnabled) {
    state.followLatest24 = true;
    state.liveFollowEnabled = true;
    state.liveManualBrowseActive = false;
    _scheduleRender({ skipTable: false });
    return;
  }

  if (state.activeFromIso && state.activeToIso) {
    state.followLatest24 = false;
    state.viewportFromMs = new Date(state.activeFromIso).getTime();
    state.viewportToMs = new Date(state.activeToIso).getTime();
    _scheduleRender({ skipTable: false });
  }
}

export function fitViewportToPackets() {
  if (!state.currentPackets.length) {
    return;
  }

  var minStart = Number.POSITIVE_INFINITY;
  var maxEnd = Number.NEGATIVE_INFINITY;

  for (var i = 0; i < state.currentPackets.length; i += 1) {
    var interval = getPacketInterval(state.currentPackets[i]);
    if (!interval) {
      continue;
    }

    if (interval.startMs < minStart) {
      minStart = interval.startMs;
    }
    if (interval.endMs > maxEnd) {
      maxEnd = interval.endMs;
    }
  }

  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) {
    return;
  }

  state.liveManualBrowseActive = true;
  var padding = Math.max(60 * 1000, Math.round((maxEnd - minStart) * 0.04));
  state.viewportFromMs = minStart - padding;
  state.viewportToMs = maxEnd + padding;
  state.activeFromIso = formatNaiveDateTimeMs(state.viewportFromMs, true);
  state.activeToIso = formatNaiveDateTimeMs(state.viewportToMs, true);
  _scheduleRender({ skipTable: false });
}
