export function setGlobalMessage(globalMessageEl, message, isError) {
  globalMessageEl.textContent = message || "";
  globalMessageEl.style.color = isError ? "#8a1c18" : "#1f6f53";
}

export function setSocketStatus(socketStatusBadgeEl, isConnected, detail) {
  var label = isConnected ? "متصل" : "غير متصل";

  socketStatusBadgeEl.textContent = label;
  socketStatusBadgeEl.title = detail ? label + " | " + detail : label;
  socketStatusBadgeEl.classList.toggle("connected", !!isConnected);
  socketStatusBadgeEl.classList.toggle("disconnected", !isConnected);
}

export function setProcessingStatus(processingStatusEl, text, isWarning) {
  processingStatusEl.textContent = text || "";
  processingStatusEl.style.color = isWarning ? "#8a1c18" : "#375a4f";
  processingStatusEl.style.background = isWarning ? "#fff3f1" : "#eef7f3";
  processingStatusEl.style.borderColor = isWarning ? "#f2c9c2" : "#cee8de";
}

export function updateFollowLiveButtonState(followLiveBtn, liveFollowEnabled) {
  var isActive = !!liveFollowEnabled;
  followLiveBtn.classList.toggle("follow-live-active", isActive);
  followLiveBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
}

export function setActiveDevice(deviceListEl, deviceId) {
  if (deviceListEl instanceof HTMLSelectElement) {
    deviceListEl.value = String(deviceId);
  }
}
