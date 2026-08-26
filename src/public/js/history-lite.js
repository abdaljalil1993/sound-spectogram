(function () {
  var token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
    return;
  }

  var deviceSelect = document.getElementById("deviceSelect");
  var fromInput = document.getElementById("fromInput");
  var toInput = document.getElementById("toInput");
  var colorMapSelect = document.getElementById("colorMapSelect");
  var zoomInput = document.getElementById("zoomInput");
  var loadBtn = document.getElementById("loadBtn");
  var latestBtn = document.getElementById("latestBtn");
  var statusEl = document.getElementById("status");
  var metaEl = document.getElementById("meta");
  var canvas = document.getElementById("spectrogramCanvas");
  var legendCanvas = document.getElementById("legendCanvas");
  var imageViewport = document.getElementById("imageViewport");

  if (!deviceSelect || !fromInput || !toInput || !colorMapSelect || !zoomInput || !loadBtn || !latestBtn || !statusEl || !metaEl || !canvas || !legendCanvas || !imageViewport) {
    return;
  }

  var state = {
    devices: [],
    defaultColorMap: "magma",
    matrix: null,
    zoom: 1
  };

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function parseDateTimeLocal(value) {
    if (!value) return null;
    var parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  function toLocalDateTimeInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }

    var pad = function (num) {
      return String(num).padStart(2, "0");
    };

    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":00"
    );
  }

  function setDefaultRange() {
    var to = new Date();
    var from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    fromInput.value = toLocalDateTimeInput(from);
    toInput.value = toLocalDateTimeInput(to);
  }

  async function requestJson(path, init) {
    var headers = {
      Accept: "application/json",
      ...(init && init.headers ? init.headers : {})
    };

    if (!headers.Authorization) {
      headers.Authorization = "Bearer " + token;
    }

    var response = await fetch(path, {
      ...init,
      headers: headers
    });

    if (response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return null;
    }

    if (!response.ok) {
      var text = await response.text();
      throw new Error(text || "فشل تنفيذ الطلب");
    }

    return response.json();
  }

  function normalizeBlocks(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map(function (item) {
        if (!item || typeof item !== "object") {
          return item;
        }

        if (!Array.isArray(item.data) && isCompressedMatrixPayload(item.data)) {
          item.data = decodeCompressedMatrixPayload(item.data);
        }

        return item;
      })
      .filter(function (item) {
      return item && Array.isArray(item.data) && item.data.length > 0;
    });
  }

  function isCompressedMatrixPayload(value) {
    return (
      value &&
      typeof value === "object" &&
      value.format === "gzip-base64-json-v1" &&
      typeof value.payload === "string"
    );
  }

  function decodeCompressedMatrixPayload(stored) {
    if (!isCompressedMatrixPayload(stored)) {
      return stored;
    }

    var pako = typeof window !== "undefined" ? window.pako : null;
    if (!pako || typeof pako.inflate !== "function") {
      throw new Error("مكتبة فك الضغط pako غير متاحة في المتصفح");
    }

    var binary = atob(stored.payload);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    var inflated = pako.inflate(bytes, { to: "string" });
    return JSON.parse(inflated);
  }

  function inferIntensityType(blocks) {
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block && typeof block.intensityType === "string") {
        return block.intensityType;
      }
    }
    return "normalized";
  }

  function inferFrequencyBins(blocks) {
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (Array.isArray(block.frequencyBins) && block.frequencyBins.length > 0) {
        return block.frequencyBins;
      }
    }
    return null;
  }

  function inferMinMaxFrequency(blocks) {
    var minFrequency = null;
    var maxFrequency = null;

    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      var deviceMin = Number(block && block.deviceMinFrequency); 
      var deviceMax = Number(block && block.deviceMaxFrequency);
      if (Number.isFinite(deviceMin) && Number.isFinite(deviceMax) && deviceMax > deviceMin) {
        minFrequency = deviceMin;
        maxFrequency = deviceMax;
        break;
      }

      if (block && Array.isArray(block.frequencyBins) && block.frequencyBins.length > 0) {
        var arr = block.frequencyBins;
        var fn = Number(arr[0]);
        var ln = Number(arr[arr.length - 1]);
        if (Number.isFinite(fn) && Number.isFinite(ln)) {
          minFrequency = fn;
          maxFrequency = ln;
          break;
        }
      }
    }

    return { minFrequency: minFrequency, maxFrequency: maxFrequency };
  }

  function applyColorMap(name) {
    var mapName = String(name || state.defaultColorMap || "magma").toLowerCase();
    if (mapName !== "magma" && mapName !== "sunset") {
      mapName = state.defaultColorMap;
    }

    window.Spectrogram.configure({ colorMap: mapName });
    window.Spectrogram.drawLegend(legendCanvas);
  }

  function clamp01(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function computeMatrixBounds(matrix) {
    var min = Infinity;
    var max = -Infinity;

    for (var r = 0; r < matrix.length; r += 1) {
      var row = matrix[r];
      if (!Array.isArray(row)) {
        continue;
      }

      for (var c = 0; c < row.length; c += 1) {
        var value = Number(row[c]);
        if (!Number.isFinite(value)) {
          continue;
        }
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }

    if (max <= min) {
      return { min: min, max: min + 1 };
    }

    return { min: min, max: max };
  }

  function directValueToColor(value) {
    if (window.Spectrogram && typeof window.Spectrogram.valueToColor === "function") {
      return window.Spectrogram.valueToColor(value);
    }

    return [255, 255, 255];
  }

  function applyZoom() {
    var zoom = Math.max(1, Math.min(12, Number(state.zoom) || 1));
    var currentWidth = canvas.width * zoom;
    var currentHeight = canvas.height * zoom;
    canvas.style.transform = "scale(" + zoom + ")";
    canvas.style.transformOrigin = "top left";
    imageViewport.style.width = currentWidth + "px";
    imageViewport.style.height = currentHeight + "px";
  }

  function renderDirectMatrix(matrix) {
    if (!matrix || !Array.isArray(matrix) || matrix.length === 0) {
      return;
    }

    var rows = matrix.length;
    var cols = Array.isArray(matrix[0]) ? matrix[0].length : 0;
    if (cols <= 0) {
      return;
    }

    var bounds = computeMatrixBounds(matrix);
    var span = bounds.max - bounds.min;
    if (!Number.isFinite(span) || span <= 0) {
      span = 1;
    }

    canvas.width = cols;
    canvas.height = rows;

    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    var imageData = ctx.createImageData(cols, rows);
    var data = imageData.data;
    var idx = 0;

    for (var r = 0; r < rows; r += 1) {
      var row = matrix[r];
      for (var c = 0; c < cols; c += 1) {
        var raw = Number(Array.isArray(row) ? row[c] : 0);
        if (!Number.isFinite(raw)) {
          raw = 0;
        }

        var normalized = clamp01((raw - bounds.min) / span);
        var rgb = directValueToColor(normalized);
        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = 255;
        idx += 4;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    canvas.style.transform = "scale(" + state.zoom + ")";
    canvas.style.transformOrigin = "top left";
    imageViewport.style.width = (cols * state.zoom) + "px";
    imageViewport.style.height = (rows * state.zoom) + "px";
  }

  async function loadDevices() {
    var result = await requestJson("/api/devices");
    if (!result || !Array.isArray(result)) {
      return;
    }

    state.devices = result;
    deviceSelect.innerHTML = "";

    result.forEach(function (device) {
      var option = document.createElement("option");
      option.value = String(device.id);
      option.textContent = device.name || ("جهاز " + device.id);
      deviceSelect.appendChild(option);
    });

    if (result.length > 0) {
      deviceSelect.value = String(result[0].id);
    }
  }

  async function loadHistory() {
    var deviceId = Number(deviceSelect.value);
    if (!deviceId) {
      setStatus("يرجى اختيار جهاز أولاً.", true);
      return;
    }

    var fromDate = parseDateTimeLocal(fromInput.value);
    var toDate = parseDateTimeLocal(toInput.value);

    if (!fromDate || !toDate || toDate <= fromDate) {
      setStatus("تأكد من أن تاريخ البداية أصغر من النهاية.", true);
      return;
    }

    setStatus("جاري قراءة بيانات التاريخ من قاعدة البيانات...");

    try {
      var url =
        "/api/devices/" +
        deviceId +
        "/history?from=" +
        encodeURIComponent(fromInput.value) +
        "&to=" +
        encodeURIComponent(toInput.value);
      var items = await requestJson(url);
      var blocks = normalizeBlocks(items);

      if (!blocks.length) {
        setStatus("لا توجد بيانات في النطاق المحدد.", true);
        metaEl.textContent = "لا توجد بيانات في هذا النطاق للـ device المحدد.";
        return;
      }

      var intensityType = inferIntensityType(blocks);
      var frequencyBins = inferFrequencyBins(blocks);
      var freqRange = inferMinMaxFrequency(blocks);

      applyColorMap(colorMapSelect.value);
      window.Spectrogram.configure({
        background: "#140d28",
        colorMap: String(colorMapSelect.value || state.defaultColorMap),
        smoothVertical: true,
        gapFill: "rgba(54, 103, 194, 0.24)",
        gapStroke: "rgba(102, 196, 231, 0.9)",
        maxFastColumnStride: 8
      });

      var rawPacket = null;
      for (var i = blocks.length - 1; i >= 0; i -= 1) {
        if (blocks[i] && Array.isArray(blocks[i].data) && blocks[i].data.length > 0) {
          rawPacket = blocks[i];
          break;
        }
      }

      if (!rawPacket) {
        setStatus("لا توجد مصفوفة صالحة للعرض المباشر في هذا النطاق.", true);
        return;
      }

      state.matrix = rawPacket.data;
      state.zoom = Math.max(1, Math.min(12, Number(zoomInput.value) || 1));
      renderDirectMatrix(state.matrix);

      var packetCount = blocks.length;
      var totalSeconds = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 1000);
      setStatus("تمت قراءة " + packetCount + " باكت من سجل الجهاز وعرضها مباشرة دون دمج إضافي.");
      metaEl.textContent =
        "المدى: " + fromDate.toLocaleString() + " → " + toDate.toLocaleString() +
        " | الباكتات: " + packetCount +
        " | المدة: " + Math.round(totalSeconds / 60) + " دقيقة" +
        " | خريطة الألوان: " + (colorMapSelect.value || state.defaultColorMap) +
        " | التكبير: " + state.zoom +
        " | المصفوفة: " + state.matrix.length + " × " + (Array.isArray(state.matrix[0]) ? state.matrix[0].length : 0) +
        " | الشدة: " + (intensityType || "normalized") +
        " | التردد: " + (freqRange.minFrequency && freqRange.maxFrequency ? Math.round(freqRange.minFrequency) + "-" + Math.round(freqRange.maxFrequency) + " Hz" : "تلقائي");
    } catch (error) {
      setStatus(error && error.message ? error.message : "فشل تحميل البيانات.", true);
      metaEl.textContent = "فشل في قراءة بيانات التاريخ.";
    }
  }

  colorMapSelect.addEventListener("change", function () {
    applyColorMap(colorMapSelect.value);
    if (state.matrix && state.matrix.length > 0) {
      renderDirectMatrix(state.matrix);
    } else if (deviceSelect.value) {
      loadHistory();
    }
  });

  zoomInput.addEventListener("input", function () {
    state.zoom = Math.max(1, Math.min(12, Number(zoomInput.value) || 1));
    if (state.matrix && state.matrix.length > 0) {
      renderDirectMatrix(state.matrix);
    }
  });

  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    var delta = event.deltaY || event.wheelDelta || 0;
    if (delta < 0) {
      state.zoom = Math.min(12, state.zoom + 1);
    } else {
      state.zoom = Math.max(1, state.zoom - 1);
    }
    zoomInput.value = String(state.zoom);
    if (state.matrix && state.matrix.length > 0) {
      renderDirectMatrix(state.matrix);
    }
  }, { passive: false });

  loadBtn.addEventListener("click", loadHistory);
  latestBtn.addEventListener("click", function () {
    setDefaultRange();
    loadHistory();
  });

  setDefaultRange();
  loadDevices().then(function () {
    loadHistory();
  }).catch(function (error) {
    setStatus(error && error.message ? error.message : "فشل في جلب الأجهزة.", true);
  });
})();
