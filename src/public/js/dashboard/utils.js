export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatNaiveDateTimeMs(value, withDate) {
  var ms = Number(value);
  if (!Number.isFinite(ms)) {
    return "-";
  }

  var date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  var year = String(date.getFullYear());
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  var hours = String(date.getHours()).padStart(2, "0");
  var minutes = String(date.getMinutes()).padStart(2, "0");
  var seconds = String(date.getSeconds()).padStart(2, "0");

  if (!withDate) {
    return hours + ":" + minutes;
  }

  return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
}

export function normalizeNaiveDateTimeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }
    return formatNaiveDateTimeMs(value.getTime(), true).replace(" ", "T");
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return formatNaiveDateTimeMs(value, true).replace(" ", "T");
  }

  if (typeof value !== "string") {
    return "";
  }

  var trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  var match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    return "";
  }

  var year = match[1];
  var month = match[2];
  var day = match[3];
  var hours = match[4];
  var minutes = match[5];
  var seconds = match[6] || "00";
  return year + "-" + month + "-" + day + "T" + hours + ":" + minutes + ":" + seconds;
}

export function normalizeAnyDateTimeString(value) {
  var normalized = normalizeNaiveDateTimeString(value);
  if (normalized) {
    return normalized;
  }

  var parsed = value instanceof Date ? value : new Date(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return formatNaiveDateTimeMs(parsed.getTime(), true).replace(" ", "T");
}

export function parseFlexibleTimeMs(value) {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }

  if (typeof value === "string") {
    var normalizedValue = normalizeAnyDateTimeString(value);
    if (normalizedValue) {
      var matched = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
      if (matched) {
        return new Date(
          Number(matched[1]),
          Number(matched[2]) - 1,
          Number(matched[3]),
          Number(matched[4]),
          Number(matched[5]),
          Number(matched[6]),
          0
        ).getTime();
      }
    }
  }

  var numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return NaN;
}

export function parseOptionalNumberInput(value) {
  var raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  var parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toIso(dateTimeLocalValue) {
  return normalizeNaiveDateTimeString(dateTimeLocalValue);
}

export function formatDateOnly(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function formatTimeOnly(date) {
  var hours = String(date.getHours()).padStart(2, "0");
  var minutes = String(date.getMinutes()).padStart(2, "0");
  return hours + ":" + minutes;
}

export function formatLocalDateTime(value) {
  var normalized = normalizeAnyDateTimeString(value);
  if (normalized) {
    return normalized.replace("T", " ");
  }

  return formatNaiveDateTimeMs(value, true);
}

export function buildSameDayRange(dayValue, fromTimeValue, toTimeValue) {
  var day = String(dayValue || "").trim();
  var fromTime = String(fromTimeValue || "").trim();
  var toTime = String(toTimeValue || "").trim();

  if (!day || !fromTime || !toTime) {
    throw new Error("اليوم ووقت البداية ووقت النهاية حقول مطلوبة");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("قيمة اليوم غير صالحة");
  }

  if (!/^\d{2}:\d{2}$/.test(fromTime) || !/^\d{2}:\d{2}$/.test(toTime)) {
    throw new Error("قيمة الوقت غير صالحة");
  }

  var fromLocal = day + "T" + fromTime;
  var toLocal = day + "T" + toTime;

  if (new Date(fromLocal).getTime() > new Date(toLocal).getTime()) {
    throw new Error("وقت البداية يجب أن يكون قبل أو يساوي وقت النهاية");
  }

  return {
    fromLocal: fromLocal,
    toLocal: toLocal
  };
}

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  var tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

export function magnitudeToDb(value) {
  var n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return 20 * Math.log10(n);
}

export function formatDbValue(dbValue) {
  if (!Number.isFinite(dbValue)) {
    return "-inf dB";
  }
  return dbValue.toFixed(1) + " dB";
}
