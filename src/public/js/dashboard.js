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
  var currentPackets = [];
  var activeTimeStepMs = 1000;
  var activeRangeMode = "latest24";
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

  var topNav = document.getElementById("topNav");
  var tabButtons = document.querySelectorAll(".tab-btn");
  var historyPanel = document.getElementById("historyPanel");
  var usersPanel = document.getElementById("usersPanel");
  var devicesPanel = document.getElementById("devicesPanel");
  var globalMessageEl = document.getElementById("globalMessage");
  var userBadgeEl = document.getElementById("userBadge");

  var deviceListEl = document.getElementById("deviceList");
  var selectedDeviceTitleEl = document.getElementById("selectedDeviceTitle");
  var historyInfoEl = document.getElementById("historyInfo");
  var historyTableBody = document.getElementById("historyTableBody");
  var sideDeviceInfoEl = document.getElementById("sideDeviceInfo");
  var canvas = document.getElementById("spectrogramCanvas");
  var spectrogramLoaderEl = document.getElementById("spectrogramLoader");
  var legendCanvas = document.getElementById("spectrogramLegend");
  var gapTooltipEl = document.getElementById("gapTooltip");
  var historyRangeForm = document.getElementById("historyRangeForm");
  var latest24Btn = document.getElementById("latest24Btn");
  var loadExampleBtn = document.getElementById("loadExampleBtn");
  var resetViewBtn = document.getElementById("resetViewBtn");
  var panLeftBtn = document.getElementById("panLeftBtn");
  var panRightBtn = document.getElementById("panRightBtn");
  var zoomInBtn = document.getElementById("zoomInBtn");
  var zoomOutBtn = document.getElementById("zoomOutBtn");
  var fitPacketsBtn = document.getElementById("fitPacketsBtn");
  var colorMapBtn = document.getElementById("colorMapBtn");
  var followLiveBtn = document.getElementById("followLiveBtn");

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
    !deviceListEl ||
    !selectedDeviceTitleEl ||
    !historyInfoEl ||
    !historyTableBody ||
    !sideDeviceInfoEl ||
    !canvas ||
    !spectrogramLoaderEl ||
    !legendCanvas ||
    !gapTooltipEl ||
    !historyRangeForm ||
    !latest24Btn ||
    !loadExampleBtn ||
    !resetViewBtn ||
    !panLeftBtn ||
    !panRightBtn ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !fitPacketsBtn ||
    !colorMapBtn ||
    !followLiveBtn ||
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

  function setSpectrogramLoading(isLoading) {
    spectrogramLoaderEl.classList.toggle("hidden", !isLoading);
    canvas.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  var activeColorMap = "magma";

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
    if (activeRangeMode === "latest24" && followLatest24) {
      toMs = Date.now();
      fromMs = toMs - 24 * 60 * 60 * 1000;
      activeFromIso = new Date(fromMs).toISOString();
      activeToIso = new Date(toMs).toISOString();
      viewportFromMs = fromMs;
      viewportToMs = toMs;

      // Keep only recent packets in memory for the rolling 24-hour view.
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

    var minFrequency = null;
    var maxFrequency = null;
    for (var i = 0; i < visiblePackets.length; i += 1) {
      var packet = visiblePackets[i];
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

    var renderResult = window.Spectrogram.renderSpectrogram({
      canvas: canvas,
      legendCanvas: legendCanvas,
      blocks: visiblePackets,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      fastMode: !!renderOptions.skipTable,
      assumeSorted: true,
      minFrequency: minFrequency,
      maxFrequency: maxFrequency
    });
    lastRenderMeta = renderResult || null;

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

    historyInfoEl.textContent =
      "Range: " +
      formatLocalDateTime(fromMs) +
      " -> " +
      formatLocalDateTime(toMs) +
      " | Total packets: " +
      visiblePackets.length +
      " | View mode: " +
      (followLatest24 ? "Latest 24h (live)" : "Manual pan/zoom") +
      gapInfo;

    if (renderOptions.skipTable) {
      return;
    }

    if (renderResult && renderResult.hasRealFrequency) {
      historyInfoEl.textContent = historyInfoEl.textContent + " | Frequency axis: Hz";
    } else {
      historyInfoEl.textContent = historyInfoEl.textContent + " | Frequency axis: bands only (add sampleRate / minFrequency / maxFrequency for Hz labels)";
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

    var i = 0;
    while (i < currentPackets.length) {
      var currentTime = getPacketStartMs(currentPackets[i]);
      if (!Number.isFinite(currentTime) || packetTime < currentTime) {
        break;
      }
      i += 1;
    }

    currentPackets.splice(i, 0, packet);
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
    if (activeRangeMode === "latest24") {
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
    if (fromIso && toIsoValue) {
      endpoint += "?from=" + encodeURIComponent(fromIso) + "&to=" + encodeURIComponent(toIsoValue);
      activeRangeMode = "custom";
      activeFromIso = fromIso;
      activeToIso = toIsoValue;
      viewportFromMs = new Date(fromIso).getTime();
      viewportToMs = new Date(toIsoValue).getTime();
      followLatest24 = false;
    } else {
      activeRangeMode = "latest24";
      activeFromIso = null;
      activeToIso = null;
      followLatest24 = true;
      viewportFromMs = null;
      viewportToMs = null;
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

  async function selectDevice(device) {
    selectedDeviceId = device.id;
    selectedDeviceName = device.name;
    selectedDeviceKey = normalizeDeviceKey(device.name);
    selectedDeviceTitleEl.textContent = "Selected Device: " + device.name;
    sideDeviceInfoEl.textContent =
      "ID: " +
      device.id +
      " | Name: " +
      device.name +
      " | Description: " +
      (device.description || "-");
    setActiveDevice(device.id);
    await loadDeviceHistory(device.id);
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
      description: deviceDescriptionInput.value.trim()
    };

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
      setGlobalMessage("Latest 24 hours loaded for " + selectedDeviceName, false);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Failed to load history", true);
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

  function setupSocket() {
    var socket = io();

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
    axisMinFrequency: 30
  });
  activeColorMap = "magma";
  updateColorMapButtonLabel();
  window.Spectrogram.drawLegend(legendCanvas);

  setupSocket();
})();
