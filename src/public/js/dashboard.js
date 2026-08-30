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
import { initRender, scheduleRender, markInteractionActive } from "./dashboard/render.js";
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

  initRender({
    followLiveBtn: followLiveBtn,
    probeTooltipEl: probeTooltipEl,
    historyInfoEl: historyInfoEl,
    historyTableBody: historyTableBody,
    gapTooltipEl: gapTooltipEl,
    canvas: canvas,
    legendCanvas: legendCanvas,
    processingStatusEl: processingStatusEl
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
