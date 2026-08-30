import { state } from "./state.js";
import { clamp, parseOptionalNumberInput } from "./utils.js";

// deps injected once by dashboard.js via initSettings()
var _scheduleRender = null;
var _setGlobalMessage = null;
var _globalMessageEl = null;

// DOM element refs injected once by initSettings()
var _colorMapBtn = null;
var _displayGainInput = null;
var _displayGainValue = null;
var _freqMinInput = null;
var _freqMaxInput = null;
var _intensityModeSelect = null;
var _dbMinInput = null;
var _dbMaxInput = null;
var _pctLowInput = null;
var _pctHighInput = null;
var _compareViewSelect = null;
var _noiseSuppressionEnabledInput = null;
var _noiseFloorPercentileInput = null;
var _noiseThresholdInput = null;
var _isolatedPixelRemovalEnabledInput = null;
var _minActiveNeighborsInput = null;
var _neighborhoodSizeSelect = null;
var _bucketAggregationSelect = null;
var _debugStatsEnabledInput = null;

export function initSettings(deps) {
  _scheduleRender                  = deps.scheduleRender;
  _setGlobalMessage                = deps.setGlobalMessage;
  _globalMessageEl                 = deps.globalMessageEl;
  _colorMapBtn                     = deps.colorMapBtn;
  _displayGainInput                = deps.displayGainInput;
  _displayGainValue                = deps.displayGainValue;
  _freqMinInput                    = deps.freqMinInput;
  _freqMaxInput                    = deps.freqMaxInput;
  _intensityModeSelect             = deps.intensityModeSelect;
  _dbMinInput                      = deps.dbMinInput;
  _dbMaxInput                      = deps.dbMaxInput;
  _pctLowInput                     = deps.pctLowInput;
  _pctHighInput                    = deps.pctHighInput;
  _compareViewSelect               = deps.compareViewSelect;
  _noiseSuppressionEnabledInput    = deps.noiseSuppressionEnabledInput;
  _noiseFloorPercentileInput       = deps.noiseFloorPercentileInput;
  _noiseThresholdInput             = deps.noiseThresholdInput;
  _isolatedPixelRemovalEnabledInput = deps.isolatedPixelRemovalEnabledInput;
  _minActiveNeighborsInput         = deps.minActiveNeighborsInput;
  _neighborhoodSizeSelect          = deps.neighborhoodSizeSelect;
  _bucketAggregationSelect         = deps.bucketAggregationSelect;
  _debugStatsEnabledInput          = deps.debugStatsEnabledInput;
}

export function parseBoolInput(input, fallback) {
  if (!(input instanceof HTMLInputElement)) {
    return fallback;
  }
  return !!input.checked;
}

export function parseDisplayFrequencyRange() {
  var minValue = parseOptionalNumberInput(_freqMinInput.value);
  var maxValue = parseOptionalNumberInput(_freqMaxInput.value);

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) {
    return null;
  }

  return {
    min: minValue,
    max: maxValue
  };
}

export function applyFrequencyRangeFilter() {
  var range = parseDisplayFrequencyRange();
  if (!range) {
    _setGlobalMessage(_globalMessageEl, "أدخل قيمًا صحيحة لأقل وأعلى تردد (Hz).", true);
    return;
  }

  _setGlobalMessage(_globalMessageEl, "تم ضبط نطاق التردد على " + range.min + " Hz - " + range.max + " Hz", false);
  _scheduleRender({ skipTable: false });
}

export function clearFrequencyRangeFilter() {
  _freqMinInput.value = "";
  _freqMaxInput.value = "";
  _setGlobalMessage(_globalMessageEl, "تم مسح مرشح التردد العمودي.", false);
  _scheduleRender({ skipTable: false });
}

export function updateIntensityControlsState() {
  var mode = String(state.activeIntensityMode || "linear");
  var isDbFixed = mode === "db-fixed";
  var isDbPercentile = mode === "db-percentile";

  _dbMinInput.disabled = !isDbFixed;
  _dbMaxInput.disabled = !isDbFixed;
  _pctLowInput.disabled = !isDbPercentile;
  _pctHighInput.disabled = !isDbPercentile;
}

export function applyNoiseSettings() {
  var compareView = String(_compareViewSelect.value || "denoised").toLowerCase();
  if (compareView !== "original" && compareView !== "thresholded" && compareView !== "denoised") {
    compareView = "denoised";
  }

  var floorPercentile = Number(_noiseFloorPercentileInput.value);
  if (!Number.isFinite(floorPercentile)) {
    floorPercentile = 72;
  }
  floorPercentile = clamp(floorPercentile, 1, 99);

  var threshold = Number(_noiseThresholdInput.value);
  if (!Number.isFinite(threshold)) {
    threshold = 0.06;
  }
  threshold = clamp(threshold, 0, 1);

  var minNeighbors = Math.round(Number(_minActiveNeighborsInput.value));
  if (!Number.isFinite(minNeighbors)) {
    minNeighbors = 1;
  }
  minNeighbors = clamp(minNeighbors, 0, 24);

  var neighborhoodSize = Math.round(Number(_neighborhoodSizeSelect.value));
  if (neighborhoodSize !== 5) {
    neighborhoodSize = 3;
  }

  var aggregation = String(_bucketAggregationSelect.value || "max").toLowerCase();
  if (aggregation !== "hybrid") {
    aggregation = "max";
  }

  state.activeCompareView = compareView;
  state.activeNoiseSuppressionEnabled = parseBoolInput(_noiseSuppressionEnabledInput, true);
  state.activeNoiseFloorPercentile = floorPercentile;
  state.activeNoiseThreshold = threshold;
  state.activeIsolatedPixelRemovalEnabled = parseBoolInput(_isolatedPixelRemovalEnabledInput, true);
  state.activeMinActiveNeighbors = minNeighbors;
  state.activeNeighborhoodSize = neighborhoodSize;
  state.activeBucketAggregation = aggregation;
  state.activeDebugStatsEnabled = parseBoolInput(_debugStatsEnabledInput, false);

  _compareViewSelect.value = state.activeCompareView;
  _noiseFloorPercentileInput.value = String(state.activeNoiseFloorPercentile);
  _noiseThresholdInput.value = String(state.activeNoiseThreshold);
  _minActiveNeighborsInput.value = String(state.activeMinActiveNeighbors);
  _neighborhoodSizeSelect.value = String(state.activeNeighborhoodSize);
  _bucketAggregationSelect.value = state.activeBucketAggregation;

  _scheduleRender({ skipTable: true });
  _setGlobalMessage(_globalMessageEl, "تم تطبيق إعدادات الضجيج", false);
}

export function applyIntensitySettings() {
  var mode = String(_intensityModeSelect.value || "linear");
  if (mode !== "linear" && mode !== "db-fixed" && mode !== "db-percentile") {
    mode = "linear";
  }

  var parsedDbMin = Number(_dbMinInput.value);
  var parsedDbMax = Number(_dbMaxInput.value);
  var parsedPctLow = Number(_pctLowInput.value);
  var parsedPctHigh = Number(_pctHighInput.value);

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

  state.activeIntensityMode = mode;
  state.activeDbMin = parsedDbMin;
  state.activeDbMax = parsedDbMax;
  state.activePercentileLow = parsedPctLow;
  state.activePercentileHigh = parsedPctHigh;

  _intensityModeSelect.value = state.activeIntensityMode;
  _dbMinInput.value = String(state.activeDbMin);
  _dbMaxInput.value = String(state.activeDbMax);
  _pctLowInput.value = String(state.activePercentileLow);
  _pctHighInput.value = String(state.activePercentileHigh);

  updateIntensityControlsState();
  _scheduleRender({ skipTable: true });
  _setGlobalMessage(_globalMessageEl, "تم تطبيق إعدادات المقياس", false);
}

export function applyDisplayGainSettings() {
  var displayGainDb = Number(_displayGainInput.value);
  if (!Number.isFinite(displayGainDb)) {
    displayGainDb = 0;
  }

  state.activeDisplayGainDb = clamp(displayGainDb, -24, 24);
  _displayGainInput.value = String(state.activeDisplayGainDb);
  _displayGainValue.textContent = String(state.activeDisplayGainDb) + " dB";
  _scheduleRender({ skipTable: true });
  _setGlobalMessage(_globalMessageEl, "تم تطبيق كسب العرض", false);
}

export function updateColorMapButtonLabel() {
  _colorMapBtn.textContent = "الألوان: " + state.activeColorMap;
  _colorMapBtn.title = "تبديل خريطة الألوان (الحالية: " + state.activeColorMap + ")";
}

export function applyColorMap(colorMap) {
  state.activeColorMap = String(colorMap || "magma").toLowerCase() === "sunset" ? "sunset" : "magma";
  window.Spectrogram.configure({
    colorMap: state.activeColorMap
  });
  updateColorMapButtonLabel();
  _scheduleRender({ skipTable: true });
}

export function toggleColorMap() {
  applyColorMap(state.activeColorMap === "magma" ? "sunset" : "magma");
}
