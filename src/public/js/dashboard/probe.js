import { state } from "./state.js";
import { clamp, magnitudeToDb, formatDbValue } from "./utils.js";
import { getPacketFrequencyBins, getPacketInterval, getPacketTimestampMs, getPacketValueAt } from "./packet-timing.js";
import { getVisiblePackets } from "./packet-store.js";

// Deps injected once by dashboard.js via initProbe()
var _canvas = null;

export function initProbe(deps) {
  _canvas = deps.canvas;
}

export function findProbeSample(timeMs, rowIndex) {
  if (!state.lastRenderMeta || !Number.isFinite(state.lastRenderMeta.fromMs) || !Number.isFinite(state.lastRenderMeta.toMs)) {
    return null;
  }

  var visiblePackets = getVisiblePackets(state.lastRenderMeta.fromMs, state.lastRenderMeta.toMs);
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
      var stepMs = Number(packet.timeStepMs || state.activeTimeStepMs);
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

export function getProbeFrequencyHz(sample) {
  var bins = getPacketFrequencyBins(sample.packet);
  if (bins && bins.length === sample.rows) {
    return bins[sample.rowIndex];
  }

  if (
    state.lastRenderMeta &&
    Number.isFinite(state.lastRenderMeta.minFrequency) &&
    Number.isFinite(state.lastRenderMeta.maxFrequency) &&
    state.lastRenderMeta.maxFrequency > state.lastRenderMeta.minFrequency
  ) {
    if (sample.rows <= 1) {
      return state.lastRenderMeta.minFrequency;
    }
    var ratio = sample.rowIndex / (sample.rows - 1);
    return state.lastRenderMeta.minFrequency + ratio * (state.lastRenderMeta.maxFrequency - state.lastRenderMeta.minFrequency);
  }

  return null;
}

export function buildProbeInfo(event) {
  if (!state.lastRenderMeta || !state.lastRenderMeta.layout) {
    return null;
  }

  var rect = _canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  var layout = state.lastRenderMeta.layout;

  if (x < layout.plotLeft || x > layout.plotRight || y < layout.plotTop || y > layout.plotBottom) {
    return null;
  }

  if (!Number.isFinite(state.lastRenderMeta.fromMs) || !Number.isFinite(state.lastRenderMeta.toMs)) {
    return null;
  }

  var xFrac = clamp((x - layout.plotLeft) / Math.max(1, layout.plotRight - layout.plotLeft), 0, 1);
  var yFrac = clamp((y - layout.plotTop) / Math.max(1, layout.plotBottom - layout.plotTop), 0, 1);
  var timeMs = state.lastRenderMeta.fromMs + xFrac * (state.lastRenderMeta.toMs - state.lastRenderMeta.fromMs);
  var rowIndex = Math.round((1 - yFrac) * Math.max(0, state.lastRenderMeta.binCount - 1));

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

export function formatProbeTooltip(info) {
  var frequencyText = Number.isFinite(info.freqHz)
    ? Math.round(info.freqHz) + " Hz"
    : "نطاق " + info.rowIndex;

  return (
    "نقطة فحص<br>" +
    "الوقت: " +
    new Date(info.timeMs).toISOString().replace(".000Z", "") +
    "<br>التردد: " +
    frequencyText +
    "<br>القيمة الخام: " +
    (Number.isFinite(info.rawValue) ? info.rawValue.toFixed(3) : "NaN") +
    "<br>السعة: " +
    formatDbValue(info.dbValue)
  );
}
