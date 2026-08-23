(function () {
  var token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
    return;
  }

  var user = null;
  try {
    var rawUser = localStorage.getItem("user");
    user = rawUser ? JSON.parse(rawUser) : null;
  } catch (_error) {
    user = null;
  }

  if (!user) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }

  var selectedDeviceId = null;
  var selectedDeviceName = "";
  var selectedDeviceKey = "";
  var selectedDeviceMinFrequency = null;
  var selectedDeviceMaxFrequency = null;
  var currentPackets = [];
  var activeTimeStepMs = 1000;
  var activeRangeMode = "latest1h";
  var activeFromIso = null;
  var activeToIso = null;
  var viewportFromMs = null;
  var viewportToMs = null;
  var followLatest24 = true;
  var isPanning = false;
  var panStartClientX = 0;
  var panStartFromMs = 0;
  var panStartToMs = 0;
  var renderRafId = null;
  var pendingRenderOptions = null;
  var interactionEndTimer = null;
  var lastRenderMeta = null;
  var exampleTimer = null;
  var devicesCache = [];
  var editingUserId = null;
  var editingDeviceId = null;
  var lastPersistenceWarningAt = 0;
  var LIVE_WINDOW_MS = 60 * 60 * 1000;
  var LIVE_WINDOW_LABEL = "Latest 1h";
  var MAX_LOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
  var MAX_PACKETS_IN_MEMORY = 12000;

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
  var stepBack5mBtn = document.getElementById("stepBack5mBtn");
  var loadExampleBtn = document.getElementById("loadExampleBtn");
  var resetViewBtn = document.getElementById("resetViewBtn");
  var panLeftBtn = document.getElementById("panLeftBtn");
  var panRightBtn = document.getElementById("panRightBtn");
  var zoomInBtn = document.getElementById("zoomInBtn");
  var zoomOutBtn = document.getElementById("zoomOutBtn");
  var fitPacketsBtn = document.getElementById("fitPacketsBtn");
  var colorMapBtn = document.getElementById("colorMapBtn");
  var followLiveBtn = document.getElementById("followLiveBtn");
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
    !stepBack5mBtn ||
    !loadExampleBtn ||
    !resetViewBtn ||
    !panLeftBtn ||
    !panRightBtn ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !fitPacketsBtn ||
    !colorMapBtn ||
    !followLiveBtn ||
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

  var isAdmin = user.role === "admin";
  userBadgeEl.textContent = user.name + " (" + user.role + ")";

  if (!isAdmin) {
    document.querySelectorAll(".admin-only").forEach(function (el) {
      el.classList.add("hidden");
    });
  }

  function setGlobalMessage(message, isError) {
    globalMessageEl.textContent = message || "";
    globalMessageEl.style.color = isError ? "#8a1c18" : "#1f6f53";
  }

  function setSocketStatus(isConnected, detail) {
    var label = isConnected ? "Socket: Connected" : "Socket: Disconnected";
    if (detail) {
      label = isConnected ? ("Socket: Connected — " + detail) : ("Socket: Disconnected — " + detail);
    }

    socketStatusBadgeEl.textContent = label;
    socketStatusBadgeEl.classList.toggle("connected", !!isConnected);
    socketStatusBadgeEl.classList.toggle("disconnected", !isConnected);
  }

  function setProcessingStatus(text, isWarning) {
    processingStatusEl.textContent = text || "";
    processingStatusEl.style.color = isWarning ? "#8a1c18" : "#375a4f";
    processingStatusEl.style.background = isWarning ? "#fff3f1" : "#eef7f3";
    processingStatusEl.style.borderColor = isWarning ? "#f2c9c2" : "#cee8de";
  }

  function parseDisplayFrequencyRange() {
    var minValue = parseOptionalNumberInput(freqMinInput.value);
    var maxValue = parseOptionalNumberInput(freqMaxInput.value);

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) {
      return null;
    }

    return {
      min: minValue,
      max: maxValue
    };
  }

  function applyFrequencyRangeFilter() {
    var range = parseDisplayFrequencyRange();
    if (!range) {
      setGlobalMessage("Enter valid Min and Max frequency values in Hz.", true);
      return;
    }

    setGlobalMessage("Frequency band set to " + range.min + " Hz - " + range.max + " Hz", false);
    scheduleRender({ skipTable: false });
  }

  function clearFrequencyRangeFilter() {
    freqMinInput.value = "";
    freqMaxInput.value = "";
    setGlobalMessage("Vertical frequency filter cleared.", false);
    scheduleRender({ skipTable: false });
  }

  function setSpectrogramLoading(isLoading) {
    spectrogramLoaderEl.classList.toggle("hidden", !isLoading);
    canvas.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  function parseOptionalNumberInput(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    var parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeFrequencyBins(rawBins) {
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

  function getPacketFrequencyBins(packet) {
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

  var activeColorMap = "magma";
  var activeIntensityMode = "linear";
  var activeDbMin = -95;
  var activeDbMax = -20;
  var activePercentileLow = 5;
  var activePercentileHigh = 99;
  var activeCompareView = "denoised";
  var activeNoiseSuppressionEnabled = true;
  var activeNoiseFloorPercentile = 72;
  var activeNoiseThreshold = 0.06;
  var activeIsolatedPixelRemovalEnabled = true;
  var activeMinActiveNeighbors = 1;
  var activeNeighborhoodSize = 3;
  var activeBucketAggregation = "max";
  var activeDebugStatsEnabled = false;

  function parseBoolInput(input, fallback) {
    if (!(input instanceof HTMLInputElement)) {
      return fallback;
    }
    return !!input.checked;
  }

  function applyNoiseSettings() {
    var compareView = String(compareViewSelect.value || "denoised").toLowerCase();
    if (compareView !== "original" && compareView !== "thresholded" && compareView !== "denoised") {
      compareView = "denoised";
    }

    var floorPercentile = Number(noiseFloorPercentileInput.value);
    if (!Number.isFinite(floorPercentile)) {
      floorPercentile = 72;
    }
    floorPercentile = clamp(floorPercentile, 1, 99);

    var threshold = Number(noiseThresholdInput.value);
    if (!Number.isFinite(threshold)) {
      threshold = 0.06;
    }
    threshold = clamp(threshold, 0, 1);

    var minNeighbors = Math.round(Number(minActiveNeighborsInput.value));
    if (!Number.isFinite(minNeighbors)) {
      minNeighbors = 1;
    }
    minNeighbors = clamp(minNeighbors, 0, 24);

    var neighborhoodSize = Math.round(Number(neighborhoodSizeSelect.value));
    if (neighborhoodSize !== 5) {
      neighborhoodSize = 3;
    }

    var aggregation = String(bucketAggregationSelect.value || "max").toLowerCase();
    if (aggregation !== "hybrid") {
      aggregation = "max";
    }

    activeCompareView = compareView;
    activeNoiseSuppressionEnabled = parseBoolInput(noiseSuppressionEnabledInput, true);
    activeNoiseFloorPercentile = floorPercentile;
    activeNoiseThreshold = threshold;
    activeIsolatedPixelRemovalEnabled = parseBoolInput(isolatedPixelRemovalEnabledInput, true);
    activeMinActiveNeighbors = minNeighbors;
    activeNeighborhoodSize = neighborhoodSize;
    activeBucketAggregation = aggregation;
    activeDebugStatsEnabled = parseBoolInput(debugStatsEnabledInput, false);

    compareViewSelect.value = activeCompareView;
    noiseFloorPercentileInput.value = String(activeNoiseFloorPercentile);
    noiseThresholdInput.value = String(activeNoiseThreshold);
    minActiveNeighborsInput.value = String(activeMinActiveNeighbors);
    neighborhoodSizeSelect.value = String(activeNeighborhoodSize);
    bucketAggregationSelect.value = activeBucketAggregation;

    scheduleRender({ skipTable: true });
    setGlobalMessage("Noise settings applied", false);
  }

  function updateIntensityControlsState() {
    var mode = String(activeIntensityMode || "linear");
    var isDbFixed = mode === "db-fixed";
    var isDbPercentile = mode === "db-percentile";

    dbMinInput.disabled = !isDbFixed;
    dbMaxInput.disabled = !isDbFixed;
    pctLowInput.disabled = !isDbPercentile;
    pctHighInput.disabled = !isDbPercentile;
  }

  function applyIntensitySettings() {
    var mode = String(intensityModeSelect.value || "linear");
    if (mode !== "linear" && mode !== "db-fixed" && mode !== "db-percentile") {
      mode = "linear";
    }

    var parsedDbMin = Number(dbMinInput.value);
    var parsedDbMax = Number(dbMaxInput.value);
    var parsedPctLow = Number(pctLowInput.value);
    var parsedPctHigh = Number(pctHighInput.value);

    if (!Number.isFinite(parsedDbMin)) {
      parsedDbMin = -95;
    }
    if (!Number.isFinite(parsedDbMax)) {
      parsedDbMax = -20;
    }
    if (parsedDbMax <= parsedDbMin) {
      parsedDbMax = parsedDbMin + 10;
    }

    if (!Number.isFinite(parsedPctLow)) {
      parsedPctLow = 5;
    }
    if (!Number.isFinite(parsedPctHigh)) {
      parsedPctHigh = 99;
    }
    parsedPctLow = clamp(parsedPctLow, 0, 99);
    parsedPctHigh = clamp(parsedPctHigh, 1, 100);
    if (parsedPctHigh <= parsedPctLow) {
      parsedPctHigh = Math.min(100, parsedPctLow + 1);
    }

    activeIntensityMode = mode;
    activeDbMin = parsedDbMin;
    activeDbMax = parsedDbMax;
    activePercentileLow = parsedPctLow;
    activePercentileHigh = parsedPctHigh;

    intensityModeSelect.value = activeIntensityMode;
    dbMinInput.value = String(activeDbMin);
    dbMaxInput.value = String(activeDbMax);
    pctLowInput.value = String(activePercentileLow);
    pctHighInput.value = String(activePercentileHigh);

    updateIntensityControlsState();
    scheduleRender({ skipTable: true });
    setGlobalMessage("Scale settings applied", false);
  }

  function updateColorMapButtonLabel() {
    colorMapBtn.textContent = "Colors: " + activeColorMap;
    colorMapBtn.title = "Toggle color map (current: " + activeColorMap + ")";
  }

  function applyColorMap(colorMap) {
    activeColorMap = String(colorMap || "magma").toLowerCase() === "sunset" ? "sunset" : "magma";
    window.Spectrogram.configure({
      colorMap: activeColorMap
    });
    updateColorMapButtonLabel();
    scheduleRender({ skipTable: true });
  }

  function toggleColorMap() {
    applyColorMap(activeColorMap === "magma" ? "sunset" : "magma");
  }

  function getPacketStartMs(packet) {
    if (!packet) {
      return NaN;
    }

    if (Number.isFinite(packet.__startMs)) {
      return packet.__startMs;
    }

    var value = new Date(packet.startTime || packet.start_time || packet.timestamp).getTime();
    if (Number.isFinite(value)) {
      packet.__startMs = value;
    }
    return value;
  }

  function getPacketEndMs(packet) {
    if (!packet) {
      return NaN;
    }

    if (Number.isFinite(packet.__endMs)) {
      return packet.__endMs;
    }

    var value = new Date(packet.endTime || packet.end_time || packet.timestamp).getTime();
    if (Number.isFinite(value)) {
      packet.__endMs = value;
    }
    return value;
  }

  function getPacketTimestampMs(packet) {
    if (!packet) {
      return NaN;
    }

    if (Number.isFinite(packet.__timestampMs)) {
      return packet.__timestampMs;
    }

    var value = new Date(packet.timestamp || packet.endTime || packet.end_time || packet.startTime || packet.start_time).getTime();
    if (Number.isFinite(value)) {
      packet.__timestampMs = value;
    }
    return value;
  }

  function normalizePacketTiming(packet) {
    if (!packet) {
      return packet;
    }

    getPacketStartMs(packet);
    getPacketEndMs(packet);
    getPacketTimestampMs(packet);
    return packet;
  }

  function getInitialLoadRangeIso() {
    var toMs = Date.now();
    var fromMs = toMs - LIVE_WINDOW_MS;
    return {
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString()
    };
  }

  function getRecentRangeIso(hours) {
    var safeHours = Number(hours);
    if (!Number.isFinite(safeHours) || safeHours <= 0) {
      safeHours = 2;
    }

    var toMs = Date.now();
    var fromMs = toMs - Math.round(safeHours * 60 * 60 * 1000);
    return {
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString()
    };
  }

  function normalizeDeviceKey(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim().toLowerCase();
  }

  function payloadMatchesSelectedDevice(payload) {
    if (!payload || !selectedDeviceId) {
      return false;
    }

    if (Number(payload.deviceId) === Number(selectedDeviceId)) {
      return true;
    }

    var sourceKey = normalizeDeviceKey(payload.sourceDeviceId);
    if (sourceKey && sourceKey === selectedDeviceKey) {
      return true;
    }

    var nameKey = normalizeDeviceKey(payload.deviceName);
    if (nameKey && nameKey === selectedDeviceKey) {
      return true;
    }

    return false;
  }

  function toIso(dateTimeLocalValue) {
    return new Date(dateTimeLocalValue).toISOString();
  }

  function formatDateOnly(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function formatTimeOnly(date) {
    var hours = String(date.getHours()).padStart(2, "0");
    var minutes = String(date.getMinutes()).padStart(2, "0");
    return hours + ":" + minutes;
  }

  function formatLocalDateTime(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var hours = String(date.getHours()).padStart(2, "0");
    var minutes = String(date.getMinutes()).padStart(2, "0");
    var seconds = String(date.getSeconds()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
  }

  function buildSameDayRange(dayValue, fromTimeValue, toTimeValue) {
    var day = String(dayValue || "").trim();
    var fromTime = String(fromTimeValue || "").trim();
    var toTime = String(toTimeValue || "").trim();

    if (!day || !fromTime || !toTime) {
      throw new Error("Day, from time, and to time are required");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error("Invalid day value");
    }

    if (!/^\d{2}:\d{2}$/.test(fromTime) || !/^\d{2}:\d{2}$/.test(toTime)) {
      throw new Error("Invalid time value");
    }

    var fromLocal = day + "T" + fromTime;
    var toLocal = day + "T" + toTime;

    if (new Date(fromLocal).getTime() > new Date(toLocal).getTime()) {
      throw new Error("From time must be before or equal to to time");
    }

    return {
      fromLocal: fromLocal,
      toLocal: toLocal
    };
  }

  async function apiRequest(path, options) {
    var requestOptions = options || {};
    var headers = requestOptions.headers || {};
    headers.Authorization = "Bearer " + token;

    if (requestOptions.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    var response = await fetch(path, {
      method: requestOptions.method || "GET",
      headers: {
        Authorization: headers.Authorization,
        "Content-Type": headers["Content-Type"] || undefined
      },
      body: requestOptions.body
    });

    var data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      throw new Error("Session expired");
    }

    if (!response.ok) {
      throw new Error((data && data.message) || "Request failed");
    }

    return data;
  }

  function activateTab(tabName) {
    tabButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-tab") === tabName;
      btn.classList.toggle("active", active);
    });

    historyPanel.classList.toggle("active", tabName === "history");
    usersPanel.classList.toggle("active", tabName === "users");
    devicesPanel.classList.toggle("active", tabName === "devices");
    setGlobalMessage("", false);
  }

  topNav.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    var tabName = target.getAttribute("data-tab");
    if (!tabName) {
      return;
    }
    activateTab(tabName);
  });

  function setActiveDevice(deviceId) {
    var listItems = deviceListEl.querySelectorAll("li");
    listItems.forEach(function (item) {
      var isActive = Number(item.getAttribute("data-id")) === deviceId;
      item.classList.toggle("active", isActive);
    });
  }

  function renderLatestPacket(options) {
    var renderOptions = options || {};
    probeTooltipEl.classList.add("hidden");
    if (!currentPackets.length) {
      historyInfoEl.textContent = "No data available for the selected device.";
      historyTableBody.innerHTML = "";
      lastRenderMeta = null;
      gapTooltipEl.classList.add("hidden");
      clearSpectrogramCanvas("No data available for the selected device.");
      return;
    }

    var fromMs;
    var toMs;
    if (activeRangeMode === "latest1h" && followLatest24) {
      toMs = Date.now();
      fromMs = toMs - LIVE_WINDOW_MS;
      activeFromIso = new Date(fromMs).toISOString();
      activeToIso = new Date(toMs).toISOString();
      viewportFromMs = fromMs;
      viewportToMs = toMs;

      // Keep only recent packets in memory for the rolling 1-hour live view.
      currentPackets = currentPackets.filter(function (packet) {
        var packetEnd = getPacketEndMs(packet);
        return Number.isFinite(packetEnd) && packetEnd >= fromMs;
      });
    } else if (Number.isFinite(viewportFromMs) && Number.isFinite(viewportToMs)) {
      fromMs = viewportFromMs;
      toMs = viewportToMs;
    } else {
      fromMs = new Date(activeFromIso || "").getTime();
      toMs = new Date(activeToIso || "").getTime();
      viewportFromMs = fromMs;
      viewportToMs = toMs;
    }

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      lastRenderMeta = null;
      gapTooltipEl.classList.add("hidden");
      clearSpectrogramCanvas("No data available for the selected device.");
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
      Number.isFinite(selectedDeviceMinFrequency) &&
      Number.isFinite(selectedDeviceMaxFrequency) &&
      selectedDeviceMaxFrequency > selectedDeviceMinFrequency
    ) {
      minFrequency = selectedDeviceMinFrequency;
      maxFrequency = selectedDeviceMaxFrequency;
    }

    var renderResult = window.Spectrogram.renderSpectrogram({
      canvas: canvas,
      legendCanvas: legendCanvas,
      blocks: visiblePackets,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      fastMode: !!renderOptions.skipTable,
      assumeSorted: true,
      intensityMode: activeIntensityMode,
      dbMin: activeDbMin,
      dbMax: activeDbMax,
      percentileLow: activePercentileLow,
      percentileHigh: activePercentileHigh,
      compareView: activeCompareView,
      noiseSuppressionEnabled: activeNoiseSuppressionEnabled,
      noiseFloorPercentile: activeNoiseFloorPercentile,
      noiseThreshold: activeNoiseThreshold,
      isolatedPixelRemovalEnabled: activeIsolatedPixelRemovalEnabled,
      minActiveNeighbors: activeMinActiveNeighbors,
      neighborhoodSize: activeNeighborhoodSize,
      bucketAggregation: activeBucketAggregation,
      debugStatsEnabled: activeDebugStatsEnabled,
      intensityType: intensityType,
      frequencyBins: frequencyBins,
      minFrequency: minFrequency,
      maxFrequency: maxFrequency,
      displayMinFrequency: displayFrequencyRange ? displayFrequencyRange.min : null,
      displayMaxFrequency: displayFrequencyRange ? displayFrequencyRange.max : null
    });
    lastRenderMeta = renderResult || null;

    if (renderResult) {
      var selectedScaleText = activeIntensityMode;
      var effectiveScaleText = renderResult.intensityMode || activeIntensityMode;
      var selectedViewText = activeCompareView;
      var effectiveViewText = renderResult.compareView || activeCompareView;
      var infoText =
        "Scale selected: " +
        selectedScaleText +
        " | effective: " +
        effectiveScaleText +
        " | View selected: " +
        selectedViewText +
        " | effective: " +
        effectiveViewText +
        " | Intensity type: " +
        (renderResult.intensityType || "image");

      var isScaleFallback = selectedScaleText !== effectiveScaleText;
      if (isScaleFallback) {
        infoText += " | Note: dB modes are ignored for image intensity input";
      }
      setProcessingStatus(infoText, isScaleFallback);
    }

    var gapInfo = " | Gaps: 0";
    if (renderResult && Array.isArray(renderResult.gaps) && renderResult.gaps.length > 0) {
      var firstGap = renderResult.gaps[0];
      var mins = Math.round(firstGap.durationMs / 60000);
      gapInfo =
        " | Gaps: " +
        renderResult.gaps.length +
        " (first: " +
        formatLocalDateTime(firstGap.start) +
        " -> " +
        formatLocalDateTime(firstGap.end) +
        ", " +
        mins +
        "m)";
    }

    if (displayFrequencyRange) {
      historyInfoEl.textContent +=
        " | Vertical freq: " +
        Math.round(displayFrequencyRange.min) +
        "-" +
        Math.round(displayFrequencyRange.max) +
        " Hz";
    }

    if (renderOptions.skipTable) {
      return;
    }

    if (renderResult && renderResult.hasRealFrequency) {
      historyInfoEl.textContent = historyInfoEl.textContent + " | Frequency axis: Hz";
    } else {
      historyInfoEl.textContent = historyInfoEl.textContent + " | Frequency axis: bands only (add sampleRate / minFrequency / maxFrequency for Hz labels)";
    }

    if (activeDebugStatsEnabled && renderResult && renderResult.debugStats) {
      var s = renderResult.debugStats;
      historyInfoEl.textContent =
        historyInfoEl.textContent +
        " | Stage=" +
        (renderResult.compareView || activeCompareView) +
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
      var rowCount = Array.isArray(packet.data) ? packet.data.length : 0;
      var colCount = rowCount > 0 && Array.isArray(packet.data[0]) ? packet.data[0].length : 0;
      var startLocal = formatLocalDateTime(getPacketStartMs(packet));
      var endLocal = formatLocalDateTime(getPacketEndMs(packet));
      var durationMin = Math.max(
        0,
        Math.round(
          (getPacketEndMs(packet) - getPacketStartMs(packet)) /
            60000
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
        "m" +
        "</td><td>" +
        rowCount +
        "</td><td>" +
        colCount +
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

  function insertPacketSorted(packet) {
    normalizePacketTiming(packet);
    var packetTime = getPacketStartMs(packet);
    if (!Number.isFinite(packetTime)) {
      return;
    }

    var low = 0;
    var high = currentPackets.length;
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      var midTime = getPacketStartMs(currentPackets[mid]);
      if (!Number.isFinite(midTime) || packetTime < midTime) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    currentPackets.splice(low, 0, packet);

    if (currentPackets.length > MAX_PACKETS_IN_MEMORY) {
      var overflow = currentPackets.length - MAX_PACKETS_IN_MEMORY;
      currentPackets.splice(0, overflow);
    }
  }

  function getCurrentViewSpanMs() {
    if (!Number.isFinite(viewportFromMs) || !Number.isFinite(viewportToMs)) {
      return null;
    }
    return viewportToMs - viewportFromMs;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    var tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
  }

  function getPacketInterval(packet) {
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

  function findFirstVisiblePacketIndex(packets, fromMs) {
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

  function findLastVisiblePacketIndex(packets, toMs) {
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

  function getVisiblePackets(fromMs, toMs) {
    if (!currentPackets.length) {
      return [];
    }

    var startIndex = findFirstVisiblePacketIndex(currentPackets, fromMs);
    var endIndex = findLastVisiblePacketIndex(currentPackets, toMs);
    if (startIndex > endIndex || startIndex >= currentPackets.length || endIndex < 0) {
      return [];
    }

    return currentPackets.slice(startIndex, endIndex + 1);
  }

  function fitViewportToPackets() {
    if (!currentPackets.length) {
      return;
    }

    var minStart = Number.POSITIVE_INFINITY;
    var maxEnd = Number.NEGATIVE_INFINITY;

    for (var i = 0; i < currentPackets.length; i += 1) {
      var interval = getPacketInterval(currentPackets[i]);
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

    followLatest24 = false;
    var padding = Math.max(60 * 1000, Math.round((maxEnd - minStart) * 0.04));
    viewportFromMs = minStart - padding;
    viewportToMs = maxEnd + padding;
    activeFromIso = new Date(viewportFromMs).toISOString();
    activeToIso = new Date(viewportToMs).toISOString();
    scheduleRender({ skipTable: false });
  }

  function panViewport(direction, ratio) {
    var span = getCurrentViewSpanMs();
    if (!span || span <= 0) {
      return;
    }

    followLatest24 = false;
    var panRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.2;
    var shift = Math.max(30 * 1000, Math.round(span * panRatio));
    viewportFromMs += direction * shift;
    viewportToMs += direction * shift;
    scheduleRender({ skipTable: false });
  }

  function zoomViewport(factor) {
    zoomViewportAt(factor, 0.5);
  }

  function bindHoldAction(button, action) {
    var repeatTimer = null;
    var startTimer = null;

    function clearTimers() {
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (repeatTimer) {
        clearInterval(repeatTimer);
        repeatTimer = null;
      }
    }

    function triggerAndHold(event) {
      if (event) {
        event.preventDefault();
      }
      action();
      clearTimers();
      startTimer = setTimeout(function () {
        repeatTimer = setInterval(action, 60);
      }, 260);
    }

    button.addEventListener("mousedown", triggerAndHold);
    button.addEventListener("mouseleave", clearTimers);
    button.addEventListener("mouseup", clearTimers);
    button.addEventListener("touchstart", triggerAndHold, { passive: false });
    button.addEventListener("touchend", clearTimers);
    button.addEventListener("touchcancel", clearTimers);
    window.addEventListener("mouseup", clearTimers);
  }

  function zoomViewportAt(factor, anchorFraction) {
    var span = getCurrentViewSpanMs();
    if (!span || span <= 0) {
      return;
    }

    followLatest24 = false;
    var anchor = clamp(anchorFraction, 0, 1);
    var anchorTime = viewportFromMs + span * anchor;
    var newSpan = Math.round(span * factor);
    var minSpan = 60 * 1000;
    var maxSpan = 7 * 24 * 60 * 60 * 1000;
    newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

    viewportFromMs = anchorTime - newSpan * anchor;
    viewportToMs = viewportFromMs + newSpan;
    scheduleRender({ skipTable: true });
    markInteractionActive();
  }

  function resetViewport() {
    if (activeRangeMode === "latest1h") {
      followLatest24 = true;
      scheduleRender({ skipTable: false });
      return;
    }

    if (activeFromIso && activeToIso) {
      followLatest24 = false;
      viewportFromMs = new Date(activeFromIso).getTime();
      viewportToMs = new Date(activeToIso).getTime();
      scheduleRender({ skipTable: false });
    }
  }

  async function loadDeviceHistory(deviceId, fromIso, toIsoValue) {
    var endpoint = "/api/devices/" + deviceId + "/history";
    var nowMs = Date.now();

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

      var effectiveFromIso = new Date(effectiveFromMs).toISOString();
      var effectiveToIso = new Date(effectiveToMs).toISOString();

      if (effectiveFromMs !== requestedFromMs || clampedByNow) {
        setGlobalMessage("Range was clamped to max 24 hours and current time.", false);
      }

      endpoint += "?from=" + encodeURIComponent(effectiveFromIso) + "&to=" + encodeURIComponent(effectiveToIso);
      activeRangeMode = "custom";
      activeFromIso = effectiveFromIso;
      activeToIso = effectiveToIso;
      viewportFromMs = effectiveFromMs;
      viewportToMs = effectiveToMs;
      followLatest24 = false;
    } else {
      activeRangeMode = "latest1h";
      var latestToMs = nowMs;
      var latestFromMs = latestToMs - LIVE_WINDOW_MS;
      activeFromIso = new Date(latestFromMs).toISOString();
      activeToIso = new Date(latestToMs).toISOString();
      followLatest24 = true;
      viewportFromMs = latestFromMs;
      viewportToMs = latestToMs;
      endpoint += "?from=" + encodeURIComponent(activeFromIso) + "&to=" + encodeURIComponent(activeToIso);
    }

    currentPackets = [];
    lastRenderMeta = null;
    gapTooltipEl.classList.add("hidden");
    historyInfoEl.textContent = "Loading data for selected device...";
    historyTableBody.innerHTML = "";
    setSpectrogramLoading(true);

    try {
      currentPackets = await apiRequest(endpoint);
      currentPackets.forEach(normalizePacketTiming);
      activeTimeStepMs = 1000;

      if (!currentPackets.length) {
        historyInfoEl.textContent = "No data available for the selected device.";
        selectedDeviceTitleEl.textContent = "Selected Device: " + selectedDeviceName + " (No data)";
        sideDeviceInfoEl.textContent =
          "ID: " +
          selectedDeviceId +
          " | Name: " +
          selectedDeviceName +
          " | Description: " +
          "No history records found for this device.";
        scheduleRender({ skipTable: false });
        return;
      }

      scheduleRender({ skipTable: false });
    } finally {
      setSpectrogramLoading(false);
    }
  }

  async function loadRecentHours(hours, label) {
    if (!selectedDeviceId) {
      setGlobalMessage("Select a device first", true);
      return;
    }

    var range = getRecentRangeIso(hours);
    await loadDeviceHistory(selectedDeviceId, range.fromIso, range.toIso);
    setGlobalMessage((label || "Recent range") + " loaded for " + selectedDeviceName, false);
  }

  async function loadLatestPacketOnly() {
    if (!selectedDeviceId) {
      setGlobalMessage("Select a device first", true);
      return;
    }

    var range = getRecentRangeIso(24);
    await loadDeviceHistory(selectedDeviceId, range.fromIso, range.toIso);

    if (!currentPackets.length) {
      setGlobalMessage("No packet found in the last 24 hours", true);
      return;
    }

    var latestPacket = currentPackets[currentPackets.length - 1];
    var latestStartMs = getPacketStartMs(latestPacket);
    var latestEndMs = getPacketEndMs(latestPacket);
    if (!Number.isFinite(latestStartMs)) {
      latestStartMs = getPacketTimestampMs(latestPacket);
    }
    if (!Number.isFinite(latestEndMs)) {
      latestEndMs = latestStartMs;
    }

    if (!Number.isFinite(latestStartMs)) {
      setGlobalMessage("Could not resolve latest packet time", true);
      return;
    }

    var effectiveEnd = Number.isFinite(latestEndMs) && latestEndMs > latestStartMs ? latestEndMs : latestStartMs + 1000;
    activeRangeMode = "lastPacket";
    followLatest24 = false;
    viewportFromMs = latestStartMs;
    viewportToMs = effectiveEnd;
    activeFromIso = new Date(viewportFromMs).toISOString();
    activeToIso = new Date(viewportToMs).toISOString();
    scheduleRender({ skipTable: false });
    setGlobalMessage("Latest packet focused. Use -5m to step backward.", false);
  }

  async function stepBackByMinutes(minutes) {
    if (!selectedDeviceId) {
      setGlobalMessage("Select a device first", true);
      return;
    }

    var stepMinutes = Number(minutes);
    if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) {
      stepMinutes = 5;
    }

    var stepMs = Math.round(stepMinutes * 60 * 1000);
    var span = getCurrentViewSpanMs();
    if (!Number.isFinite(span) || span <= 0) {
      span = stepMs;
    }

    var baseToMs = Number.isFinite(viewportToMs) ? viewportToMs : Date.now();
    var targetToMs = baseToMs - stepMs;
    var targetFromMs = targetToMs - span;

    await loadDeviceHistory(selectedDeviceId, new Date(targetFromMs).toISOString(), new Date(targetToMs).toISOString());
    setGlobalMessage("Shifted backward by " + stepMinutes + " minutes", false);
  }

  async function selectDevice(device) {
    selectedDeviceId = device.id;
    selectedDeviceName = device.name;
    selectedDeviceKey = normalizeDeviceKey(device.name);
    selectedDeviceMinFrequency = Number.isFinite(device.minFrequency) ? device.minFrequency : null;
    selectedDeviceMaxFrequency = Number.isFinite(device.maxFrequency) ? device.maxFrequency : null;
    selectedDeviceTitleEl.textContent = "Selected Device: " + device.name;
    sideDeviceInfoEl.textContent =
      "ID: " +
      device.id +
      " | Name: " +
      device.name +
      " | Description: " +
      (device.description || "-") +
      " | Freq Range: " +
      (Number.isFinite(selectedDeviceMinFrequency) && Number.isFinite(selectedDeviceMaxFrequency)
        ? selectedDeviceMinFrequency + " Hz -> " + selectedDeviceMaxFrequency + " Hz"
        : "not configured");
    setActiveDevice(device.id);
    var initialRange = getInitialLoadRangeIso();
    await loadDeviceHistory(device.id, initialRange.fromIso, initialRange.toIso);
  }

  function renderDeviceSidebar() {
    deviceListEl.innerHTML = "";
    devicesCache.forEach(function (device) {
      var item = document.createElement("li");
      item.textContent = device.name;
      item.setAttribute("data-id", String(device.id));
      item.addEventListener("click", function () {
        selectDevice(device).catch(function (error) {
          historyInfoEl.textContent = error instanceof Error ? error.message : "Failed to load history";
        });
      });
      deviceListEl.appendChild(item);
    });
  }

  async function loadDevices() {
    devicesCache = await apiRequest("/api/devices");
    renderDeviceSidebar();
    renderDevicesTable();

    if (devicesCache.length > 0) {
      var target = devicesCache[0];
      if (selectedDeviceId) {
        var found = devicesCache.find(function (d) {
          return Number(d.id) === Number(selectedDeviceId);
        });
        if (found) {
          target = found;
        }
      }
      await selectDevice(target);
    } else {
      selectedDeviceTitleEl.textContent = "No devices available";
      historyInfoEl.textContent = "Create devices using the API as admin.";
      historyTableBody.innerHTML = "";
      sideDeviceInfoEl.textContent = "No selected device.";
    }
  }

  function resetUserForm() {
    editingUserId = null;
    userIdInput.value = "";
    userNameInput.value = "";
    userUsernameInput.value = "";
    userPasswordInput.value = "";
    userRoleInput.value = "emp";
    userSaveBtn.textContent = "Add User";
    userFormMessage.textContent = "";
  }

  function resetDeviceForm() {
    editingDeviceId = null;
    deviceIdInput.value = "";
    deviceNameInput.value = "";
    deviceDescriptionInput.value = "";
    deviceMinFrequencyInput.value = "";
    deviceMaxFrequencyInput.value = "";
    deviceSaveBtn.textContent = "Add Device";
    deviceFormMessage.textContent = "";
  }

  async function loadUsers() {
    try {
      var users = await apiRequest("/api/users");
      usersTableBody.innerHTML = "";

      users.forEach(function (u) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          u.id +
          "</td><td>" +
          u.name +
          "</td><td>" +
          u.username +
          "</td><td>" +
          u.role +
          "</td>";

        if (isAdmin) {
          var actionTd = document.createElement("td");
          actionTd.className = "action-buttons";

          var editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "ghost-btn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", function () {
            editingUserId = u.id;
            userIdInput.value = String(u.id);
            userNameInput.value = u.name;
            userUsernameInput.value = u.username;
            userRoleInput.value = u.role;
            userPasswordInput.value = "";
            userSaveBtn.textContent = "Update User";
            userFormMessage.textContent = "Editing user #" + u.id;
          });

          var deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "danger-btn";
          deleteBtn.textContent = "Delete";
          deleteBtn.addEventListener("click", async function () {
            if (!window.confirm("Delete user " + u.username + "?")) {
              return;
            }
            try {
              await apiRequest("/api/users/" + u.id, { method: "DELETE" });
              if (Number(editingUserId) === Number(u.id)) {
                resetUserForm();
              }
              await loadUsers();
              setGlobalMessage("User deleted successfully", false);
            } catch (error) {
              setGlobalMessage(error instanceof Error ? error.message : "Delete failed", true);
            }
          });

          actionTd.appendChild(editBtn);
          actionTd.appendChild(deleteBtn);
          tr.appendChild(actionTd);
        }

        usersTableBody.appendChild(tr);
      });
    } catch (error) {
      usersTableBody.innerHTML = "";
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load users", true);
    }
  }

  function renderDevicesTable() {
    devicesTableBody.innerHTML = "";

    devicesCache.forEach(function (device) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        device.id +
        "</td><td>" +
        device.name +
        "</td><td>" +
        (device.description || "") +
        "</td><td>" +
        (Number.isFinite(device.minFrequency) && Number.isFinite(device.maxFrequency)
          ? device.minFrequency + " - " + device.maxFrequency + " Hz"
          : "-") +
        "</td>";

      if (isAdmin) {
        var actionTd = document.createElement("td");
        actionTd.className = "action-buttons";

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          editingDeviceId = device.id;
          deviceIdInput.value = String(device.id);
          deviceNameInput.value = device.name;
          deviceDescriptionInput.value = device.description || "";
          deviceMinFrequencyInput.value = Number.isFinite(device.minFrequency) ? String(device.minFrequency) : "";
          deviceMaxFrequencyInput.value = Number.isFinite(device.maxFrequency) ? String(device.maxFrequency) : "";
          deviceSaveBtn.textContent = "Update Device";
          deviceFormMessage.textContent = "Editing device #" + device.id;
        });

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "danger-btn";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", async function () {
          if (!window.confirm("Delete device " + device.name + "?")) {
            return;
          }
          try {
            await apiRequest("/api/devices/" + device.id, { method: "DELETE" });
            if (Number(selectedDeviceId) === Number(device.id)) {
              selectedDeviceId = null;
              selectedDeviceName = "";
              selectedDeviceKey = "";
              currentPackets = [];
            }
            if (Number(editingDeviceId) === Number(device.id)) {
              resetDeviceForm();
            }
            await loadDevices();
            setGlobalMessage("Device deleted successfully", false);
          } catch (error) {
            setGlobalMessage(error instanceof Error ? error.message : "Delete failed", true);
          }
        });

        actionTd.appendChild(editBtn);
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);
      }

      devicesTableBody.appendChild(tr);
    });
  }

  userForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!isAdmin) {
      setGlobalMessage("Only admin can manage users", true);
      return;
    }

    var payload = {
      name: userNameInput.value.trim(),
      username: userUsernameInput.value.trim(),
      password: userPasswordInput.value,
      role: userRoleInput.value
    };

    try {
      if (editingUserId) {
        var updatePayload = {
          name: payload.name,
          username: payload.username,
          role: payload.role
        };
        if (payload.password) {
          updatePayload.password = payload.password;
        }
        await apiRequest("/api/users/" + editingUserId, {
          method: "PUT",
          body: JSON.stringify(updatePayload)
        });
        setGlobalMessage("User updated successfully", false);
      } else {
        if (!payload.password) {
          throw new Error("Password is required for new user");
        }
        await apiRequest("/api/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setGlobalMessage("User created successfully", false);
      }

      resetUserForm();
      await loadUsers();
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to save user", true);
    }
  });

  userCancelBtn.addEventListener("click", function () {
    resetUserForm();
  });

  deviceForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!isAdmin) {
      setGlobalMessage("Only admin can manage devices", true);
      return;
    }

    var payload = {
      name: deviceNameInput.value.trim(),
      description: deviceDescriptionInput.value.trim(),
      minFrequency: parseOptionalNumberInput(deviceMinFrequencyInput.value),
      maxFrequency: parseOptionalNumberInput(deviceMaxFrequencyInput.value)
    };

    if (
      Number.isFinite(payload.minFrequency) &&
      Number.isFinite(payload.maxFrequency) &&
      payload.maxFrequency <= payload.minFrequency
    ) {
      setGlobalMessage("Max Frequency must be greater than Min Frequency", true);
      return;
    }

    try {
      if (editingDeviceId) {
        await apiRequest("/api/devices/" + editingDeviceId, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setGlobalMessage("Device updated successfully", false);
      } else {
        await apiRequest("/api/devices", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setGlobalMessage("Device created successfully", false);
      }

      resetDeviceForm();
      await loadDevices();
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to save device", true);
    }
  });

  deviceCancelBtn.addEventListener("click", function () {
    resetDeviceForm();
  });

  historyRangeForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!selectedDeviceId) {
      setGlobalMessage("Select a device first", true);
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
      setGlobalMessage("Day, from time, and to time are required", true);
      return;
    }

    try {
      var range = buildSameDayRange(queryDateInput.value, fromTimeInput.value, toTimeInput.value);

      await loadDeviceHistory(selectedDeviceId, toIso(range.fromLocal), toIso(range.toLocal));
      setGlobalMessage("Range history loaded for " + selectedDeviceName, false);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load history", true);
    }
  });

  latest24Btn.addEventListener("click", async function () {
    if (!selectedDeviceId) {
      setGlobalMessage("Select a device first", true);
      return;
    }

    try {
      await loadDeviceHistory(selectedDeviceId);
      setGlobalMessage("Latest 1 hour live feed loaded for " + selectedDeviceName, false);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load history", true);
    }
  });

  latest5hBtn.addEventListener("click", async function () {
    try {
      await loadRecentHours(5, "Latest 5 hours");
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load history", true);
    }
  });

  latest24hBtn.addEventListener("click", async function () {
    try {
      await loadRecentHours(24, "Latest 24 hours");
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load history", true);
    }
  });

  latestPacketBtn.addEventListener("click", async function () {
    try {
      await loadLatestPacketOnly();
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load latest packet", true);
    }
  });

  stepBack5mBtn.addEventListener("click", async function () {
    try {
      await stepBackByMinutes(5);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to step back", true);
    }
  });

  loadExampleBtn.addEventListener("click", async function () {
    try {
      var example = await apiRequest("/public/example.json");
      if (!example || !Array.isArray(example.packets) || example.packets.length === 0) {
        throw new Error("Example file is empty or invalid");
      }

      if (exampleTimer) {
        clearInterval(exampleTimer);
        exampleTimer = null;
      }

      selectedDeviceId = Number(example.deviceId) || selectedDeviceId;
      selectedDeviceName = example.deviceName || "Example Device";
      selectedDeviceKey = normalizeDeviceKey(selectedDeviceName);
      selectedDeviceTitleEl.textContent = "Selected Device: " + selectedDeviceName + " (Example)";
      sideDeviceInfoEl.textContent =
        "ID: " +
        (example.deviceId || "-") +
        " | Name: " +
        selectedDeviceName +
        " | Source: local example.json";

      activeTimeStepMs = Number(example.timeStepMs || 1000);
      currentPackets = [];

      example.packets.forEach(function (packet, idx) {
        insertPacketSorted({
          id: "ex-" + (idx + 1),
          deviceId: example.deviceId,
          timestamp: packet.timestamp,
          timeStepMs: activeTimeStepMs,
          data: packet.data,
          minFrequency: example.minFrequency,
          maxFrequency: example.maxFrequency
        });
      });

      activeRangeMode = "custom";
      activeFromIso = example.rangeStart || example.packets[0].timestamp;
      activeToIso = example.rangeEnd || example.packets[example.packets.length - 1].timestamp;
      viewportFromMs = new Date(activeFromIso).getTime();
      viewportToMs = new Date(activeToIso).getTime();
      followLatest24 = false;
      scheduleRender({ skipTable: false });
      setGlobalMessage("Example range loaded (includes intentional 10-minute data gap)", false);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load example", true);
    }
  });

  resetViewBtn.addEventListener("click", function () {
    resetViewport();
  });

  bindHoldAction(panLeftBtn, function () {
    panViewport(-1, 0.08);
  });
  bindHoldAction(panRightBtn, function () {
    panViewport(1, 0.08);
  });
  bindHoldAction(zoomInBtn, function () {
    zoomViewport(0.9);
  });
  bindHoldAction(zoomOutBtn, function () {
    zoomViewport(1.11);
  });

  fitPacketsBtn.addEventListener("click", function () {
    fitViewportToPackets();
  });

  colorMapBtn.addEventListener("click", function () {
    toggleColorMap();
  });

  followLiveBtn.addEventListener("click", async function () {
    if (!selectedDeviceId) {
      return;
    }
    await loadDeviceHistory(selectedDeviceId);
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

  canvas.style.cursor = "grab";

  canvas.addEventListener("mousedown", function (event) {
    if (event.button !== 0) {
      return;
    }

    var span = getCurrentViewSpanMs();
    if (!span || span <= 0) {
      return;
    }

    isPanning = true;
    followLatest24 = false;
    panStartClientX = event.clientX;
    panStartFromMs = viewportFromMs;
    panStartToMs = viewportToMs;
    canvas.style.cursor = "grabbing";
    gapTooltipEl.classList.add("hidden");
    event.preventDefault();
  });

  window.addEventListener("mousemove", function (event) {
    if (!isPanning) {
      return;
    }

    var span = panStartToMs - panStartFromMs;
    if (!Number.isFinite(span) || span <= 0) {
      return;
    }

    var canvasWidth = Math.max(1, canvas.clientWidth || 1);
    var dx = event.clientX - panStartClientX;
    var shiftMs = Math.round((-dx / canvasWidth) * span);

    viewportFromMs = panStartFromMs + shiftMs;
    viewportToMs = panStartToMs + shiftMs;
    scheduleRender({ skipTable: true });
    markInteractionActive();
  });

  window.addEventListener("mouseup", function () {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    canvas.style.cursor = "grab";
    scheduleRender({ skipTable: false });
  });

  canvas.addEventListener(
    "wheel",
    function (event) {
      var rect = canvas.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var anchor = clamp(x / Math.max(1, rect.width), 0, 1);

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) + 2) {
        var directionX = event.deltaX > 0 ? 1 : -1;
        panViewport(directionX, 0.05);
      } else if (event.shiftKey) {
        var directionY = event.deltaY > 0 ? 1 : -1;
        panViewport(directionY, 0.08);
      } else {
        var factor;
        if (event.altKey) {
          factor = event.deltaY < 0 ? 0.94 : 1.07;
        } else if (event.ctrlKey || event.metaKey) {
          factor = event.deltaY < 0 ? 0.8 : 1.24;
        } else {
          factor = event.deltaY < 0 ? 0.88 : 1.14;
        }
        zoomViewportAt(factor, anchor);
      }

      gapTooltipEl.classList.add("hidden");
      event.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener("dblclick", function (event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var anchor = clamp(x / Math.max(1, rect.width), 0, 1);
    zoomViewportAt(0.78, anchor);
  });

  canvas.addEventListener("contextmenu", function (event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var anchor = clamp(x / Math.max(1, rect.width), 0, 1);
    zoomViewportAt(1.22, anchor);
    event.preventDefault();
  });

  window.addEventListener("keydown", function (event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "ArrowLeft") {
      panViewport(-1, 0.1);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight") {
      panViewport(1, 0.1);
      event.preventDefault();
      return;
    }

    if (event.key === "+" || event.key === "=") {
      zoomViewport(0.88);
      event.preventDefault();
      return;
    }

    if (event.key === "-") {
      zoomViewport(1.14);
      event.preventDefault();
      return;
    }

    if (event.key === "0") {
      resetViewport();
      event.preventDefault();
      return;
    }

    if (event.key === "f" || event.key === "F") {
      fitViewportToPackets();
      event.preventDefault();
      return;
    }

    if ((event.key === "l" || event.key === "L") && selectedDeviceId) {
      loadDeviceHistory(selectedDeviceId).catch(function (error) {
        setGlobalMessage(error instanceof Error ? error.message : "Failed to switch to live mode", true);
      });
      event.preventDefault();
      return;
    }

    if (event.key === "Escape") {
      probeTooltipEl.classList.add("hidden");
    }
  });

  function formatGapTooltip(gap) {
    var mins = Math.round(gap.durationMs / 60000);
    return (
      "Data Gap<br>" +
      "Start: " +
      new Date(gap.start).toISOString() +
      "<br>End: " +
      new Date(gap.end).toISOString() +
      "<br>Duration: " +
      mins +
      " min"
    );
  }

  function getPacketValueAt(packet, row, col) {
    if (!packet || !Array.isArray(packet.data) || packet.data.length === 0 || !Array.isArray(packet.data[0])) {
      return NaN;
    }

    if (!Array.isArray(packet.data[row])) {
      return NaN;
    }

    var value = packet.data[row][col];
    return Number.isFinite(value) ? value : NaN;
  }

  function magnitudeToDb(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return Number.NEGATIVE_INFINITY;
    }
    return 20 * Math.log10(n);
  }

  function formatDbValue(dbValue) {
    if (!Number.isFinite(dbValue)) {
      return "-inf dB";
    }
    return dbValue.toFixed(1) + " dB";
  }

  function findProbeSample(timeMs, rowIndex) {
    if (!lastRenderMeta || !Number.isFinite(lastRenderMeta.fromMs) || !Number.isFinite(lastRenderMeta.toMs)) {
      return null;
    }

    var visiblePackets = getVisiblePackets(lastRenderMeta.fromMs, lastRenderMeta.toMs);
    for (var i = 0; i < visiblePackets.length; i += 1) {
      var packet = visiblePackets[i];
      var matrix = packet && packet.data;
      if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
        continue;
      }

      var rows = matrix.length;
      var cols = matrix[0].length;
      if (rowIndex < 0 || rowIndex >= rows) {
        continue;
      }

      var interval = getPacketInterval(packet);
      var startMs;
      var endMs;
      if (interval) {
        startMs = interval.startMs;
        endMs = interval.endMs;
      } else {
        var ts = getPacketTimestampMs(packet);
        if (!Number.isFinite(ts)) {
          continue;
        }
        var stepMs = Number(packet.timeStepMs || activeTimeStepMs);
        if (!Number.isFinite(stepMs) || stepMs <= 0) {
          stepMs = 1;
        }
        startMs = ts - (cols - 1) * stepMs;
        endMs = ts + stepMs;
      }

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        continue;
      }

      if (timeMs < startMs || timeMs > endMs) {
        continue;
      }

      var colIndex = Math.floor(((timeMs - startMs) / (endMs - startMs)) * cols);
      colIndex = clamp(colIndex, 0, cols - 1);

      return {
        packet: packet,
        rowIndex: rowIndex,
        colIndex: colIndex,
        rows: rows,
        cols: cols
      };
    }

    return null;
  }

  function getProbeFrequencyHz(sample) {
    var bins = getPacketFrequencyBins(sample.packet);
    if (bins && bins.length === sample.rows) {
      return bins[sample.rowIndex];
    }

    if (
      lastRenderMeta &&
      Number.isFinite(lastRenderMeta.minFrequency) &&
      Number.isFinite(lastRenderMeta.maxFrequency) &&
      lastRenderMeta.maxFrequency > lastRenderMeta.minFrequency
    ) {
      if (sample.rows <= 1) {
        return lastRenderMeta.minFrequency;
      }
      var ratio = sample.rowIndex / (sample.rows - 1);
      return lastRenderMeta.minFrequency + ratio * (lastRenderMeta.maxFrequency - lastRenderMeta.minFrequency);
    }

    return null;
  }

  function buildProbeInfo(event) {
    if (!lastRenderMeta || !lastRenderMeta.layout) {
      return null;
    }

    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    var layout = lastRenderMeta.layout;

    if (x < layout.plotLeft || x > layout.plotRight || y < layout.plotTop || y > layout.plotBottom) {
      return null;
    }

    if (!Number.isFinite(lastRenderMeta.fromMs) || !Number.isFinite(lastRenderMeta.toMs)) {
      return null;
    }

    var xFrac = clamp((x - layout.plotLeft) / Math.max(1, layout.plotRight - layout.plotLeft), 0, 1);
    var yFrac = clamp((y - layout.plotTop) / Math.max(1, layout.plotBottom - layout.plotTop), 0, 1);
    var timeMs = lastRenderMeta.fromMs + xFrac * (lastRenderMeta.toMs - lastRenderMeta.fromMs);
    var rowIndex = Math.round((1 - yFrac) * Math.max(0, lastRenderMeta.binCount - 1));

    var sample = findProbeSample(timeMs, rowIndex);
    if (!sample) {
      return null;
    }

    var rawValue = getPacketValueAt(sample.packet, sample.rowIndex, sample.colIndex);
    var dbValue = magnitudeToDb(rawValue);
    var freqHz = getProbeFrequencyHz(sample);

    return {
      timeMs: timeMs,
      rowIndex: sample.rowIndex,
      colIndex: sample.colIndex,
      rawValue: rawValue,
      dbValue: dbValue,
      freqHz: freqHz
    };
  }

  function formatProbeTooltip(info) {
    var frequencyText = Number.isFinite(info.freqHz)
      ? Math.round(info.freqHz) + " Hz"
      : "Band " + info.rowIndex;

    return (
      "Probe\u00a0Point<br>" +
      "Time: " +
      new Date(info.timeMs).toISOString() +
      "<br>Frequency: " +
      frequencyText +
      "<br>Raw value: " +
      (Number.isFinite(info.rawValue) ? info.rawValue.toFixed(3) : "NaN") +
      "<br>Amplitude: " +
      formatDbValue(info.dbValue)
    );
  }

  canvas.addEventListener("mousemove", function (event) {
    if (isPanning || !lastRenderMeta || !Array.isArray(lastRenderMeta.gaps) || !lastRenderMeta.layout) {
      gapTooltipEl.classList.add("hidden");
      return;
    }

    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    var layout = lastRenderMeta.layout;

    if (x < layout.plotLeft || x > layout.plotRight || y < layout.plotTop || y > layout.plotBottom) {
      gapTooltipEl.classList.add("hidden");
      return;
    }

    var hitGap = null;
    for (var i = 0; i < lastRenderMeta.gaps.length; i += 1) {
      var gap = lastRenderMeta.gaps[i];
      if (x >= gap.xStart && x <= gap.xEnd) {
        hitGap = gap;
        break;
      }
    }

    if (!hitGap) {
      gapTooltipEl.classList.add("hidden");
      return;
    }

    gapTooltipEl.innerHTML = formatGapTooltip(hitGap);
    gapTooltipEl.style.left = event.clientX + 14 + "px";
    gapTooltipEl.style.top = event.clientY + 14 + "px";
    gapTooltipEl.classList.remove("hidden");
  });

  canvas.addEventListener("mouseleave", function () {
    gapTooltipEl.classList.add("hidden");
  });

  canvas.addEventListener("click", function (event) {
    if (isPanning) {
      return;
    }

    var info = buildProbeInfo(event);
    if (!info) {
      probeTooltipEl.classList.add("hidden");
      return;
    }

    probeTooltipEl.innerHTML = formatProbeTooltip(info);
    probeTooltipEl.style.left = event.clientX + 14 + "px";
    probeTooltipEl.style.top = event.clientY + 14 + "px";
    probeTooltipEl.classList.remove("hidden");
  });

  function setupSocket() {
    var socket = io();
    var lastHeartbeatAt = 0;

    function markHeartbeat() {
      lastHeartbeatAt = Date.now();
      setSocketStatus(true, "Heartbeat OK");
    }

    socket.on("connect", function () {
      markHeartbeat();
      socket.emit("client:heartbeat", { ts: Date.now() });
    });

    socket.on("disconnect", function (reason) {
      setSocketStatus(false, reason || "Connection lost");
    });

    socket.on("connect_error", function () {
      setSocketStatus(false, "Connection error");
    });

    socket.on("server:heartbeat", function () {
      markHeartbeat();
    });

    var heartbeatTimer = setInterval(function () {
      if (!socket.connected) {
        setSocketStatus(false, "Retrying");
        return;
      }

      if (lastHeartbeatAt && Date.now() - lastHeartbeatAt > 30000) {
        setSocketStatus(false, "No heartbeat");
      }

      socket.emit("client:heartbeat", { ts: Date.now() });
    }, 15000);

    socket.on("device:data", function (payload) {
      if (!payloadMatchesSelectedDevice(payload)) {
        return;
      }

      normalizePacketTiming(payload);
      var payloadTime = getPacketTimestampMs(payload);
      if (!Number.isFinite(payloadTime)) {
        return;
      }

      insertPacketSorted(payload);
      scheduleRender({ skipTable: false });

      if (payload.persisted === false) {
        var nowMs = Date.now();
        if (nowMs - lastPersistenceWarningAt > 10000) {
          lastPersistenceWarningAt = nowMs;
          setGlobalMessage(
            "Live data received for " + selectedDeviceName + " but DB save failed for at least one packet.",
            true
          );
        }
      }

      historyInfoEl.textContent =
        "Live updated | packets: " +
        currentPackets.length +
        " | Latest timestamp: " +
        formatLocalDateTime(payload.timestamp) +
        " | mode: " +
        activeRangeMode;
    });

    socket.on("device:error", function (payload) {
      if (payload && payload.message) {
        setGlobalMessage(payload.message, true);
      }
    });
  }

  logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  });

  activateTab("history");
  resetUserForm();
  resetDeviceForm();

  var queryDateInput = document.getElementById("queryDate");
  var fromTimeInput = document.getElementById("fromTime");
  var toTimeInput = document.getElementById("toTime");
  if (
    queryDateInput instanceof HTMLInputElement &&
    fromTimeInput instanceof HTMLInputElement &&
    toTimeInput instanceof HTMLInputElement
  ) {
    var now = new Date();
    queryDateInput.value = formatDateOnly(now);
    fromTimeInput.value = "00:00";
    toTimeInput.value = formatTimeOnly(now);
  }

  loadDevices().catch(function (error) {
    setGlobalMessage(error instanceof Error ? error.message : "Failed to load devices", true);
  });

  if (isAdmin) {
    loadUsers().catch(function (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load users", true);
    });
  }

  if (!isAdmin) {
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
  activeColorMap = "magma";
  updateColorMapButtonLabel();
  intensityModeSelect.value = activeIntensityMode;
  dbMinInput.value = String(activeDbMin);
  dbMaxInput.value = String(activeDbMax);
  pctLowInput.value = String(activePercentileLow);
  pctHighInput.value = String(activePercentileHigh);
  compareViewSelect.value = activeCompareView;
  noiseSuppressionEnabledInput.checked = activeNoiseSuppressionEnabled;
  noiseFloorPercentileInput.value = String(activeNoiseFloorPercentile);
  noiseThresholdInput.value = String(activeNoiseThreshold);
  isolatedPixelRemovalEnabledInput.checked = activeIsolatedPixelRemovalEnabled;
  minActiveNeighborsInput.value = String(activeMinActiveNeighbors);
  neighborhoodSizeSelect.value = String(activeNeighborhoodSize);
  bucketAggregationSelect.value = activeBucketAggregation;
  debugStatsEnabledInput.checked = activeDebugStatsEnabled;
  updateIntensityControlsState();
  applyNoiseSettings();
  window.Spectrogram.drawLegend(legendCanvas);

  setupSocket();
})();
