import { state } from "./state.js";
import { clamp } from "./utils.js";
import { formatNaiveDateTimeMs } from "./utils.js";

// Deps injected once by dashboard.js via initTimeMarkers()
var _canvas = null;
var _scheduleRender = null;

export function initTimeMarkers(deps) {
  _canvas = deps.canvas;
  _scheduleRender = deps.scheduleRender;
}

export function formatMarkerLabelTime(timeMs) {
  return formatNaiveDateTimeMs(timeMs, true);
}

export function drawTimeMarkersOverlay() {
  state.renderedTimeMarkerHits = [];
  if (!state.lastRenderMeta || !state.lastRenderMeta.layout) {
    return;
  }

  if (!Number.isFinite(state.lastRenderMeta.fromMs) || !Number.isFinite(state.lastRenderMeta.toMs)) {
    return;
  }

  var layout = state.lastRenderMeta.layout;
  var range = state.lastRenderMeta.toMs - state.lastRenderMeta.fromMs;
  if (!Number.isFinite(range) || range <= 0) {
    return;
  }

  var ctx = _canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255, 214, 10, 0.95)";
  ctx.fillStyle = "rgba(255, 214, 10, 0.95)";
  ctx.lineWidth = 1.2;
  ctx.font = "bold 15px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  var baseBoxTop = layout.plotTop + 34;
  var laneGap = 8;
  var laneRightEdges = [];
  var visibleMarkers = [];

  for (var i = 0; i < state.timeMarkers.length; i += 1) {
    var marker = state.timeMarkers[i];
    var timeMs = Number(marker && marker.timeMs);
    if (!Number.isFinite(timeMs)) {
      continue;
    }

    var xFrac = (timeMs - state.lastRenderMeta.fromMs) / range;
    var x = layout.plotLeft + xFrac * (layout.plotRight - layout.plotLeft);
    if (x < layout.plotLeft || x > layout.plotRight) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(x + 0.5, layout.plotBottom);
    ctx.lineTo(x + 0.5, layout.plotTop);
    ctx.stroke();

    var label = formatMarkerLabelTime(timeMs);
    var textWidth = ctx.measureText(label).width;
    var boxPaddingX = 10;
    var boxHeight = 27;
    var boxWidth = Math.max(40, Math.round(textWidth + boxPaddingX * 2));

    visibleMarkers.push({
      markerIndex: i,
      x: x,
      label: label,
      boxWidth: boxWidth,
      boxHeight: boxHeight
    });
  }

  visibleMarkers.sort(function (a, b) {
    return a.x - b.x;
  });

  for (var vm = 0; vm < visibleMarkers.length; vm += 1) {
    var visibleMarker = visibleMarkers[vm];
    var rawBoxLeft = visibleMarker.x - visibleMarker.boxWidth / 2;
    var boxLeft = clamp(rawBoxLeft, layout.plotLeft, layout.plotRight - visibleMarker.boxWidth);
    var laneIndex = 0;
    while (laneIndex < laneRightEdges.length && boxLeft <= laneRightEdges[laneIndex] + 6) {
      laneIndex += 1;
    }
    if (laneIndex === laneRightEdges.length) {
      laneRightEdges.push(boxLeft + visibleMarker.boxWidth);
    } else {
      laneRightEdges[laneIndex] = boxLeft + visibleMarker.boxWidth;
    }

    var boxTop = baseBoxTop + laneIndex * (visibleMarker.boxHeight + laneGap);

    ctx.fillStyle = "rgba(18, 22, 30, 0.86)";
    ctx.fillRect(boxLeft, boxTop, visibleMarker.boxWidth, visibleMarker.boxHeight);
    ctx.strokeStyle = "rgba(255, 214, 10, 0.95)";
    ctx.strokeRect(boxLeft + 0.5, boxTop + 0.5, visibleMarker.boxWidth - 1, visibleMarker.boxHeight - 1);
    ctx.fillStyle = "rgba(255, 238, 142, 1)";
    ctx.fillText(
      visibleMarker.label,
      boxLeft + visibleMarker.boxWidth / 2,
      boxTop + visibleMarker.boxHeight - 6
    );

    state.renderedTimeMarkerHits.push({
      markerIndex: visibleMarker.markerIndex,
      lineX: visibleMarker.x,
      lineTop: layout.plotTop,
      lineBottom: layout.plotBottom,
      labelLeft: boxLeft,
      labelTop: boxTop,
      labelRight: boxLeft + visibleMarker.boxWidth,
      labelBottom: boxTop + visibleMarker.boxHeight
    });

    ctx.strokeStyle = "rgba(255, 214, 10, 0.95)";
    ctx.fillStyle = "rgba(255, 214, 10, 0.95)";
  }

  ctx.restore();
}

export function findMarkerHitAtCanvasPoint(event) {
  if (!state.renderedTimeMarkerHits.length) {
    return null;
  }

  var rect = _canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;

  for (var i = state.renderedTimeMarkerHits.length - 1; i >= 0; i -= 1) {
    var hit = state.renderedTimeMarkerHits[i];
    var onLabel =
      x >= hit.labelLeft && x <= hit.labelRight && y >= hit.labelTop && y <= hit.labelBottom;
    var onLine =
      Math.abs(x - hit.lineX) <= 4 && y >= hit.lineTop && y <= hit.lineBottom;

    if (onLabel || onLine) {
      return hit;
    }
  }

  return null;
}

export function removeTimeMarkerAtCanvasPoint(event) {
  var hit = findMarkerHitAtCanvasPoint(event);
  if (!hit) {
    return false;
  }

  if (hit.markerIndex >= 0 && hit.markerIndex < state.timeMarkers.length) {
    state.timeMarkers.splice(hit.markerIndex, 1);
    _scheduleRender({ skipTable: true });
    return true;
  }

  return false;
}

export function addTimeMarkerFromEvent(event) {
  if (!state.lastRenderMeta || !state.lastRenderMeta.layout) {
    return false;
  }

  if (!Number.isFinite(state.lastRenderMeta.fromMs) || !Number.isFinite(state.lastRenderMeta.toMs)) {
    return false;
  }

  var rect = _canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var layout = state.lastRenderMeta.layout;
  if (x < layout.plotLeft || x > layout.plotRight) {
    return false;
  }

  var span = state.lastRenderMeta.toMs - state.lastRenderMeta.fromMs;
  if (!Number.isFinite(span) || span <= 0) {
    return false;
  }

  var xFrac = (x - layout.plotLeft) / Math.max(1e-9, layout.plotRight - layout.plotLeft);
  var timeMs = state.lastRenderMeta.fromMs + xFrac * span;
  state.timeMarkers.push({ timeMs: timeMs });
  _scheduleRender({ skipTable: true });
  return true;
}
