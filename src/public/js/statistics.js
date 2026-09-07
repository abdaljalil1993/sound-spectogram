(function () {
  var bridge = typeof window !== "undefined" ? window.DashboardBridge : null;
  if (!bridge) {
    return;
  }

  var statisticsPanel = document.getElementById("statisticsPanel");
  var deviceSelect = document.getElementById("statisticsDeviceSelect");
  var rangeForm = document.getElementById("statisticsRangeForm");
  var fromDateInput = document.getElementById("statisticsFromDate");
  var fromTimeInput = document.getElementById("statisticsFromTime");
  var toDateInput = document.getElementById("statisticsToDate");
  var toTimeInput = document.getElementById("statisticsToTime");
  var last24Btn = document.getElementById("statisticsLast24Btn");
  var messageEl = document.getElementById("statisticsMessage");
  var statusTextEl = document.getElementById("statisticsStatusText");
  var packetsTextEl = document.getElementById("statisticsPacketsText");
  var downtimeSummaryEl = document.getElementById("statisticsDowntimeSummary");
  var downtimeListEl = document.getElementById("statisticsDowntimeList");
  var timelineStripEl = document.getElementById("statisticsTimelineStrip");
  var timelineTextEl = document.getElementById("statisticsTimelineText");
  var hourlyTextEl = document.getElementById("statisticsHourlyText");
  var comparisonTextEl = document.getElementById("statisticsComparisonText");
  var statusChartCanvas = document.getElementById("statisticsStatusChart");
  var packetsChartCanvas = document.getElementById("statisticsPacketsChart");
  var hourlyChartCanvas = document.getElementById("statisticsHourlyChart");
  var comparisonChartCanvas = document.getElementById("statisticsComparisonChart");

  if (
    !statisticsPanel ||
    !(deviceSelect instanceof HTMLSelectElement) ||
    !(rangeForm instanceof HTMLFormElement) ||
    !(fromDateInput instanceof HTMLInputElement) ||
    !(fromTimeInput instanceof HTMLInputElement) ||
    !(toDateInput instanceof HTMLInputElement) ||
    !(toTimeInput instanceof HTMLInputElement) ||
    !(last24Btn instanceof HTMLButtonElement) ||
    !messageEl ||
    !statusTextEl ||
    !packetsTextEl ||
    !downtimeSummaryEl ||
    !downtimeListEl ||
    !timelineStripEl ||
    !timelineTextEl ||
    !hourlyTextEl ||
    !comparisonTextEl ||
    !(statusChartCanvas instanceof HTMLCanvasElement) ||
    !(packetsChartCanvas instanceof HTMLCanvasElement) ||
    !(hourlyChartCanvas instanceof HTMLCanvasElement) ||
    !(comparisonChartCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  var chartFactory = typeof window !== "undefined" ? window.Chart : null;
  var chartInstances = {
    status: null,
    packets: null,
    hourly: null,
    comparison: null
  };
  var hasAutoLoaded = false;
  var statusOrder = [
    { key: "detected", label: "هدف مكتشف", color: "#d13438" },
    { key: "possible", label: "هدف محتمل", color: "#f59e0b" },
    { key: "notDetected", label: "لا يوجد هدف", color: "#21a366" },
    { key: "unknown", label: "غير محدد", color: "#000000" }
  ];

  function setMessage(message, isError) {
    messageEl.textContent = message || "";
    messageEl.style.color = isError ? "#8a1c18" : "#375a4f";
  }

  function formatDateOnly(date) {
    var year = String(date.getFullYear()).padStart(4, "0");
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function formatTimeOnly(date) {
    var hours = String(date.getHours()).padStart(2, "0");
    var minutes = String(date.getMinutes()).padStart(2, "0");
    return hours + ":" + minutes;
  }

  function normalizeNaiveDateTimeString(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return null;
    }

    var year = String(date.getFullYear()).padStart(4, "0");
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var hours = String(date.getHours()).padStart(2, "0");
    var minutes = String(date.getMinutes()).padStart(2, "0");
    var seconds = String(date.getSeconds()).padStart(2, "0");
    return year + "-" + month + "-" + day + "T" + hours + ":" + minutes + ":" + seconds;
  }

  function formatLocalDateTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return String(value || "-");
    }

    return formatDateOnly(date) + " " + formatTimeOnly(date);
  }

  function applyLast24HoursRange() {
    var now = new Date();
    var from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    fromDateInput.value = formatDateOnly(from);
    fromTimeInput.value = formatTimeOnly(from);
    toDateInput.value = formatDateOnly(now);
    toTimeInput.value = formatTimeOnly(now);
  }

  function buildRangeQuery() {
    var fromLocal = fromDateInput.value + "T" + fromTimeInput.value;
    var toLocal = toDateInput.value + "T" + toTimeInput.value;
    var from = normalizeNaiveDateTimeString(fromLocal);
    var to = normalizeNaiveDateTimeString(toLocal);
    if (!from || !to) {
      throw new Error("قيم التاريخ أو الوقت غير صالحة");
    }

    if (new Date(from).getTime() > new Date(to).getTime()) {
      throw new Error("وقت البداية يجب أن يسبق وقت النهاية");
    }

    return "from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
  }

  function syncDeviceOptions(devices, selectedId) {
    var list = Array.isArray(devices) ? devices : [];
    var previousValue = String(selectedId || deviceSelect.value || "");
    deviceSelect.innerHTML = "";

    list.forEach(function (device) {
      var option = document.createElement("option");
      option.value = String(device.id);
      option.textContent = device.name;
      deviceSelect.appendChild(option);
    });

    if (!list.length) {
      return;
    }

    var targetValue = previousValue;
    var exists = list.some(function (device) {
      return String(device.id) === targetValue;
    });
    deviceSelect.value = exists ? targetValue : String(list[0].id);
  }

  function ensureChart(name, canvas, config) {
    if (!chartFactory) {
      return null;
    }

    if (chartInstances[name]) {
      chartInstances[name].destroy();
    }

    chartInstances[name] = new chartFactory(canvas, config);
    return chartInstances[name];
  }

  function buildTableHtml(headers, rows) {
    var thead = headers.map(function (header) {
      return "<th>" + header + "</th>";
    }).join("");
    var tbody = rows.map(function (row) {
      return "<tr>" + row.map(function (cell) {
        return "<td>" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<table class="statistics-summary-table"><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>';
  }

  function renderTable(container, headers, rows) {
    container.innerHTML = buildTableHtml(headers, rows);
  }

  function renderStatusDistribution(report) {
    var itemsByKey = {};
    (report.items || []).forEach(function (item) {
      itemsByKey[item.key] = item;
    });
    var orderedItems = statusOrder.map(function (status) {
      var item = itemsByKey[status.key] || {};
      return {
        label: status.label,
        color: status.color,
        count: Number(item.count) || 0,
        avgConfidence: Number.isFinite(Number(item.avgConfidence)) ? Number(item.avgConfidence) : null
      };
    });

    ensureChart("status", statusChartCanvas, {
      type: "doughnut",
      data: {
        labels: orderedItems.map(function (item) { return item.label; }),
        datasets: [{
          data: orderedItems.map(function (item) { return item.count; }),
          backgroundColor: orderedItems.map(function (item) { return item.color; }),
          borderColor: "#ffffff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } }
      }
    });

    renderTable(statusTextEl, ["الحالة", "العدد", "متوسط الثقة"], orderedItems.map(function (item) {
      return [item.label, String(item.count), item.avgConfidence === null ? "-" : String(item.avgConfidence) + "%"];
    }));
  }

  function renderReceivedVsExpected(report) {
    ensureChart("packets", packetsChartCanvas, {
      type: "bar",
      data: {
        labels: ["المستلم", "المتوقع", "المفقود"],
        datasets: [{
          label: "عدد الباكتات",
          data: [report.receivedCount, report.expectedCount, report.missingCount],
          backgroundColor: ["#0f766e", "#2563eb", "#d13438"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    packetsTextEl.innerHTML =
      '<div class="statistics-kpis">' +
      '<div class="statistics-kpi"><span class="statistics-kpi-label">المستلم</span><span class="statistics-kpi-value">' + report.receivedCount + '</span></div>' +
      '<div class="statistics-kpi"><span class="statistics-kpi-label">المتوقع</span><span class="statistics-kpi-value">' + report.expectedCount + '</span></div>' +
      '<div class="statistics-kpi"><span class="statistics-kpi-label">المفقود</span><span class="statistics-kpi-value">' + report.missingCount + '</span></div>' +
      '</div>';
  }

  function renderDowntime(report) {
    var longest = report.longestDowntimePeriod;
    var listHtml = '';
    if (!report.periods.length) {
      listHtml = '<p class="history-info">لا توجد فجوات توقف تتجاوز عتبة ' + report.downtimeThresholdMinutes + ' دقيقة.</p>';
    } else {
      listHtml = '<div class="statistics-downtime-list">' + report.periods.map(function (period, index) {
      var isLongest = longest && period.startMs === longest.startMs && period.endMs === longest.endMs;
      return (
        '<div class="statistics-downtime-item' + (isLongest ? ' statistics-downtime-item--longest' : '') + '">' +
        '<div class="statistics-downtime-headline">' +
        '<span class="statistics-downtime-title">فترة #' + (index + 1) + (isLongest ? ' - الأطول' : '') + '</span>' +
        '<span class="statistics-downtime-range">من ' + formatLocalDateTime(period.startTime) + ' إلى ' + formatLocalDateTime(period.endTime) + '</span>' +
        '</div>' +
        '<div>المدة: ' + period.durationMinutes + ' دقيقة</div>' +
        '</div>'
      );
      }).join("") + '</div>';
    }

    downtimeSummaryEl.innerHTML =
      '<div class="statistics-downtime-row">' +
      '<div class="statistics-kpis statistics-kpis-inline-3 statistics-downtime-kpis">' +
      '<div class="statistics-kpi statistics-kpi-compact"><span class="statistics-kpi-label">عدد فترات التوقف</span><span class="statistics-kpi-value statistics-kpi-value-compact">' + report.periods.length + '</span></div>' +
      '<div class="statistics-kpi statistics-kpi-compact"><span class="statistics-kpi-label">إجمالي التوقف</span><span class="statistics-kpi-value statistics-kpi-value-compact">' + report.totalDowntimeMinutes + ' د</span></div>' +
      '<div class="statistics-kpi statistics-kpi-compact"><span class="statistics-kpi-label">أطول توقف</span><span class="statistics-kpi-value statistics-kpi-value-compact">' + (longest ? longest.durationMinutes + ' د' : '-') + '</span></div>' +
      '</div>' +
      '<div class="statistics-downtime-scroll-panel">' + listHtml + '</div>' +
      '</div>';

    downtimeListEl.innerHTML = '';
  }

  function resolveStatusVisual(aiStatus) {
    var normalized = aiStatus === null || aiStatus === undefined ? null : Number(aiStatus);
    if (normalized === 1) {
      return statusOrder[0];
    }
    if (normalized === 0) {
      return statusOrder[1];
    }
    if (normalized === 2) {
      return statusOrder[2];
    }
    return statusOrder[3];
  }

  function renderTimeline(report) {
    var items = Array.isArray(report) ? report : [];
    if (!items.length) {
      timelineStripEl.innerHTML = "";
      timelineTextEl.innerHTML = '<p class="history-info">لا توجد بيانات زمنية ضمن النطاق.</p>';
      return;
    }

    var startMs = new Date(items[0].startTime || items[0].timestamp).getTime();
    var endMs = new Date(items[items.length - 1].endTime || items[items.length - 1].timestamp).getTime();
    var totalSpan = Math.max(1, endMs - startMs);

    timelineStripEl.innerHTML = items.map(function (item) {
      var segmentStart = new Date(item.startTime || item.timestamp).getTime();
      var segmentEnd = new Date(item.endTime || item.timestamp).getTime();
      var visual = resolveStatusVisual(item.aiStatus);
      var duration = Math.max(1, segmentEnd - segmentStart);
      var widthPercent = Math.max(0.6, (duration / totalSpan) * 100);
      var title = visual.label + ' | ' + formatLocalDateTime(item.startTime || item.timestamp) + ' -> ' + formatLocalDateTime(item.endTime || item.timestamp);
      return '<div class="statistics-timeline-segment" title="' + title + '" style="width:' + widthPercent + '%; background:' + visual.color + ';"></div>';
    }).join("");

    var legendHtml =
      '<div class="statistics-inline-legend">' +
      statusOrder.map(function (item) {
        return '<span class="statistics-inline-legend-item"><span class="statistics-inline-legend-swatch" style="background:' + item.color + ';"></span>' + item.label + '</span>';
      }).join("") +
      '</div>';

    timelineTextEl.innerHTML = legendHtml + buildTableHtml(["البداية", "النهاية", "الحالة", "الثقة"], items.map(function (item) {
      var visual = resolveStatusVisual(item.aiStatus);
      return [
        formatLocalDateTime(item.startTime || item.timestamp),
        formatLocalDateTime(item.endTime || item.timestamp),
        visual.label,
        item.confidence === null || item.confidence === undefined ? "-" : String(item.confidence) + "%"
      ];
    }));
  }

  function renderHourlyDistribution(report) {
    ensureChart("hourly", hourlyChartCanvas, {
      type: "bar",
      data: {
        labels: report.items.map(function (item) { return String(item.hourOfDay); }),
        datasets: [{
          label: "مرات الاكتشاف",
          data: report.items.map(function (item) { return item.count; }),
          backgroundColor: "#d13438"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });

    var hoursRow = report.items.map(function (item) {
      return "<td>" + String(item.hourOfDay) + "</td>";
    }).join("");
    var countsRow = report.items.map(function (item) {
      return "<td>" + String(item.count) + "</td>";
    }).join("");

    hourlyTextEl.innerHTML =
      '<div class="statistics-hourly-table-wrap">' +
      '<table class="statistics-summary-table statistics-hourly-compact-table">' +
      '<tbody>' +
      '<tr><th>الساعة</th>' + hoursRow + '</tr>' +
      '<tr><th>عدد الاكتشافات</th>' + countsRow + '</tr>' +
      '</tbody>' +
      '</table>' +
      '</div>';
  }

  function renderComparison(report) {
    var items = Array.isArray(report.items) ? report.items : [];
    ensureChart("comparison", comparisonChartCanvas, {
      type: "bar",
      data: {
        labels: items.map(function (item) { return item.deviceName; }),
        datasets: [
          { label: "مكتشف", data: items.map(function (item) { return item.counts.detected; }), backgroundColor: "#d13438" },
          { label: "محتمل", data: items.map(function (item) { return item.counts.possible; }), backgroundColor: "#f59e0b" },
          { label: "لا يوجد هدف", data: items.map(function (item) { return item.counts.notDetected; }), backgroundColor: "#21a366" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });

    renderTable(comparisonTextEl, ["الجهاز", "مكتشف", "محتمل", "لا يوجد هدف", "غير محدد", "الإجمالي"], items.map(function (item) {
      return [
        item.deviceName,
        String(item.counts.detected),
        String(item.counts.possible),
        String(item.counts.notDetected),
        String(item.counts.unknown),
        String(item.totalCount)
      ];
    }));
  }

  async function loadStatistics() {
    var deviceId = Number(deviceSelect.value);
    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      setMessage("لا يوجد جهاز محدد لعرض الإحصائيات.", true);
      return;
    }

    try {
      setMessage("جاري تحميل الإحصائيات...", false);
      var query = buildRangeQuery();
      var responses = await Promise.all([
        bridge.apiRequest("/api/devices/" + deviceId + "/statistics?" + query),
        bridge.apiRequest("/api/statistics/comparison?" + query)
      ]);

      renderStatusDistribution(responses[0].statusDistribution);
      renderReceivedVsExpected(responses[0].receivedVsExpected);
      renderDowntime(responses[0].downtime);
      renderTimeline(responses[0].timelineSummary);
      renderHourlyDistribution(responses[0].hourlyDetectionDistribution);
      renderComparison(responses[1]);
      setMessage("تم تحميل الإحصائيات للنطاق المحدد.", false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشل تحميل الإحصائيات", true);
    }
  }

  rangeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loadStatistics();
  });

  last24Btn.addEventListener("click", function () {
    applyLast24HoursRange();
    loadStatistics();
  });

  window.addEventListener("dashboard:devices-loaded", function (event) {
    var detail = event && event.detail ? event.detail : {};
    syncDeviceOptions(detail.devices, detail.selectedDeviceId || bridge.getSelectedDeviceId());
    if (!hasAutoLoaded && detail.devices && detail.devices.length) {
      hasAutoLoaded = true;
      loadStatistics();
    }
  });

  window.addEventListener("dashboard:device-selected", function (event) {
    var detail = event && event.detail ? event.detail : {};
    if (detail.deviceId) {
      deviceSelect.value = String(detail.deviceId);
    }
  });

  applyLast24HoursRange();
  syncDeviceOptions(bridge.getDevices(), bridge.getSelectedDeviceId());
  if (bridge.getDevices().length) {
    hasAutoLoaded = true;
    loadStatistics();
  }
})();