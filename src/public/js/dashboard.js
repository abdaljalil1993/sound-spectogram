import { DEFAULT_LIVE_WINDOW_MS, ONE_HOUR_WINDOW_MS, MAX_LOAD_WINDOW_MS, MAX_PACKETS_IN_MEMORY } from "./dashboard/constants.js";
import { formatNaiveDateTimeMs, formatDateOnly, formatTimeOnly, formatLocalDateTime, normalizeNaiveDateTimeString, normalizeAnyDateTimeString, parseFlexibleTimeMs, parseOptionalNumberInput, toIso, buildSameDayRange, magnitudeToDb, formatDbValue } from "./dashboard/utils.js";
import { isCompressedMatrixPayload, decodeCompressedMatrixPayload, decodePacketMatrix, decodePacketsMatrix } from "./dashboard/packet-codec.js";
import { ensureLiveTraceElement, renderLiveTraceStatus, markLiveTrace } from "./dashboard/live-trace.js";
import { setGlobalMessage, setProcessingStatus, updateFollowLiveButtonState, setActiveDevice } from "./dashboard/ui-status.js";
import { apiRequest } from "./dashboard/api.js";
import { state } from "./dashboard/state.js";
import { initAuth } from "./dashboard/auth.js";
import { initTabs, activateTab } from "./dashboard/tabs.js";
import { initHistoryApi, loadDeviceHistory, loadRecentHours, loadLatestPacketOnly } from "./dashboard/history-api.js";
import { initDeviceManagement, loadDevices, resetDeviceForm } from "./dashboard/device-management.js";
import { initUserManagement, loadUsers, resetUserForm } from "./dashboard/user-management.js";
import { initSocket, setupSocket } from "./dashboard/socket.js";
import { initCanvasInteraction } from "./dashboard/canvas-interaction.js";
import { initSettings, parseBoolInput, parseDisplayFrequencyRange, applyFrequencyRangeFilter, clearFrequencyRangeFilter, updateIntensityControlsState, applyNoiseSettings, applyIntensitySettings, applyDisplayGainSettings, updateColorMapButtonLabel, applyColorMap, toggleColorMap } from "./dashboard/settings.js";
import { normalizeFrequencyBins, getPacketFrequencyBins, getPacketStartMs, getPacketEndMs, getPacketTimestampMs, normalizePacketTiming, getPacketKey, getPacketInterval, getPacketValueAt } from "./dashboard/packet-timing.js";
import { rebuildPacketKeySet, insertPacketSorted, getLatestPacketEndMs, getVisiblePackets, findFirstVisiblePacketIndex, findLastVisiblePacketIndex, getInitialLoadRangeIso, getRecentRangeIso } from "./dashboard/packet-store.js";
import { initViewport, syncLatestLiveViewport, resetViewport, fitViewportToPackets } from "./dashboard/viewport.js";
import { initTimeMarkers, formatMarkerLabelTime, drawTimeMarkersOverlay } from "./dashboard/time-markers.js";
import { initProbe, findProbeSample, getProbeFrequencyHz } from "./dashboard/probe.js";

(function () {
  var topNav = document.getElementById("topNav");
  var tabButtons = document.querySelectorAll(".tab-btn");
  var historyPanel = document.getElementById("historyPanel");
  var usersPanel = document.getElementById("usersPanel");
  var devicesPanel = document.getElementById("devicesPanel");
  var globalMessageEl = document.getElementById("globalMessage");
  var userBadgeEl = document.getElementById("userBadge");
  var socketStatusBadgeEl = document.getElementById("socketStatusBadge");

  var deviceListEl = document.getElementById("deviceList");
  var selectedDeviceTitleEl = document.getElementById("selectedDeviceTitle");
  var historyInfoEl = document.getElementById("historyInfo");
  var historyTableBody = document.getElementById("historyTableBody");
  var sideDeviceInfoEl = document.getElementById("sideDeviceInfo");
  var processingStatusEl = document.getElementById("processingStatus");
  var canvas = document.getElementById("spectrogramCanvas");
  var spectrogramLoaderEl = document.getElementById("spectrogramLoader");
  var legendCanvas = document.getElementById("spectrogramLegend");
  var gapTooltipEl = document.getElementById("gapTooltip");
  var probeTooltipEl = document.getElementById("probeTooltip");
  var historyRangeForm = document.getElementById("historyRangeForm");
  var latest24Btn = document.getElementById("latest24Btn");
  var latest5hBtn = document.getElementById("latest5hBtn");
  var latest24hBtn = document.getElementById("latest24hBtn");
  var latestPacketBtn = document.getElementById("latestPacketBtn");
  var resetViewBtn = document.getElementById("resetViewBtn");
  var clearMarkersBtn = document.getElementById("clearMarkersBtn");
  var panLeftBtn = document.getElementById("panLeftBtn");
  var panRightBtn = document.getElementById("panRightBtn");
  var zoomInBtn = document.getElementById("zoomInBtn");
  var zoomOutBtn = document.getElementById("zoomOutBtn");
  var fitPacketsBtn = document.getElementById("fitPacketsBtn");
  var colorMapBtn = document.getElementById("colorMapBtn");
  var followLiveBtn = document.getElementById("followLiveBtn");
  var displayGainInput = document.getElementById("displayGainInput");
  var displayGainValue = document.getElementById("displayGainValue");
  var freqMinInput = document.getElementById("freqMinInput");
  var freqMaxInput = document.getElementById("freqMaxInput");
  var applyFreqRangeBtn = document.getElementById("applyFreqRangeBtn");
  var clearFreqRangeBtn = document.getElementById("clearFreqRangeBtn");
  var intensityModeSelect = document.getElementById("intensityModeSelect");
  var dbMinInput = document.getElementById("dbMinInput");
  var dbMaxInput = document.getElementById("dbMaxInput");
  var pctLowInput = document.getElementById("pctLowInput");
  var pctHighInput = document.getElementById("pctHighInput");
  var applyIntensityBtn = document.getElementById("applyIntensityBtn");
  var compareViewSelect = document.getElementById("compareViewSelect");
  var noiseSuppressionEnabledInput = document.getElementById("noiseSuppressionEnabledInput");
  var noiseFloorPercentileInput = document.getElementById("noiseFloorPercentileInput");
  var noiseThresholdInput = document.getElementById("noiseThresholdInput");
  var isolatedPixelRemovalEnabledInput = document.getElementById("isolatedPixelRemovalEnabledInput");
  var minActiveNeighborsInput = document.getElementById("minActiveNeighborsInput");
  var neighborhoodSizeSelect = document.getElementById("neighborhoodSizeSelect");
  var bucketAggregationSelect = document.getElementById("bucketAggregationSelect");
  var debugStatsEnabledInput = document.getElementById("debugStatsEnabledInput");
  var applyNoiseBtn = document.getElementById("applyNoiseBtn");

  var usersTableBody = document.getElementById("usersTableBody");
  var userForm = document.getElementById("userForm");
  var userIdInput = document.getElementById("userId");
  var userNameInput = document.getElementById("userName");
  var userUsernameInput = document.getElementById("userUsername");
  var userPasswordInput = document.getElementById("userPassword");
  var userRoleInput = document.getElementById("userRole");
  var userSaveBtn = document.getElementById("userSaveBtn");
  var userCancelBtn = document.getElementById("userCancelBtn");
  var userFormMessage = document.getElementById("userFormMessage");

  var devicesTableBody = document.getElementById("devicesTableBody");
  var deviceForm = document.getElementById("deviceForm");
  var deviceIdInput = document.getElementById("deviceId");
  var deviceNameInput = document.getElementById("deviceName");
  var deviceDescriptionInput = document.getElementById("deviceDescription");
  var deviceMinFrequencyInput = document.getElementById("deviceMinFrequency");
  var deviceMaxFrequencyInput = document.getElementById("deviceMaxFrequency");
  var deviceSaveBtn = document.getElementById("deviceSaveBtn");
  var deviceCancelBtn = document.getElementById("deviceCancelBtn");
  var deviceFormMessage = document.getElementById("deviceFormMessage");

  var logoutBtn = document.getElementById("logoutBtn");

  if (
    !topNav ||
    !historyPanel ||
    !usersPanel ||
    !devicesPanel ||
    !globalMessageEl ||
    !userBadgeEl ||
    !socketStatusBadgeEl ||
    !deviceListEl ||
    !selectedDeviceTitleEl ||
    !historyInfoEl ||
    !historyTableBody ||
    !sideDeviceInfoEl ||
    !processingStatusEl ||
    !canvas ||
    !spectrogramLoaderEl ||
    !legendCanvas ||
    !gapTooltipEl ||
    !probeTooltipEl ||
    !historyRangeForm ||
    !latest24Btn ||
    !latest5hBtn ||
    !latest24hBtn ||
    !latestPacketBtn ||
    !resetViewBtn ||
    !clearMarkersBtn ||
    !panLeftBtn ||
    !panRightBtn ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !fitPacketsBtn ||
    !colorMapBtn ||
    !followLiveBtn ||
    !displayGainInput ||
    !displayGainValue ||
    !freqMinInput ||
    !freqMaxInput ||
    !applyFreqRangeBtn ||
    !clearFreqRangeBtn ||
    !intensityModeSelect ||
    !dbMinInput ||
    !dbMaxInput ||
    !pctLowInput ||
    !pctHighInput ||
    !applyIntensityBtn ||
    !compareViewSelect ||
    !noiseSuppressionEnabledInput ||
    !noiseFloorPercentileInput ||
    !noiseThresholdInput ||
    !isolatedPixelRemovalEnabledInput ||
    !minActiveNeighborsInput ||
    !neighborhoodSizeSelect ||
    !bucketAggregationSelect ||
    !debugStatsEnabledInput ||
    !applyNoiseBtn ||
    !usersTableBody ||
    !userForm ||
    !userIdInput ||
    !userNameInput ||
    !userUsernameInput ||
    !userPasswordInput ||
    !userRoleInput ||
    !userSaveBtn ||
    !userCancelBtn ||
    !userFormMessage ||
    !devicesTableBody ||
    !deviceForm ||
    !deviceIdInput ||
    !deviceNameInput ||
    !deviceDescriptionInput ||
    !deviceMinFrequencyInput ||
    !deviceMaxFrequencyInput ||
    !deviceSaveBtn ||
    !deviceCancelBtn ||
    !deviceFormMessage ||
    !logoutBtn
  ) {
    return;
  }

  if (!initAuth(userBadgeEl, logoutBtn)) {
    return;
  }

  var renderRafId = null;
  var pendingRenderOptions = null;
  var interactionEndTimer = null;
  var liveTraceEl = null;
  var liveTraceCounters = {
    received: 0,
    matched: 0,
    buffered: 0,
    inserted: 0,
    duplicates: 0,
    rendered: 0,
    droppedByDevice: 0,
    droppedByTime: 0,
    mergedFromBuffer: 0,
    lastStage: "init",
    lastPacketIso: "-",
    lastRenderIso: "-",
    lastIssue: ""
  };

  function setSpectrogramLoading(isLoading) {
    spectrogramLoaderEl.classList.toggle("hidden", !isLoading);
    canvas.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  function normalizeDeviceKey(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim().toLowerCase();
  }

  function payloadMatchesSelectedDevice(payload) {
    if (!payload || !state.selectedDeviceId) {
      return false;
    }

    if (Number(payload.deviceId) === Number(state.selectedDeviceId)) {
      return true;
    }

    var sourceKey = normalizeDeviceKey(payload.sourceDeviceId);
    if (sourceKey && sourceKey === state.selectedDeviceKey) {
      return true;
    }

    var nameKey = normalizeDeviceKey(payload.deviceName);
    if (nameKey && nameKey === state.selectedDeviceKey) {
      return true;
    }

    return false;
  }

  function renderLatestPacket(options) {
    var renderOptions = options || {};
    updateFollowLiveButtonState(followLiveBtn, state.liveFollowEnabled);
    probeTooltipEl.classList.add("hidden");
    if (!state.currentPackets.length) {
      historyInfoEl.textContent = "لا توجد بيانات للجهاز المحدد.";
      historyTableBody.innerHTML = "";
      state.lastRenderMeta = null;
      state.renderedTimeMarkerHits = [];
      gapTooltipEl.classList.add("hidden");
      clearSpectrogramCanvas("لا توجد بيانات للجهاز المحدد.");
      return;
    }

    var fromMs;
    var toMs;
    if (state.liveFollowEnabled && !state.liveManualBrowseActive) {
      syncLatestLiveViewport();
      toMs = state.viewportToMs;
      fromMs = state.viewportFromMs;

      // Keep only recent packets in memory for the rolling live view window.
      state.currentPackets = state.currentPackets.filter(function (packet) {
        var packetEnd = getPacketEndMs(packet);
        return Number.isFinite(packetEnd) && packetEnd >= fromMs;
      });
    } else if (Number.isFinite(state.viewportFromMs) && Number.isFinite(state.viewportToMs)) {
      fromMs = state.viewportFromMs;
      toMs = state.viewportToMs;
    } else {
      fromMs = parseFlexibleTimeMs(state.activeFromIso);
      toMs = parseFlexibleTimeMs(state.activeToIso);
      state.viewportFromMs = fromMs;
      state.viewportToMs = toMs;
    }

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      state.lastRenderMeta = null;
      state.renderedTimeMarkerHits = [];
      gapTooltipEl.classList.add("hidden");
      clearSpectrogramCanvas("لا توجد بيانات للجهاز المحدد.");
      return;
    }

    var visiblePackets = getVisiblePackets(fromMs, toMs);
    var displayFrequencyRange = parseDisplayFrequencyRange();

    var minFrequency = null;
    var maxFrequency = null;
    var frequencyBins = null;
    var intensityType = null;
    for (var i = 0; i < visiblePackets.length; i += 1) {
      var packet = visiblePackets[i];
      if (!intensityType && typeof packet.intensityType === "string") {
        intensityType = packet.intensityType;
      }
      var packetBins = getPacketFrequencyBins(packet);
      if (packetBins && packetBins.length > 1) {
        frequencyBins = packetBins;
        minFrequency = packetBins[0];
        maxFrequency = packetBins[packetBins.length - 1];
        if (maxFrequency > minFrequency) {
          break;
        }
      }

      if (
        Number.isFinite(packet.minFrequency) &&
        Number.isFinite(packet.maxFrequency) &&
        packet.maxFrequency > packet.minFrequency
      ) {
        minFrequency = packet.minFrequency;
        maxFrequency = packet.maxFrequency;
        break;
      }
      if (
        Number.isFinite(packet.frequencyMin) &&
        Number.isFinite(packet.frequencyMax) &&
        packet.frequencyMax > packet.frequencyMin
      ) {
        minFrequency = packet.frequencyMin;
        maxFrequency = packet.frequencyMax;
        break;
      }

      var packetSampleRate = Number(packet.sampleRate || packet.sample_rate);
      if (Number.isFinite(packetSampleRate) && packetSampleRate > 0) {
        minFrequency = 0;
        maxFrequency = packetSampleRate / 2;
        break;
      }
    }

    if (
      (!Number.isFinite(minFrequency) || !Number.isFinite(maxFrequency) || maxFrequency <= minFrequency) &&
      Number.isFinite(state.selectedDeviceMinFrequency) &&
      Number.isFinite(state.selectedDeviceMaxFrequency) &&
      state.selectedDeviceMaxFrequency > state.selectedDeviceMinFrequency
    ) {
      minFrequency = state.selectedDeviceMinFrequency;
      maxFrequency = state.selectedDeviceMaxFrequency;
    }

    var renderResult = window.Spectrogram.renderSpectrogram({
      canvas: canvas,
      legendCanvas: legendCanvas,
      blocks: visiblePackets,
      from: formatNaiveDateTimeMs(fromMs, true),
      to: formatNaiveDateTimeMs(toMs, true),
      fastMode: !!renderOptions.skipTable,
      assumeSorted: true,
      intensityMode: state.activeIntensityMode,
      dbMin: state.activeDbMin,
      dbMax: state.activeDbMax,
      percentileLow: state.activePercentileLow,
      percentileHigh: state.activePercentileHigh,
      compareView: state.activeCompareView,
      noiseSuppressionEnabled: state.activeNoiseSuppressionEnabled,
      noiseFloorPercentile: state.activeNoiseFloorPercentile,
      noiseThreshold: state.activeNoiseThreshold,
      isolatedPixelRemovalEnabled: state.activeIsolatedPixelRemovalEnabled,
      minActiveNeighbors: state.activeMinActiveNeighbors,
      neighborhoodSize: state.activeNeighborhoodSize,
      bucketAggregation: state.activeBucketAggregation,
      debugStatsEnabled: state.activeDebugStatsEnabled,
      intensityType: intensityType,
      displayGainDb: state.activeDisplayGainDb,
      frequencyBins: frequencyBins,
      minFrequency: minFrequency,
      maxFrequency: maxFrequency,
      displayMinFrequency: displayFrequencyRange ? displayFrequencyRange.min : null,
      displayMaxFrequency: displayFrequencyRange ? displayFrequencyRange.max : null
    });
    state.lastRenderMeta = renderResult || null;
    drawTimeMarkersOverlay();

    if (renderResult) {
      var selectedScaleText = state.activeIntensityMode;
      var effectiveScaleText = renderResult.intensityMode || state.activeIntensityMode;
      var selectedViewText = state.activeCompareView;
      var effectiveViewText = renderResult.compareView || state.activeCompareView;
      var infoText =
        "المقياس المختار: " +
        selectedScaleText +
        " | الفعلي: " +
        effectiveScaleText +
        " | العرض المختار: " +
        selectedViewText +
        " | الفعلي: " +
        effectiveViewText +
        " | نوع الشدة: " +
        (renderResult.intensityType || "صورة");

      var isScaleFallback = selectedScaleText !== effectiveScaleText;
      if (isScaleFallback) {
        infoText += " | ملاحظة: أنماط dB تُتجاهل عند إدخال شدة من نوع صورة";
      }
      setProcessingStatus(processingStatusEl, infoText, isScaleFallback);
    }

    var gapInfo = " | الفجوات: 0";
    if (renderResult && Array.isArray(renderResult.gaps) && renderResult.gaps.length > 0) {
      var firstGap = renderResult.gaps[0];
      var mins = Math.round(firstGap.durationMs / 60000);
      gapInfo =
        " | الفجوات: " +
        renderResult.gaps.length +
        " (الأولى: " +
        formatLocalDateTime(firstGap.start) +
        " -> " +
        formatLocalDateTime(firstGap.end) +
        ", " +
        mins +
        "د)";
    }

    if (displayFrequencyRange) {
      historyInfoEl.textContent +=
        " | التردد العمودي: " +
        Math.round(displayFrequencyRange.min) +
        "-" +
        Math.round(displayFrequencyRange.max) +
        " Hz";
    }

    if (renderOptions.skipTable) {
      return;
    }

    if (renderResult && renderResult.hasRealFrequency) {
      historyInfoEl.textContent = historyInfoEl.textContent + " | محور التردد: Hz";
    } else {
      historyInfoEl.textContent = historyInfoEl.textContent + " | محور التردد: نطاقات فقط (أضف sampleRate / minFrequency / maxFrequency لعرض Hz)";
    }

    if (state.activeDebugStatsEnabled && renderResult && renderResult.debugStats) {
      var s = renderResult.debugStats;
      historyInfoEl.textContent =
        historyInfoEl.textContent +
        " | Stage=" +
        (renderResult.compareView || state.activeCompareView) +
        " | min=" +
        s.min.toFixed(4) +
        " max=" +
        s.max.toFixed(4) +
        " mean=" +
        s.mean.toFixed(4) +
        " median=" +
        s.median.toFixed(4) +
        " p50=" +
        s.p50.toFixed(4) +
        " p75=" +
        s.p75.toFixed(4) +
        " p90=" +
        s.p90.toFixed(4) +
        " p95=" +
        s.p95.toFixed(4) +
        " p99=" +
        s.p99.toFixed(4) +
        " thr=" +
        s.selectedNoiseThreshold.toFixed(4) +
        " removed=" +
        s.removedPercent.toFixed(2) +
        "%";
    }

    historyTableBody.innerHTML = "";
    visiblePackets.forEach(function (packet) {
      var startLocal = formatLocalDateTime(packet.startTime || packet.start_time || packet.timestamp);
      var endLocal = formatLocalDateTime(packet.endTime || packet.end_time || packet.timestamp);
      var durationMin = Math.max(
        0,
        Math.round(
          (getPacketEndMs(packet) - getPacketStartMs(packet)) / 60000
        )
      );

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        (packet.id || "-") +
        "</td><td>" +
        startLocal +
        "</td><td>" +
        endLocal +
        "</td><td>" +
        durationMin +
        " د" +
        "</td>";
      historyTableBody.appendChild(tr);
    });
  }

  function scheduleRender(options) {
    pendingRenderOptions = Object.assign({}, pendingRenderOptions || {}, options || {});
    if (renderRafId !== null) {
      return;
    }

    renderRafId = window.requestAnimationFrame(function () {
      renderRafId = null;
      var opts = pendingRenderOptions || {};
      pendingRenderOptions = null;
      renderLatestPacket(opts);
      if (state.expectingLiveRender) {
        state.expectingLiveRender = false;
        markLiveTrace("rendered", { renderAtMs: Date.now() });
      }
    });
  }

  function markInteractionActive() {
    if (interactionEndTimer) {
      clearTimeout(interactionEndTimer);
    }

    interactionEndTimer = setTimeout(function () {
      interactionEndTimer = null;
      scheduleRender({ skipTable: false });
    }, 130);
  }

  function clearSpectrogramCanvas(message) {
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    var dpr = window.devicePixelRatio || 1;
    var cssWidth = Math.max(480, Math.floor(canvas.clientWidth || 960));
    var cssHeight = Math.max(320, Math.floor((canvas.clientWidth || 960) * 0.43));
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#140d28";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (message) {
      ctx.fillStyle = "#d8e2ff";
      ctx.font = "16px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, cssWidth / 2, cssHeight / 2);
    }

      window.Spectrogram.drawLegend(legendCanvas);
  }

  historyRangeForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.selectedDeviceId) {
      setGlobalMessage(globalMessageEl, "يرجى اختيار جهاز أولًا", true);
      return;
    }

    var queryDateInput = document.getElementById("queryDate");
    var fromTimeInput = document.getElementById("fromTime");
    var toTimeInput = document.getElementById("toTime");
    if (
      !(queryDateInput instanceof HTMLInputElement) ||
      !(fromTimeInput instanceof HTMLInputElement) ||
      !(toTimeInput instanceof HTMLInputElement)
    ) {
      return;
    }

    if (!queryDateInput.value || !fromTimeInput.value || !toTimeInput.value) {
      setGlobalMessage(globalMessageEl, "اليوم ووقت البداية ووقت النهاية حقول مطلوبة", true);
      return;
    }

    try {
      var range = buildSameDayRange(queryDateInput.value, fromTimeInput.value, toTimeInput.value);

      await loadDeviceHistory(state.selectedDeviceId, toIso(range.fromLocal), toIso(range.toLocal));
      setGlobalMessage(globalMessageEl, "تم تحميل سجل النطاق للجهاز " + state.selectedDeviceName, false);
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل السجل", true);
    }
  });

  latest24Btn.addEventListener("click", async function () {
    if (!state.selectedDeviceId) {
      setGlobalMessage(globalMessageEl, "يرجى اختيار جهاز أولًا", true);
      return;
    }

    try {
      await loadDeviceHistory(state.selectedDeviceId, null, null, {
        liveWindowMs: ONE_HOUR_WINDOW_MS,
        modeLabel: "latest1h"
      });
      setGlobalMessage(globalMessageEl, "تم تحميل البث المباشر لآخر ساعة للجهاز " + state.selectedDeviceName, false);
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل السجل", true);
    }
  });

  latest5hBtn.addEventListener("click", async function () {
    try {
      await loadRecentHours(5, "آخر 5 ساعات");
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل السجل", true);
    }
  });

  latest24hBtn.addEventListener("click", async function () {
    try {
      await loadRecentHours(24, "آخر 24 ساعة");
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل السجل", true);
    }
  });

  latestPacketBtn.addEventListener("click", async function () {
    try {
      await loadLatestPacketOnly();
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل تحميل آخر باكت", true);
    }
  });

  resetViewBtn.addEventListener("click", function () {
    resetViewport();
  });

  clearMarkersBtn.addEventListener("click", function () {
    if (!state.timeMarkers.length) {
      return;
    }

    state.timeMarkers = [];
    state.renderedTimeMarkerHits = [];
    scheduleRender({ skipTable: true });
  });

  fitPacketsBtn.addEventListener("click", function () {
    fitViewportToPackets();
  });

  colorMapBtn.addEventListener("click", function () {
    toggleColorMap();
  });

  followLiveBtn.addEventListener("click", async function () {
    if (!state.selectedDeviceId) {
      return;
    }
    await loadDeviceHistory(state.selectedDeviceId, null, null, {
      liveWindowMs: DEFAULT_LIVE_WINDOW_MS,
      modeLabel: "latest30m"
    });
    updateFollowLiveButtonState(followLiveBtn, state.liveFollowEnabled);
  });

  applyIntensityBtn.addEventListener("click", function () {
    applyIntensitySettings();
  });

  applyFreqRangeBtn.addEventListener("click", applyFrequencyRangeFilter);
  clearFreqRangeBtn.addEventListener("click", clearFrequencyRangeFilter);
  freqMinInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      applyFrequencyRangeFilter();
    }
  });
  freqMaxInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      applyFrequencyRangeFilter();
    }
  });

  intensityModeSelect.addEventListener("change", function () {
    applyIntensitySettings();
  });

  displayGainInput.addEventListener("input", function () {
    applyDisplayGainSettings();
  });
  displayGainInput.addEventListener("change", function () {
    applyDisplayGainSettings();
  });

  [dbMinInput, dbMaxInput, pctLowInput, pctHighInput].forEach(function (inputEl) {
    inputEl.addEventListener("change", function () {
      applyIntensitySettings();
    });
  });

  applyNoiseBtn.addEventListener("click", function () {
    applyNoiseSettings();
  });

  [
    compareViewSelect,
    noiseSuppressionEnabledInput,
    noiseFloorPercentileInput,
    noiseThresholdInput,
    isolatedPixelRemovalEnabledInput,
    minActiveNeighborsInput,
    neighborhoodSizeSelect,
    bucketAggregationSelect,
    debugStatsEnabledInput
  ].forEach(function (el) {
    el.addEventListener("change", function () {
      applyNoiseSettings();
    });
  });

  initCanvasInteraction({
    scheduleRender: scheduleRender,
    markInteractionActive: markInteractionActive,
    canvas: canvas,
    probeTooltipEl: probeTooltipEl,
    gapTooltipEl: gapTooltipEl,
    panLeftBtn: panLeftBtn,
    panRightBtn: panRightBtn,
    zoomInBtn: zoomInBtn,
    zoomOutBtn: zoomOutBtn,
    setGlobalMessage: setGlobalMessage,
    globalMessageEl: globalMessageEl
  });

  var queryDateInput = document.getElementById("queryDate");
  var fromTimeInput = document.getElementById("fromTime");
  var toTimeInput = document.getElementById("toTime");
  if (
    queryDateInput instanceof HTMLInputElement &&
    fromTimeInput instanceof HTMLInputElement &&
    toTimeInput instanceof HTMLInputElement
  ) {
    var now = new Date();
    var fromDate = new Date(now.getTime() - 30 * 60 * 1000);
    queryDateInput.value = formatDateOnly(now);
    fromTimeInput.value = formatTimeOnly(fromDate);
    toTimeInput.value = formatTimeOnly(now);
  }

  initUserManagement({
    usersTableBody: usersTableBody,
    userForm: userForm,
    userIdInput: userIdInput,
    userNameInput: userNameInput,
    userUsernameInput: userUsernameInput,
    userPasswordInput: userPasswordInput,
    userRoleInput: userRoleInput,
    userSaveBtn: userSaveBtn,
    userCancelBtn: userCancelBtn,
    userFormMessage: userFormMessage,
    globalMessageEl: globalMessageEl
  });

  loadDevices().catch(function (error) {
    setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "Failed to load devices", true);
  });

  if (state.isAdmin) {
    loadUsers().catch(function (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "Failed to load users", true);
    });
  }

  if (!state.isAdmin) {
    userFormMessage.textContent = "Only admin can add, edit, or delete users.";
    deviceFormMessage.textContent = "Only admin can add, edit, or delete devices.";
    tabButtons.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === "users") {
        btn.classList.add("hidden");
      }
    });
    if (usersPanel.classList.contains("active")) {
      activateTab("history");
    }
  }

  window.addEventListener("resize", function () {
    scheduleRender({ skipTable: false });
  });

  initSettings({
    scheduleRender: scheduleRender,
    setGlobalMessage: setGlobalMessage,
    globalMessageEl: globalMessageEl,
    colorMapBtn: colorMapBtn,
    displayGainInput: displayGainInput,
    displayGainValue: displayGainValue,
    freqMinInput: freqMinInput,
    freqMaxInput: freqMaxInput,
    intensityModeSelect: intensityModeSelect,
    dbMinInput: dbMinInput,
    dbMaxInput: dbMaxInput,
    pctLowInput: pctLowInput,
    pctHighInput: pctHighInput,
    compareViewSelect: compareViewSelect,
    noiseSuppressionEnabledInput: noiseSuppressionEnabledInput,
    noiseFloorPercentileInput: noiseFloorPercentileInput,
    noiseThresholdInput: noiseThresholdInput,
    isolatedPixelRemovalEnabledInput: isolatedPixelRemovalEnabledInput,
    minActiveNeighborsInput: minActiveNeighborsInput,
    neighborhoodSizeSelect: neighborhoodSizeSelect,
    bucketAggregationSelect: bucketAggregationSelect,
    debugStatsEnabledInput: debugStatsEnabledInput
  });

  initViewport({
    scheduleRender: scheduleRender,
    markInteractionActive: markInteractionActive
  });

  initTimeMarkers({
    canvas: canvas,
    scheduleRender: scheduleRender
  });

  initProbe({
    canvas: canvas
  });

  initHistoryApi({
    scheduleRender: scheduleRender,
    setSpectrogramLoading: setSpectrogramLoading,
    historyInfoEl: historyInfoEl,
    selectedDeviceTitleEl: selectedDeviceTitleEl,
    historyTableBody: historyTableBody,
    sideDeviceInfoEl: sideDeviceInfoEl,
    gapTooltipEl: gapTooltipEl,
    globalMessageEl: globalMessageEl
  });

  initDeviceManagement({
    deviceListEl: deviceListEl,
    devicesTableBody: devicesTableBody,
    deviceForm: deviceForm,
    deviceIdInput: deviceIdInput,
    deviceNameInput: deviceNameInput,
    deviceDescriptionInput: deviceDescriptionInput,
    deviceMinFrequencyInput: deviceMinFrequencyInput,
    deviceMaxFrequencyInput: deviceMaxFrequencyInput,
    deviceSaveBtn: deviceSaveBtn,
    deviceCancelBtn: deviceCancelBtn,
    deviceFormMessage: deviceFormMessage,
    selectedDeviceTitleEl: selectedDeviceTitleEl,
    historyInfoEl: historyInfoEl,
    sideDeviceInfoEl: sideDeviceInfoEl,
    globalMessageEl: globalMessageEl
  });

  initSocket({
    scheduleRender: scheduleRender,
    historyInfoEl: historyInfoEl,
    socketStatusBadgeEl: socketStatusBadgeEl,
    globalMessageEl: globalMessageEl,
    payloadMatchesSelectedDevice: payloadMatchesSelectedDevice
  });

  initTabs({
    topNav: topNav,
    tabButtons: tabButtons,
    historyPanel: historyPanel,
    usersPanel: usersPanel,
    devicesPanel: devicesPanel,
    globalMessageEl: globalMessageEl
  });

  activateTab("history");
  resetUserForm();
  resetDeviceForm();

  window.Spectrogram.configure({
    colorMap: "magma",
    inputValueMax: 255,
    gamma: 1.0,
    axisMinFrequency: 30,
    intensityMode: "linear",
    dbMin: -95,
    dbMax: -20,
    percentileLow: 5,
    percentileHigh: 99,
    noiseSuppressionEnabled: true,
    noiseFloorPercentile: 72,
    noiseThreshold: 0.06,
    isolatedPixelRemovalEnabled: true,
    minActiveNeighbors: 1,
    neighborhoodSize: 3,
    morphologyEnabled: true,
    compareView: "denoised",
    bucketAggregation: "max",
    debugStatsEnabled: false
  });
  state.activeColorMap = "magma";
  updateColorMapButtonLabel();
  displayGainInput.value = String(state.activeDisplayGainDb);
  displayGainValue.textContent = String(state.activeDisplayGainDb) + " dB";
  intensityModeSelect.value = state.activeIntensityMode;
  dbMinInput.value = String(state.activeDbMin);
  dbMaxInput.value = String(state.activeDbMax);
  pctLowInput.value = String(state.activePercentileLow);
  pctHighInput.value = String(state.activePercentileHigh);
  compareViewSelect.value = state.activeCompareView;
  noiseSuppressionEnabledInput.checked = state.activeNoiseSuppressionEnabled;
  noiseFloorPercentileInput.value = String(state.activeNoiseFloorPercentile);
  noiseThresholdInput.value = String(state.activeNoiseThreshold);
  isolatedPixelRemovalEnabledInput.checked = state.activeIsolatedPixelRemovalEnabled;
  minActiveNeighborsInput.value = String(state.activeMinActiveNeighbors);
  neighborhoodSizeSelect.value = String(state.activeNeighborhoodSize);
  bucketAggregationSelect.value = state.activeBucketAggregation;
  debugStatsEnabledInput.checked = state.activeDebugStatsEnabled;
  updateIntensityControlsState();
  applyNoiseSettings();
  updateFollowLiveButtonState(followLiveBtn, state.liveFollowEnabled);
  window.Spectrogram.drawLegend(legendCanvas);

  setupSocket();
})();
