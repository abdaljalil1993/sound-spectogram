import { state } from "./state.js";
import { apiRequest } from "./api.js";
import { setGlobalMessage } from "./ui-status.js";
import { decodePacketsMatrix, decodePacketMatrix } from "./packet-codec.js";
import { rebuildPacketKeySet, insertPacketSorted, getRecentRangeIso } from "./packet-store.js";
import { normalizePacketTiming, getPacketStartMs, getPacketEndMs, getPacketTimestampMs } from "./packet-timing.js";
import { formatNaiveDateTimeMs } from "./utils.js";
import { DEFAULT_LIVE_WINDOW_MS, ONE_HOUR_WINDOW_MS, MAX_LOAD_WINDOW_MS } from "./constants.js";
import { markLiveTrace } from "./live-trace.js";

var _scheduleRender = null;
var _setSpectrogramLoading = null;
var _historyInfoEl = null;
var _selectedDeviceTitleEl = null;
var _historyTableBody = null;
var _sideDeviceInfoEl = null;
var _gapTooltipEl = null;
var _globalMessageEl = null;

export function initHistoryApi(deps) {
  _scheduleRender = deps.scheduleRender;
  _setSpectrogramLoading = deps.setSpectrogramLoading;
  _historyInfoEl = deps.historyInfoEl;
  _selectedDeviceTitleEl = deps.selectedDeviceTitleEl;
  _historyTableBody = deps.historyTableBody;
  _sideDeviceInfoEl = deps.sideDeviceInfoEl;
  _gapTooltipEl = deps.gapTooltipEl;
  _globalMessageEl = deps.globalMessageEl;
}

export async function loadDeviceHistory(deviceId, fromIso, toIsoValue, loadOptions) {
  var endpoint = "/api/devices/" + deviceId + "/history";
  var nowMs = Date.now();
  var options = loadOptions || {};

  if (fromIso && toIsoValue) {
    var requestedFromMs = new Date(fromIso).getTime();
    var requestedToMs = new Date(toIsoValue).getTime();
    if (!Number.isFinite(requestedFromMs) || !Number.isFinite(requestedToMs) || requestedToMs <= requestedFromMs) {
      throw new Error("Invalid time range");
    }

    var effectiveToMs = Math.min(requestedToMs, nowMs);
    var effectiveFromMs = requestedFromMs;
    var clampedByNow = effectiveToMs !== requestedToMs;

    if (effectiveToMs - effectiveFromMs > MAX_LOAD_WINDOW_MS) {
      effectiveFromMs = effectiveToMs - MAX_LOAD_WINDOW_MS;
    }

    if (!(effectiveToMs > effectiveFromMs)) {
      throw new Error("Requested range is outside the allowed window.");
    }

    var effectiveFromIso = formatNaiveDateTimeMs(effectiveFromMs, true);
    var effectiveToIso = formatNaiveDateTimeMs(effectiveToMs, true);

    if (effectiveFromMs !== requestedFromMs || clampedByNow) {
      setGlobalMessage(_globalMessageEl, "تم تقييد النطاق إلى 24 ساعة كحد أقصى وحتى الوقت الحالي.", false);
    }

    endpoint += "?from=" + encodeURIComponent(effectiveFromIso) + "&to=" + encodeURIComponent(effectiveToIso);
    state.activeRangeMode = "custom";
    state.activeFromIso = effectiveFromIso;
    state.activeToIso = effectiveToIso;
    state.viewportFromMs = effectiveFromMs;
    state.viewportToMs = effectiveToMs;
    state.followLatest24 = false;
    state.liveFollowEnabled = false;
    state.liveManualBrowseActive = false;
  } else {
    var liveWindowMs = Number(options.liveWindowMs);
    if (!Number.isFinite(liveWindowMs) || liveWindowMs <= 0) {
      liveWindowMs = state.currentLiveWindowMs;
    }
    if (!Number.isFinite(liveWindowMs) || liveWindowMs <= 0) {
      liveWindowMs = DEFAULT_LIVE_WINDOW_MS;
    }

    state.currentLiveWindowMs = liveWindowMs;
    state.LIVE_WINDOW_LABEL = state.currentLiveWindowMs === ONE_HOUR_WINDOW_MS ? "آخر ساعة" : "آخر 30 دقيقة";
    state.activeRangeMode =
      typeof options.modeLabel === "string" && options.modeLabel.trim().length > 0
        ? options.modeLabel.trim()
        : state.currentLiveWindowMs === ONE_HOUR_WINDOW_MS
          ? "latest1h"
          : "latest30m";
    var latestToMs = nowMs;
    var latestFromMs = latestToMs - state.currentLiveWindowMs;
    state.activeFromIso = formatNaiveDateTimeMs(latestFromMs, true);
    state.activeToIso = formatNaiveDateTimeMs(latestToMs, true);
    state.followLatest24 = true;
    state.liveFollowEnabled = true;
    state.liveManualBrowseActive = false;
    state.viewportFromMs = latestFromMs;
    state.viewportToMs = latestToMs;
    endpoint += "?from=" + encodeURIComponent(state.activeFromIso) + "&to=" + encodeURIComponent(state.activeToIso);
  }

  var loadSequence = state.historyLoadSequence + 1;
  state.historyLoadSequence = loadSequence;
  state.isHistoryLoading = true;
  state.pendingLivePackets = [];

  state.currentPackets = [];
  rebuildPacketKeySet();
  state.lastRenderMeta = null;
  _gapTooltipEl.classList.add("hidden");
  _historyInfoEl.textContent = "جاري تحميل بيانات الجهاز المحدد...";
  _historyTableBody.innerHTML = "";
  _setSpectrogramLoading(true);

  try {
    var snapshotPackets = await apiRequest(endpoint);
    if (loadSequence !== state.historyLoadSequence) {
      return;
    }

    state.currentPackets = decodePacketsMatrix(snapshotPackets);
    state.currentPackets.forEach(normalizePacketTiming);
    state.activeTimeStepMs = 1000;
    rebuildPacketKeySet();

    if (state.pendingLivePackets.length > 0) {
      var mergedCount = 0;
      for (var p = 0; p < state.pendingLivePackets.length; p += 1) {
        if (insertPacketSorted(state.pendingLivePackets[p])) {
          mergedCount += 1;
        }
      }
      if (mergedCount > 0) {
        state.expectingLiveRender = true;
        markLiveTrace("merged-from-buffer", { count: mergedCount });
      }
    }
    state.pendingLivePackets = [];

    if (state.activeRangeMode === "latest1h" || state.activeRangeMode === "latest30m") {
      state.followLatest24 = true;
      state.liveFollowEnabled = true;
      state.liveManualBrowseActive = false;
    }

    if (!state.currentPackets.length) {
      _historyInfoEl.textContent = "لا توجد بيانات للجهاز المحدد.";
      _selectedDeviceTitleEl.textContent = "الجهاز المحدد: " + state.selectedDeviceName + " (لا توجد بيانات)";
      _sideDeviceInfoEl.textContent =
        "المعرّف: " +
        state.selectedDeviceId +
        " | الاسم: " +
        state.selectedDeviceName +
        " | الوصف: " +
        "لا توجد سجلات تاريخية لهذا الجهاز.";
      _scheduleRender({ skipTable: false });
      return;
    }

    _scheduleRender({ skipTable: false });
  } finally {
    if (loadSequence === state.historyLoadSequence) {
      state.isHistoryLoading = false;
    }
    _setSpectrogramLoading(false);
  }
}

export async function loadRecentHours(hours, label) {
  if (!state.selectedDeviceId) {
    setGlobalMessage(_globalMessageEl, "يرجى اختيار جهاز أولًا", true);
    return;
  }

  var range = getRecentRangeIso(hours);
  await loadDeviceHistory(state.selectedDeviceId, range.fromIso, range.toIso);
  setGlobalMessage(_globalMessageEl, (label || "Recent range") + " loaded for " + state.selectedDeviceName, false);
}

export async function loadLatestPacketOnly() {
  if (!state.selectedDeviceId) {
    setGlobalMessage(_globalMessageEl, "يرجى اختيار جهاز أولًا", true);
    return;
  }

  var latestPacket;
  try {
    latestPacket = await apiRequest("/api/devices/" + state.selectedDeviceId + "/history/latest");
  } catch (error) {
    var message = error instanceof Error ? error.message : "فشل تحميل آخر باكت";
    if (message === "No packets found for this device") {
      setGlobalMessage(_globalMessageEl, "لا توجد باكتات لهذا الجهاز حتى الآن", true);
      return;
    }
    throw error;
  }

  if (!latestPacket || typeof latestPacket !== "object") {
    setGlobalMessage(_globalMessageEl, "تعذر تحميل آخر باكت", true);
    return;
  }

  decodePacketMatrix(latestPacket);
  normalizePacketTiming(latestPacket);
  var latestStartMs = getPacketStartMs(latestPacket);
  var latestEndMs = getPacketEndMs(latestPacket);
  if (!Number.isFinite(latestStartMs)) {
    latestStartMs = getPacketTimestampMs(latestPacket);
  }
  if (!Number.isFinite(latestEndMs)) {
    latestEndMs = latestStartMs;
  }

  if (!Number.isFinite(latestStartMs)) {
    setGlobalMessage(_globalMessageEl, "تعذر تحديد وقت آخر باكت", true);
    return;
  }

  state.currentPackets = [latestPacket];
  rebuildPacketKeySet();

  var effectiveEnd = Number.isFinite(latestEndMs) && latestEndMs > latestStartMs ? latestEndMs : latestStartMs + 1000;
  state.activeRangeMode = "lastPacket";
  state.followLatest24 = false;
  state.liveFollowEnabled = false;
  state.liveManualBrowseActive = false;
  state.viewportFromMs = latestStartMs;
  state.viewportToMs = effectiveEnd;
  state.activeFromIso = formatNaiveDateTimeMs(state.viewportFromMs, true);
  state.activeToIso = formatNaiveDateTimeMs(state.viewportToMs, true);
  _scheduleRender({ skipTable: false });
  setGlobalMessage(_globalMessageEl, "تم التركيز على آخر باكت.", false);
}