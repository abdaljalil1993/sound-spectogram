import { state } from "./state.js";
import { setGlobalMessage, setSocketStatus } from "./ui-status.js";
import { markLiveTrace } from "./live-trace.js";
import { insertPacketSorted } from "./packet-store.js";
import { normalizePacketTiming, getPacketTimestampMs, getPacketEndMs } from "./packet-timing.js";
import { syncLatestLiveViewport } from "./viewport.js";
import { formatLocalDateTime } from "./utils.js";

var _scheduleRender = null;
var _historyInfoEl = null;
var _socketStatusBadgeEl = null;
var _globalMessageEl = null;
var _payloadMatchesSelectedDevice = null;

export function initSocket(deps) {
  _scheduleRender = deps.scheduleRender;
  _historyInfoEl = deps.historyInfoEl;
  _socketStatusBadgeEl = deps.socketStatusBadgeEl;
  _globalMessageEl = deps.globalMessageEl;
  _payloadMatchesSelectedDevice = deps.payloadMatchesSelectedDevice;
}

export function setupSocket() {
  var socket = io();
  var lastHeartbeatAt = 0;

  function markHeartbeat() {
    lastHeartbeatAt = Date.now();
    setSocketStatus(_socketStatusBadgeEl, true, "نبضة الاتصال سليمة");
  }

  socket.on("connect", function () {
    markHeartbeat();
    socket.emit("client:heartbeat", { ts: Date.now() });
  });

  socket.on("disconnect", function (reason) {
    setSocketStatus(_socketStatusBadgeEl, false, reason || "انقطع الاتصال");
  });

  socket.on("connect_error", function () {
    setSocketStatus(_socketStatusBadgeEl, false, "خطأ في الاتصال");
  });

  socket.on("server:heartbeat", function () {
    markHeartbeat();
  });

  var heartbeatTimer = setInterval(function () {
    if (!socket.connected) {
      setSocketStatus(_socketStatusBadgeEl, false, "جاري إعادة المحاولة");
      return;
    }

    if (lastHeartbeatAt && Date.now() - lastHeartbeatAt > 30000) {
      setSocketStatus(_socketStatusBadgeEl, false, "لا توجد نبضات اتصال");
    }

    socket.emit("client:heartbeat", { ts: Date.now() });
  }, 15000);

  socket.on("device:data", function (payload) {
    markLiveTrace("socket-received");

    if (!_payloadMatchesSelectedDevice(payload)) {
      markLiveTrace("drop-device", { issue: "payload does not match selected device" });
      return;
    }
    markLiveTrace("socket-matched");

    normalizePacketTiming(payload);
    var payloadTime = getPacketTimestampMs(payload);
    if (!Number.isFinite(payloadTime)) {
      markLiveTrace("drop-time", { issue: "payload timestamp is invalid" });
      return;
    }

    if (state.isHistoryLoading) {
      state.pendingLivePackets.push(payload);
      markLiveTrace("buffered", { packetTimeMs: payloadTime });
      return;
    }

    var inserted = insertPacketSorted(payload);
    if (!inserted) {
      markLiveTrace("duplicate", { packetTimeMs: payloadTime });
      return;
    }
    state.expectingLiveRender = true;
    markLiveTrace("inserted", { packetTimeMs: payloadTime });
    if (state.liveFollowEnabled) {
      state.liveManualBrowseActive = false;
      syncLatestLiveViewport(getPacketEndMs(payload));
    }
    _scheduleRender({ skipTable: false });

    if (payload.persisted === false) {
      var nowMs = Date.now();
      if (nowMs - state.lastPersistenceWarningAt > 10000) {
        state.lastPersistenceWarningAt = nowMs;
        setGlobalMessage(
          _globalMessageEl,
          "تم استقبال بيانات مباشرة للجهاز " + state.selectedDeviceName + " لكن فشل حفظ باكت واحد على الأقل في قاعدة البيانات.",
          true
        );
      }
    }

    _historyInfoEl.textContent =
      "تحديث مباشر | عدد الباكتات: " +
      state.currentPackets.length +
      " | آخر توقيت: " +
      formatLocalDateTime(payload.timestamp) +
      " | النمط: " +
      state.activeRangeMode;
  });

  socket.on("device:error", function (payload) {
    if (payload && payload.message) {
      setGlobalMessage(_globalMessageEl, payload.message, true);
    }
  });
}