(function (root) {
  function clamp(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) {
      return min;
    }
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }

  function getFrequencyBinDirection(frequencyBins) {
    if (!Array.isArray(frequencyBins) || frequencyBins.length < 2) {
      return 'ascending';
    }

    var ascending = true;
    var descending = true;
    for (var i = 1; i < frequencyBins.length; i += 1) {
      var prev = Number(frequencyBins[i - 1]);
      var curr = Number(frequencyBins[i]);
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) {
        return 'ascending';
      }
      if (curr > prev) {
        descending = false;
      }
      if (curr < prev) {
        ascending = false;
      }
    }

    if (ascending) {
      return 'ascending';
    }
    if (descending) {
      return 'descending';
    }
    return 'mixed';
  }

  function mapRawRowToScreen(rowIndex, frequencyBins, rowCount) {
    var count = Number(rowCount);
    if (!Number.isFinite(count) || count <= 0) {
      return 0;
    }

    var safeCount = Math.max(1, Math.floor(count));
    var safeIndex = clamp(rowIndex, 0, safeCount - 1);
    if (getFrequencyBinDirection(frequencyBins) === 'descending') {
      return safeIndex;
    }
    return safeCount - 1 - safeIndex;
  }

  function mapScreenYToRawRow(screenY, frequencyBins, rowCount) {
    var count = Number(rowCount);
    if (!Number.isFinite(count) || count <= 0) {
      return 0;
    }

    var safeCount = Math.max(1, Math.floor(count));
    var safeIndex = clamp(screenY, 0, safeCount - 1);
    if (getFrequencyBinDirection(frequencyBins) === 'descending') {
      return safeIndex;
    }
    return safeCount - 1 - safeIndex;
  }

  var api = {
    getFrequencyBinDirection: getFrequencyBinDirection,
    mapRawRowToScreen: mapRawRowToScreen,
    mapScreenYToRawRow: mapScreenYToRawRow
  };

  root.FrequencyMapping = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
