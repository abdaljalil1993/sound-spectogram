import { state } from "./state.js";
import { formatNaiveDateTimeMs, formatLocalDateTime, parseFlexibleTimeMs } from "./utils.js";
import { markLiveTrace } from "./live-trace.js";
import { updateFollowLiveButtonState, setProcessingStatus } from "./ui-status.js";
import { parseDisplayFrequencyRange } from "./settings.js";
import { syncLatestLiveViewport } from "./viewport.js";
import { drawTimeMarkersOverlay } from "./time-markers.js";
import { getPacketFrequencyBins, getPacketStartMs, getPacketEndMs } from "./packet-timing.js";
import { getVisiblePackets } from "./packet-store.js";

var _followLiveBtn = null;
var _probeTooltipEl = null;
var _historyInfoEl = null;
var _historyTableBody = null;
var _gapTooltipEl = null;
var _canvas = null;
var _legendCanvas = null;
var _processingStatusEl = null;

var _renderRafId = null;
var _pendingRenderOptions = null;
var _interactionEndTimer = null;

export function initRender(deps) {
  _followLiveBtn = deps.followLiveBtn;
  _probeTooltipEl = deps.probeTooltipEl;
  _historyInfoEl = deps.historyInfoEl;
  _historyTableBody = deps.historyTableBody;
  _gapTooltipEl = deps.gapTooltipEl;
  _canvas = deps.canvas;
  _legendCanvas = deps.legendCanvas;
  _processingStatusEl = deps.processingStatusEl;
}

export function renderLatestPacket(options) {
  var renderOptions = options || {};
  updateFollowLiveButtonState(_followLiveBtn, state.liveFollowEnabled);
  _probeTooltipEl.classList.add("hidden");
  if (!state.currentPackets.length) {
    _historyInfoEl.textContent = "لا توجد بيانات للجهاز المحدد.";
    _historyTableBody.innerHTML = "";
    state.lastRenderMeta = null;
    state.renderedTimeMarkerHits = [];
    _gapTooltipEl.classList.add("hidden");
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
    _gapTooltipEl.classList.add("hidden");
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
    canvas: _canvas,
    legendCanvas: _legendCanvas,
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
    setProcessingStatus(_processingStatusEl, infoText, isScaleFallback);
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
    _historyInfoEl.textContent +=
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
    _historyInfoEl.textContent = _historyInfoEl.textContent + " | محور التردد: Hz";
  } else {
    _historyInfoEl.textContent = _historyInfoEl.textContent + " | محور التردد: نطاقات فقط (أضف sampleRate / minFrequency / maxFrequency لعرض Hz)";
  }

  if (state.activeDebugStatsEnabled && renderResult && renderResult.debugStats) {
    var s = renderResult.debugStats;
    _historyInfoEl.textContent =
      _historyInfoEl.textContent +
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

  _historyTableBody.innerHTML = "";
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
    _historyTableBody.appendChild(tr);
  });
}

export function scheduleRender(options) {
  _pendingRenderOptions = Object.assign({}, _pendingRenderOptions || {}, options || {});
  if (_renderRafId !== null) {
    return;
  }

  _renderRafId = window.requestAnimationFrame(function () {
    _renderRafId = null;
    var opts = _pendingRenderOptions || {};
    _pendingRenderOptions = null;
    renderLatestPacket(opts);
    if (state.expectingLiveRender) {
      state.expectingLiveRender = false;
      markLiveTrace("rendered", { renderAtMs: Date.now() });
    }
  });
}

export function markInteractionActive() {
  if (_interactionEndTimer) {
    clearTimeout(_interactionEndTimer);
  }

  _interactionEndTimer = setTimeout(function () {
    _interactionEndTimer = null;
    scheduleRender({ skipTable: false });
  }, 130);
}

export function clearSpectrogramCanvas(message) {
  var ctx = _canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  var dpr = window.devicePixelRatio || 1;
  var cssWidth = Math.max(480, Math.floor(_canvas.clientWidth || 960));
  var cssHeight = Math.max(320, Math.floor((_canvas.clientWidth || 960) * 0.43));
  _canvas.width = Math.floor(cssWidth * dpr);
  _canvas.height = Math.floor(cssHeight * dpr);
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

  window.Spectrogram.drawLegend(_legendCanvas);
}