import { state } from "./state.js";
import { clamp, formatLocalDateTime, isTypingTarget } from "./utils.js";
import { loadDeviceHistory } from "./history-api.js";
import { getCurrentViewSpanMs, panViewport, zoomViewport, zoomViewportAt, resetViewport, fitViewportToPackets } from "./viewport.js";
import { findMarkerHitAtCanvasPoint, addTimeMarkerFromEvent, removeTimeMarkerAtCanvasPoint } from "./time-markers.js";
import { buildProbeInfo, formatProbeTooltip } from "./probe.js";

var _scheduleRender = null;
var _markInteractionActive = null;
var _canvas = null;
var _probeTooltipEl = null;
var _gapTooltipEl = null;
var _panLeftBtn = null;
var _panRightBtn = null;
var _zoomInBtn = null;
var _zoomOutBtn = null;
var _setGlobalMessage = null;
var _globalMessageEl = null;

export function initCanvasInteraction(deps) {
  _scheduleRender = deps.scheduleRender;
  _markInteractionActive = deps.markInteractionActive;
  _canvas = deps.canvas;
  _probeTooltipEl = deps.probeTooltipEl;
  _gapTooltipEl = deps.gapTooltipEl;
  _panLeftBtn = deps.panLeftBtn;
  _panRightBtn = deps.panRightBtn;
  _zoomInBtn = deps.zoomInBtn;
  _zoomOutBtn = deps.zoomOutBtn;
  _setGlobalMessage = deps.setGlobalMessage;
  _globalMessageEl = deps.globalMessageEl;

  _canvas.style.cursor = "grab";

  bindHoldAction(_panLeftBtn, function () {
    panViewport(-1, 0.08);
  });
  bindHoldAction(_panRightBtn, function () {
    panViewport(1, 0.08);
  });
  bindHoldAction(_zoomInBtn, function () {
    zoomViewport(0.9);
  });
  bindHoldAction(_zoomOutBtn, function () {
    zoomViewport(1.11);
  });

  _canvas.addEventListener("mousedown", function (event) {
    if (event.button !== 0) {
      return;
    }

    var markerHit = findMarkerHitAtCanvasPoint(event);
    if (markerHit && markerHit.markerIndex >= 0 && markerHit.markerIndex < state.timeMarkers.length) {
      state.isDraggingMarker = true;
      state.draggedMarkerIndex = markerHit.markerIndex;
      state.markerDragStartClientX = event.clientX;
      state.markerDragHasMoved = false;
      _canvas.style.cursor = "ew-resize";
      _gapTooltipEl.classList.add("hidden");
      event.preventDefault();
      return;
    }

    var span = getCurrentViewSpanMs();
    if (!span || span <= 0) {
      return;
    }

    state.isPanning = true;
    state.panHasMoved = false;
    state.panStartClientX = event.clientX;
    state.panStartFromMs = state.viewportFromMs;
    state.panStartToMs = state.viewportToMs;
    _canvas.style.cursor = "grabbing";
    _gapTooltipEl.classList.add("hidden");
    event.preventDefault();
  });

  window.addEventListener("mousemove", function (event) {
    if (state.isDraggingMarker) {
      if (!state.lastRenderMeta || !state.lastRenderMeta.layout) {
        return;
      }

      if (!Number.isFinite(state.lastRenderMeta.fromMs) || !Number.isFinite(state.lastRenderMeta.toMs)) {
        return;
      }

      if (state.draggedMarkerIndex < 0 || state.draggedMarkerIndex >= state.timeMarkers.length) {
        return;
      }

      var rect = _canvas.getBoundingClientRect();
      var layout = state.lastRenderMeta.layout;
      var clampedX = clamp(event.clientX - rect.left, layout.plotLeft, layout.plotRight);
      var spanMs = state.lastRenderMeta.toMs - state.lastRenderMeta.fromMs;
      if (!Number.isFinite(spanMs) || spanMs <= 0) {
        return;
      }

      var xFrac = (clampedX - layout.plotLeft) / Math.max(1e-9, layout.plotRight - layout.plotLeft);
      var timeMs = state.lastRenderMeta.fromMs + xFrac * spanMs;

      state.timeMarkers[state.draggedMarkerIndex].timeMs = timeMs;
      if (!state.markerDragHasMoved && Math.abs(event.clientX - state.markerDragStartClientX) >= 3) {
        state.markerDragHasMoved = true;
      }

      _scheduleRender({ skipTable: true });
      return;
    }

    if (!state.isPanning) {
      return;
    }

    var span = state.panStartToMs - state.panStartFromMs;
    if (!Number.isFinite(span) || span <= 0) {
      return;
    }

    var canvasWidth = Math.max(1, _canvas.clientWidth || 1);
    var dx = event.clientX - state.panStartClientX;

    if (!state.panHasMoved && Math.abs(dx) >= 3) {
      state.panHasMoved = true;
      state.liveManualBrowseActive = true;
    }

    var shiftMs = Math.round((-dx / canvasWidth) * span);

    state.viewportFromMs = state.panStartFromMs + shiftMs;
    state.viewportToMs = state.panStartToMs + shiftMs;
    _scheduleRender({ skipTable: true });
    _markInteractionActive();
  });

  window.addEventListener("mouseup", function () {
    if (state.isDraggingMarker) {
      state.isDraggingMarker = false;
      state.draggedMarkerIndex = -1;
      state.skipMarkerRemovalClick = state.markerDragHasMoved;
      state.markerDragHasMoved = false;
      _canvas.style.cursor = "grab";
      _scheduleRender({ skipTable: false });
      return;
    }

    if (!state.isPanning) {
      return;
    }
    state.isPanning = false;
    state.panHasMoved = false;
    _canvas.style.cursor = "grab";
    _scheduleRender({ skipTable: false });
  });

  _canvas.addEventListener(
    "wheel",
    function (event) {
      var rect = _canvas.getBoundingClientRect();
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

      _gapTooltipEl.classList.add("hidden");
      event.preventDefault();
    },
    { passive: false }
  );

  _canvas.addEventListener("dblclick", function (event) {
    if (event.button !== 0) {
      event.preventDefault();
      return;
    }
    addTimeMarkerFromEvent(event);
    event.preventDefault();
  });

  _canvas.addEventListener("contextmenu", function (event) {
    // Disable right-click zoom interaction on the canvas.
    event.preventDefault();
  });

  _canvas.addEventListener("mousemove", function (event) {
    if (
      state.isPanning ||
      !state.lastRenderMeta ||
      !Array.isArray(state.lastRenderMeta.gaps) ||
      !state.lastRenderMeta.layout
    ) {
      _gapTooltipEl.classList.add("hidden");
      return;
    }

    var rect = _canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    var layout = state.lastRenderMeta.layout;

    if (x < layout.plotLeft || x > layout.plotRight || y < layout.plotTop || y > layout.plotBottom) {
      _gapTooltipEl.classList.add("hidden");
      return;
    }

    var hitGap = null;
    for (var i = 0; i < state.lastRenderMeta.gaps.length; i += 1) {
      var gap = state.lastRenderMeta.gaps[i];
      if (x >= gap.xStart && x <= gap.xEnd) {
        hitGap = gap;
        break;
      }
    }

    if (!hitGap) {
      _gapTooltipEl.classList.add("hidden");
      return;
    }

    _gapTooltipEl.innerHTML = formatGapTooltip(hitGap);
    _gapTooltipEl.style.left = event.clientX + 14 + "px";
    _gapTooltipEl.style.top = event.clientY + 14 + "px";
    _gapTooltipEl.classList.remove("hidden");
  });

  _canvas.addEventListener("mouseleave", function () {
    _gapTooltipEl.classList.add("hidden");
  });

  _canvas.addEventListener("click", function (event) {
    if (state.isPanning) {
      return;
    }

    if (state.skipMarkerRemovalClick) {
      state.skipMarkerRemovalClick = false;
      return;
    }

    if (removeTimeMarkerAtCanvasPoint(event)) {
      _probeTooltipEl.classList.add("hidden");
      return;
    }

    var info = buildProbeInfo(event);
    if (!info) {
      _probeTooltipEl.classList.add("hidden");
      return;
    }

    _probeTooltipEl.innerHTML = formatProbeTooltip(info);
    _probeTooltipEl.style.left = event.clientX + 14 + "px";
    _probeTooltipEl.style.top = event.clientY + 14 + "px";
    _probeTooltipEl.classList.remove("hidden");
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

    if ((event.key === "l" || event.key === "L") && state.selectedDeviceId) {
      loadDeviceHistory(state.selectedDeviceId).catch(function (error) {
        _setGlobalMessage(_globalMessageEl, error instanceof Error ? error.message : "فشل التبديل إلى الوضع المباشر", true);
      });
      event.preventDefault();
      return;
    }

    if (event.key === "Escape") {
      _probeTooltipEl.classList.add("hidden");
    }
  });
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

function formatGapTooltip(gap) {
  var mins = Math.round(gap.durationMs / 60000);
  return (
    "فجوة بيانات<br>" +
    "البداية: " +
    formatLocalDateTime(gap.start) +
    "<br>النهاية: " +
    formatLocalDateTime(gap.end) +
    "<br>المدة: " +
    mins +
    " دقيقة"
  );
}