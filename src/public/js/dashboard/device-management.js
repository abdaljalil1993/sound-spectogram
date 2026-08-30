import { state } from "./state.js";
import { apiRequest } from "./api.js";
import { loadDeviceHistory } from "./history-api.js";
import { setGlobalMessage, setActiveDevice } from "./ui-status.js";
import { DEFAULT_LIVE_WINDOW_MS } from "./constants.js";
import { parseOptionalNumberInput } from "./utils.js";

var deviceListEl = null;
var devicesTableBody = null;
var deviceForm = null;
var deviceIdInput = null;
var deviceNameInput = null;
var deviceDescriptionInput = null;
var deviceMinFrequencyInput = null;
var deviceMaxFrequencyInput = null;
var deviceSaveBtn = null;
var deviceCancelBtn = null;
var deviceFormMessage = null;
var selectedDeviceTitleEl = null;
var historyInfoEl = null;
var historyTableBody = null;
var sideDeviceInfoEl = null;
var globalMessageEl = null;

export function initDeviceManagement(deps) {
  deviceListEl = deps.deviceListEl;
  devicesTableBody = deps.devicesTableBody;
  deviceForm = deps.deviceForm;
  deviceIdInput = deps.deviceIdInput;
  deviceNameInput = deps.deviceNameInput;
  deviceDescriptionInput = deps.deviceDescriptionInput;
  deviceMinFrequencyInput = deps.deviceMinFrequencyInput;
  deviceMaxFrequencyInput = deps.deviceMaxFrequencyInput;
  deviceSaveBtn = deps.deviceSaveBtn;
  deviceCancelBtn = deps.deviceCancelBtn;
  deviceFormMessage = deps.deviceFormMessage;
  selectedDeviceTitleEl = deps.selectedDeviceTitleEl;
  historyInfoEl = deps.historyInfoEl;
  historyTableBody = deps.historyTableBody;
  sideDeviceInfoEl = deps.sideDeviceInfoEl;
  globalMessageEl = deps.globalMessageEl;

  deviceListEl.addEventListener("change", function () {
    var selectedId = Number(deviceListEl.value);
    if (!Number.isFinite(selectedId)) {
      return;
    }

    var device = state.devicesCache.find(function (d) {
      return Number(d.id) === selectedId;
    });
    if (!device) {
      return;
    }

    selectDevice(device).catch(function (error) {
      historyInfoEl.textContent = error instanceof Error ? error.message : "فشل تحميل السجل";
    });
  });

  deviceForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.isAdmin) {
      setGlobalMessage(globalMessageEl, "فقط المدير يمكنه إدارة الأجهزة", true);
      return;
    }

    var payload = {
      name: deviceNameInput.value.trim(),
      description: deviceDescriptionInput.value.trim(),
      minFrequency: parseOptionalNumberInput(deviceMinFrequencyInput.value),
      maxFrequency: parseOptionalNumberInput(deviceMaxFrequencyInput.value)
    };

    if (
      Number.isFinite(payload.minFrequency) &&
      Number.isFinite(payload.maxFrequency) &&
      payload.maxFrequency <= payload.minFrequency
    ) {
      setGlobalMessage(globalMessageEl, "يجب أن يكون أعلى تردد أكبر من أقل تردد", true);
      return;
    }

    try {
      if (state.editingDeviceId) {
        await apiRequest("/api/devices/" + state.editingDeviceId, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setGlobalMessage(globalMessageEl, "تم تحديث الجهاز بنجاح", false);
      } else {
        await apiRequest("/api/devices", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setGlobalMessage(globalMessageEl, "تم إنشاء الجهاز بنجاح", false);
      }

      resetDeviceForm();
      await loadDevices();
    } catch (error) {
      setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل حفظ الجهاز", true);
    }
  });

  deviceCancelBtn.addEventListener("click", function () {
    resetDeviceForm();
  });
}

export async function selectDevice(device) {
  state.selectedDeviceId = device.id;
  state.selectedDeviceName = device.name;
  state.selectedDeviceKey = normalizeDeviceKey(device.name);
  state.selectedDeviceMinFrequency = Number.isFinite(device.minFrequency) ? device.minFrequency : null;
  state.selectedDeviceMaxFrequency = Number.isFinite(device.maxFrequency) ? device.maxFrequency : null;
  selectedDeviceTitleEl.textContent = "الجهاز المحدد: " + device.name;
  sideDeviceInfoEl.textContent =
    "المعرّف: " +
    device.id +
    " | الاسم: " +
    device.name +
    " | الوصف: " +
    (device.description || "-") +
    " | نطاق التردد: " +
    (Number.isFinite(state.selectedDeviceMinFrequency) && Number.isFinite(state.selectedDeviceMaxFrequency)
      ? state.selectedDeviceMinFrequency + " Hz -> " + state.selectedDeviceMaxFrequency + " Hz"
      : "غير مضبوط");
  setActiveDevice(deviceListEl, device.id);
  await loadDeviceHistory(device.id, null, null, {
    liveWindowMs: DEFAULT_LIVE_WINDOW_MS,
    modeLabel: "latest30m"
  });
}

export function renderDeviceSidebar() {
  deviceListEl.innerHTML = "";
  state.devicesCache.forEach(function (device) {
    var option = document.createElement("option");
    option.value = String(device.id);
    option.textContent = device.name;
    deviceListEl.appendChild(option);
  });
}

export async function loadDevices() {
  state.devicesCache = await apiRequest("/api/devices");
  renderDeviceSidebar();
  renderDevicesTable();

  if (state.devicesCache.length > 0) {
    var target = state.devicesCache[0];
    if (state.selectedDeviceId) {
      var found = state.devicesCache.find(function (d) {
        return Number(d.id) === Number(state.selectedDeviceId);
      });
      if (found) {
        target = found;
      }
    }
    await selectDevice(target);
  } else {
    selectedDeviceTitleEl.textContent = "لا توجد أجهزة";
    historyInfoEl.textContent = "قم بإنشاء أجهزة عبر الـAPI بصلاحية مدير.";
    historyTableBody.innerHTML = "";
    sideDeviceInfoEl.textContent = "لا يوجد جهاز محدد.";
  }
}

export function resetDeviceForm() {
  state.editingDeviceId = null;
  deviceIdInput.value = "";
  deviceNameInput.value = "";
  deviceDescriptionInput.value = "";
  deviceMinFrequencyInput.value = "";
  deviceMaxFrequencyInput.value = "";
  deviceSaveBtn.textContent = "إضافة جهاز";
  deviceFormMessage.textContent = "";
}

export function renderDevicesTable() {
  devicesTableBody.innerHTML = "";

  state.devicesCache.forEach(function (device) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      device.id +
      "</td><td>" +
      device.name +
      "</td><td>" +
      (device.description || "") +
      "</td><td>" +
      (Number.isFinite(device.minFrequency) && Number.isFinite(device.maxFrequency)
        ? device.minFrequency + " - " + device.maxFrequency + " Hz"
        : "-") +
      "</td>";

    if (state.isAdmin) {
      var actionTd = document.createElement("td");
      actionTd.className = "action-buttons";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "ghost-btn";
        editBtn.textContent = "تعديل";
      editBtn.addEventListener("click", function () {
        state.editingDeviceId = device.id;
        deviceIdInput.value = String(device.id);
        deviceNameInput.value = device.name;
        deviceDescriptionInput.value = device.description || "";
        deviceMinFrequencyInput.value = Number.isFinite(device.minFrequency) ? String(device.minFrequency) : "";
        deviceMaxFrequencyInput.value = Number.isFinite(device.maxFrequency) ? String(device.maxFrequency) : "";
        deviceSaveBtn.textContent = "تحديث جهاز";
        deviceFormMessage.textContent = "تعديل الجهاز رقم " + device.id;
      });

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "danger-btn";
      deleteBtn.textContent = "حذف";
      deleteBtn.addEventListener("click", async function () {
        if (!window.confirm("هل تريد حذف الجهاز " + device.name + "؟")) {
          return;
        }
        try {
          await apiRequest("/api/devices/" + device.id, { method: "DELETE" });
            if (Number(state.selectedDeviceId) === Number(device.id)) {
            state.selectedDeviceId = null;
            state.selectedDeviceName = "";
            state.selectedDeviceKey = "";
            state.currentPackets = [];
          }
          if (Number(state.editingDeviceId) === Number(device.id)) {
            resetDeviceForm();
          }
          await loadDevices();
          setGlobalMessage(globalMessageEl, "تم حذف الجهاز بنجاح", false);
        } catch (error) {
          setGlobalMessage(globalMessageEl, error instanceof Error ? error.message : "فشل الحذف", true);
        }
      });

      actionTd.appendChild(editBtn);
      actionTd.appendChild(deleteBtn);
      tr.appendChild(actionTd);
    }

    devicesTableBody.appendChild(tr);
  });
}

function normalizeDeviceKey(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().toLowerCase();
}

