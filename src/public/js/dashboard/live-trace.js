import { state } from "./state.js";

export function ensureLiveTraceElement() {
  // Live trace status is kept internal only; no on-page debug text is rendered.
  return null;
}

export function renderLiveTraceStatus() {
  // Intentionally hidden from UI.
}

export function markLiveTrace(stage, meta) {
  var details = meta || {};
  state.liveTraceCounters.lastStage = stage;

  if (stage === "socket-received") {
    state.liveTraceCounters.received += 1;
  } else if (stage === "socket-matched") {
    state.liveTraceCounters.matched += 1;
  } else if (stage === "buffered") {
    state.liveTraceCounters.buffered += 1;
  } else if (stage === "merged-from-buffer") {
    state.liveTraceCounters.mergedFromBuffer += Number(details.count) || 0;
  } else if (stage === "inserted") {
    state.liveTraceCounters.inserted += 1;
  } else if (stage === "duplicate") {
    state.liveTraceCounters.duplicates += 1;
  } else if (stage === "rendered") {
    state.liveTraceCounters.rendered += 1;
  } else if (stage === "drop-device") {
    state.liveTraceCounters.droppedByDevice += 1;
  } else if (stage === "drop-time") {
    state.liveTraceCounters.droppedByTime += 1;
  }

  if (Number.isFinite(details.packetTimeMs)) {
    state.liveTraceCounters.lastPacketIso = new Date(details.packetTimeMs).toISOString();
  }

  if (Number.isFinite(details.renderAtMs)) {
    state.liveTraceCounters.lastRenderIso = new Date(details.renderAtMs).toISOString();
  }

  if (typeof details.issue === "string") {
    state.liveTraceCounters.lastIssue = details.issue;
  }

  renderLiveTraceStatus();

  if (typeof window !== "undefined") {
    window.__liveTrace = {
      stage: state.liveTraceCounters.lastStage,
      received: state.liveTraceCounters.received,
      matched: state.liveTraceCounters.matched,
      buffered: state.liveTraceCounters.buffered,
      mergedFromBuffer: state.liveTraceCounters.mergedFromBuffer,
      inserted: state.liveTraceCounters.inserted,
      duplicates: state.liveTraceCounters.duplicates,
      rendered: state.liveTraceCounters.rendered,
      droppedByDevice: state.liveTraceCounters.droppedByDevice,
      droppedByTime: state.liveTraceCounters.droppedByTime,
      lastPacketIso: state.liveTraceCounters.lastPacketIso,
      lastRenderIso: state.liveTraceCounters.lastRenderIso,
      lastIssue: state.liveTraceCounters.lastIssue
    };
  }

  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info("[LiveTrace]", stage, details);
  }
}
