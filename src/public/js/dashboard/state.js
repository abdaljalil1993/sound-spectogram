// Shared mutable state for the dashboard IIFE, extracted for future modularization.
// Every variable corresponds exactly to a top-level `var` declaration inside the
// original src/public/js/dashboard.js IIFE.  Initial values are identical to the
// originals.  DOM element references are intentionally NOT included here — they
// will be kept as local references inside whichever module ends up owning them.

import { DEFAULT_LIVE_WINDOW_MS, ONE_HOUR_WINDOW_MS, MAX_LOAD_WINDOW_MS, MAX_PACKETS_IN_MEMORY } from "./constants.js";

export const state = {

  // ── Auth / Session ────────────────────────────────────────────────────────
  token: null,           // set from localStorage at boot; kept here for completeness
  user: null,            // parsed JSON from localStorage; null on parse error
  isAdmin: false,        // derived from user.role === "admin" after DOM guard
  // roleLabel's real value must be assigned at the same point isAdmin is assigned its
  // real value in dashboard.js — right after the null-user guard, alongside:
  //   isAdmin = user.role === "admin";
  //   roleLabel = user.role === "admin" ? "مدير" : "موظف";
  // This will be wired up when state.js is first imported into dashboard.js.
  roleLabel: "",

  // ── Selected Device ───────────────────────────────────────────────────────
  selectedDeviceId: null,
  selectedDeviceName: "",
  selectedDeviceKey: "",
  selectedDeviceMinFrequency: null,
  selectedDeviceMaxFrequency: null,

  // ── Packet Store ──────────────────────────────────────────────────────────
  currentPackets: [],
  activeTimeStepMs: 1000,
  currentPacketKeys: new Set(),

  // ── Viewport / Live-Follow ────────────────────────────────────────────────
  activeRangeMode: "latest1h",
  activeFromIso: null,
  activeToIso: null,
  viewportFromMs: null,
  viewportToMs: null,
  followLatest24: true,          // vestigial — preserved as-is
  liveFollowEnabled: true,
  liveManualBrowseActive: false,
  currentLiveWindowMs: DEFAULT_LIVE_WINDOW_MS,
  LIVE_WINDOW_LABEL: "آخر 30 دقيقة",    // vestigial — preserved as-is

  // ── Constants (imported from constants.js — no literal redefinition) ─────────
  DEFAULT_LIVE_WINDOW_MS,
  ONE_HOUR_WINDOW_MS,
  MAX_LOAD_WINDOW_MS,
  MAX_PACKETS_IN_MEMORY,

  // ── Load / Buffering ──────────────────────────────────────────────────────
  isHistoryLoading: false,
  historyLoadSequence: 0,
  pendingLivePackets: [],

  // ── Canvas Interaction (pan / drag-marker) ────────────────────────────────
  isPanning: false,
  panHasMoved: false,
  panStartClientX: 0,
  panStartFromMs: 0,
  panStartToMs: 0,
  isDraggingMarker: false,
  draggedMarkerIndex: -1,
  markerDragStartClientX: 0,
  markerDragHasMoved: false,
  skipMarkerRemovalClick: false,

  // ── Render Scheduling ─────────────────────────────────────────────────────
  renderRafId: null,
  pendingRenderOptions: null,
  interactionEndTimer: null,
  lastRenderMeta: null,
  expectingLiveRender: false,

  // ── Time Markers ──────────────────────────────────────────────────────────
  timeMarkers: [],
  renderedTimeMarkerHits: [],

  // ── Admin / Forms ─────────────────────────────────────────────────────────
  devicesCache: [],
  editingUserId: null,
  editingDeviceId: null,

  // ── Live Trace / Debug ────────────────────────────────────────────────────
  lastPersistenceWarningAt: 0,
  liveTraceEl: null,              // vestigial — preserved as-is
  liveTraceCounters: {
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
  },

  // ── Display Settings (active*) ────────────────────────────────────────────
  activeColorMap: "magma",
  activeDisplayGainDb: 0,
  activeIntensityMode: "linear",
  activeDbMin: -95,
  activeDbMax: -20,
  activePercentileLow: 5,
  activePercentileHigh: 99,
  activeCompareView: "denoised",
  activeNoiseSuppressionEnabled: true,
  activeNoiseFloorPercentile: 72,
  activeNoiseThreshold: 0.06,
  activeIsolatedPixelRemovalEnabled: true,
  activeMinActiveNeighbors: 1,
  activeNeighborhoodSize: 3,
  activeBucketAggregation: "max",
  activeDebugStatsEnabled: false
};
