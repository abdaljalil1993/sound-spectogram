(function () {
  var DEFAULT_CONFIG = {
    matrixOrientation: "frequency-time",
    blockTimestampMode: "end",
    colorMap: "magma",
    inputValueMax: 255,
    gamma: 1.0,
    smoothVertical: true,
    axisMinFrequency: 30,
    background: "#140d28",
    gapFill: "rgba(54, 103, 194, 0.26)",
    gapStroke: "rgba(102, 196, 231, 0.9)",
    axisColor: "#cfd7e6",
    gridColor: "rgba(207, 215, 230, 0.16)",
    textColor: "#d8e2ff",
    maxFastColumnStride: 8
  };

  var COLOR_MAP_STOPS = {
    magma: [
      { p: 0.0, c: [0, 0, 4] },
      { p: 0.16, c: [28, 16, 68] },
      { p: 0.33, c: [79, 18, 123] },
      { p: 0.5, c: [129, 37, 129] },
      { p: 0.66, c: [181, 54, 122] },
      { p: 0.83, c: [229, 80, 100] },
      { p: 1.0, c: [252, 253, 191] }
    ],
    sunset: [
      { p: 0.0, c: [15, 16, 50] },
      { p: 0.2, c: [45, 24, 105] },
      { p: 0.4, c: [98, 33, 135] },
      { p: 0.6, c: [170, 52, 112] },
      { p: 0.8, c: [235, 96, 70] },
      { p: 1.0, c: [255, 190, 92] }
    ]
  };

  function clamp01(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalizeIntensity(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }

    if (n <= 1) {
      return clamp01(n);
    }

    var maxValue = Number(DEFAULT_CONFIG.inputValueMax);
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      maxValue = 255;
    }

    return clamp01(n / maxValue);
  }

  function getColorStops() {
    var mapName = String(DEFAULT_CONFIG.colorMap || "").toLowerCase();
    return COLOR_MAP_STOPS[mapName] || COLOR_MAP_STOPS.magma;
  }

  function valueToColor(value) {
    var gamma = Number(DEFAULT_CONFIG.gamma);
    if (!Number.isFinite(gamma) || gamma <= 0) {
      gamma = 1.0;
    }

    var v = Math.pow(normalizeIntensity(value), gamma);
    var stops = getColorStops();

    for (var i = 0; i < stops.length - 1; i += 1) {
      var a = stops[i];
      var b = stops[i + 1];
      if (v >= a.p && v <= b.p) {
        var t = (v - a.p) / (b.p - a.p || 1);
        return [
          Math.round(lerp(a.c[0], b.c[0], t)),
          Math.round(lerp(a.c[1], b.c[1], t)),
          Math.round(lerp(a.c[2], b.c[2], t))
        ];
      }
    }

    return stops[stops.length - 1].c;
  }

  function parseDateMs(value) {
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function getCachedMs(block, cacheKey, fallbackKeys) {
    if (!block) {
      return NaN;
    }

    if (Number.isFinite(block[cacheKey])) {
      return block[cacheKey];
    }

    for (var i = 0; i < fallbackKeys.length; i += 1) {
      var key = fallbackKeys[i];
      if (Number.isFinite(block[key])) {
        block[cacheKey] = block[key];
        return block[cacheKey];
      }
    }

    var ms = parseDateMs(block.timestamp || block.startTime || block.start_time || block.endTime || block.end_time);
    if (Number.isFinite(ms)) {
      block[cacheKey] = ms;
    }
    return ms;
  }

  function getBlockStartMs(block) {
    return getCachedMs(block, "__startMs", ["startMs", "start_ms"]);
  }

  function getBlockEndMs(block) {
    return getCachedMs(block, "__endMs", ["endMs", "end_ms"]);
  }

  function getBlockTimestampMs(block) {
    return getCachedMs(block, "__timestampMs", ["timestampMs", "timestamp_ms"]);
  }

  function formatTimeLabel(ms, withDate) {
    var d = new Date(ms);
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    if (!withDate) return hh + ":" + mm;

    var yyyy = d.getFullYear();
    var mon = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mon + "-" + day + " " + hh + ":" + mm;
  }

  function getBinCount(blocks) {
    for (var i = 0; i < blocks.length; i += 1) {
      var matrix = blocks[i] && blocks[i].data;
      if (Array.isArray(matrix) && matrix.length > 0 && Array.isArray(matrix[0]) && matrix[0].length > 0) {
        if (DEFAULT_CONFIG.matrixOrientation === "time-frequency") {
          return matrix[0].length;
        }
        return matrix.length;
      }
    }
    return 0;
  }

  function getMatrixDimensions(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      return { rows: 0, cols: 0 };
    }

    if (DEFAULT_CONFIG.matrixOrientation === "time-frequency") {
      return {
        rows: matrix[0].length,
        cols: matrix.length
      };
    }

    return {
      rows: matrix.length,
      cols: matrix[0].length
    };
  }

  function getMatrixValue(matrix, row, col) {
    if (DEFAULT_CONFIG.matrixOrientation === "time-frequency") {
      if (!Array.isArray(matrix[col])) return 0;
      return matrix[col][row];
    }
    if (!Array.isArray(matrix[row])) return 0;
    return matrix[row][col];
  }

  function chooseTicks(widthPx, minTicks, maxTicks) {
    var byWidth = Math.floor(widthPx / 120);
    return Math.max(minTicks, Math.min(maxTicks, byWidth));
  }

  function estimateStepMs(blocks, blockIndex, rangeMs) {
    var block = blocks[blockIndex];
    var matrix = block.data;
    var dims = getMatrixDimensions(matrix);
    var cols = dims.cols;

    if (Number.isFinite(block.timeStepMs) && block.timeStepMs > 0) {
      return block.timeStepMs;
    }

    if (
      Number.isFinite(block.hopSize) &&
      block.hopSize > 0 &&
      Number.isFinite(block.sampleRate) &&
      block.sampleRate > 0
    ) {
      return (block.hopSize / block.sampleRate) * 1000;
    }

    for (var i = blockIndex + 1; i < blocks.length; i += 1) {
      var nextTs = getBlockTimestampMs(blocks[i]);
      var ts = getBlockTimestampMs(block);
      if (Number.isFinite(nextTs) && Number.isFinite(ts) && nextTs > ts) {
        return Math.max(1, Math.round((nextTs - ts) / Math.max(1, cols)));
      }
    }

    return Math.max(10, Math.round(rangeMs / Math.max(200, cols * Math.max(1, blocks.length))));
  }

  function drawLegend(legendCanvas) {
    if (!legendCanvas) return;
    var ctx = legendCanvas.getContext("2d");
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(legendCanvas.clientWidth || 560));
    var height = 46;
    legendCanvas.width = Math.floor(width * dpr);
    legendCanvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#111026";
    ctx.fillRect(0, 0, width, height);

    var x0 = 68;
    var y0 = 12;
    var w = Math.max(140, width - 130);
    var h = 16;

    for (var x = 0; x < w; x += 1) {
      var v = x / (w - 1 || 1);
      var rgb = valueToColor(v);
      ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
      ctx.fillRect(x0 + x, y0, 1, h);
    }

    ctx.strokeStyle = "#4b5677";
    ctx.strokeRect(x0, y0, w, h);

    ctx.fillStyle = "#d8e2ff";
    ctx.font = "12px Segoe UI";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("Low 0", 10, y0 + h / 2);
    ctx.textAlign = "right";
    ctx.fillText("High 255", width - 10, y0 + h / 2);
  }

  function configure(configPatch) {
    if (!configPatch || typeof configPatch !== "object") {
      return;
    }

    var keys = Object.keys(configPatch);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
        DEFAULT_CONFIG[key] = configPatch[key];
      }
    }
  }

  function renderSpectrogram(options) {
    var canvas = options && options.canvas;
    if (!canvas) return;

    var blocks = Array.isArray(options.blocks) ? options.blocks.slice() : [];
    var fastMode = !!(options && options.fastMode);
    var assumeSorted = options && options.assumeSorted !== false;
    var fromMs = parseDateMs(options.from);
    var toMs = parseDateMs(options.to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      return { gaps: [] };
    }

    var binCount = getBinCount(blocks);
    var ctx = canvas.getContext("2d");
    if (!ctx || binCount <= 0) {
      if (ctx) {
        var dpr = window.devicePixelRatio || 1;
        var cssWidth = Math.max(480, Math.floor(canvas.clientWidth || 960));
        var cssHeight = Math.max(320, Math.floor((canvas.clientWidth || 960) * 0.43));
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = DEFAULT_CONFIG.background;
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = DEFAULT_CONFIG.textColor;
        ctx.font = "16px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No data available for the selected device.", cssWidth / 2, cssHeight / 2);
      }
      return { gaps: [] };
    }

    if (!assumeSorted) {
      blocks.sort(function (a, b) {
        return getBlockStartMs(a) - getBlockStartMs(b);
      });
    }

    var dpr = window.devicePixelRatio || 1;
    var cssWidth = Math.max(480, Math.floor(canvas.clientWidth || 960));
    var cssHeight = Math.max(320, Math.floor((canvas.clientWidth || 960) * 0.43));
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var p = {
      left: 66,
      right: 14,
      top: 14,
      bottom: 34
    };

    var plotW = Math.max(10, cssWidth - p.left - p.right);
    var plotH = Math.max(10, cssHeight - p.top - p.bottom);

    ctx.fillStyle = DEFAULT_CONFIG.background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    var nativeCanvas = document.createElement("canvas");
    nativeCanvas.width = plotW;
    nativeCanvas.height = Math.max(1, binCount);
    var nativeCtx = nativeCanvas.getContext("2d");
    if (!nativeCtx) {
      return { gaps: [] };
    }

    var image = nativeCtx.createImageData(plotW, nativeCanvas.height);
    var lowRgb = valueToColor(0);
    for (var baseIdx = 0; baseIdx < image.data.length; baseIdx += 4) {
      image.data[baseIdx] = lowRgb[0];
      image.data[baseIdx + 1] = lowRgb[1];
      image.data[baseIdx + 2] = lowRgb[2];
      image.data[baseIdx + 3] = 255;
    }

    function mapX(ms) {
      return Math.floor(((ms - fromMs) / (toMs - fromMs)) * (plotW - 1));
    }

    var rangeMs = toMs - fromMs;
    var coverageIntervals = [];

    function flushColumnBucket(rows, rowValues, xStart, xEnd) {
      for (var r = 0; r < rows; r += 1) {
        var yNative = rows - 1 - r;
        if (yNative < 0 || yNative >= nativeCanvas.height) {
          continue;
        }

        var value = rowValues[r];
        if (!Number.isFinite(value)) {
          value = 0;
        }

        var rgb = valueToColor(value);
        for (var x = xStart; x < xEnd && x < plotW; x += 1) {
          var idx = (yNative * plotW + x) * 4;
          image.data[idx] = rgb[0];
          image.data[idx + 1] = rgb[1];
          image.data[idx + 2] = rgb[2];
          image.data[idx + 3] = 255;
        }
      }
    }

    for (var bi = 0; bi < blocks.length; bi += 1) {
      var block = blocks[bi];
      var matrix = block && block.data;
      if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
        continue;
      }

      var dims = getMatrixDimensions(matrix);
      var rows = dims.rows;
      var cols = dims.cols;
      var blockStartMs = getBlockStartMs(block);
      var blockEndMs = getBlockEndMs(block);
      if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
        continue;
      }

      if (blockEndMs < blockStartMs) {
        var swap = blockStartMs;
        blockStartMs = blockEndMs;
        blockEndMs = swap;
      }

      var hasExplicitInterval = blockEndMs > blockStartMs;
      var stepMs = hasExplicitInterval
        ? (blockEndMs - blockStartMs) / Math.max(1, cols)
        : estimateStepMs(blocks, bi, rangeMs);
      var oversampleRatio = cols / Math.max(1, plotW);
      var columnStride = 1;
      if (fastMode && oversampleRatio > 1.5) {
        columnStride = Math.min(
          DEFAULT_CONFIG.maxFastColumnStride,
          Math.max(2, Math.floor(oversampleRatio))
        );
      }

      if (!hasExplicitInterval) {
        var blockTs = getBlockTimestampMs(block);
        if (!Number.isFinite(blockTs)) {
          continue;
        }

        if (DEFAULT_CONFIG.blockTimestampMode === "end") {
          blockStartMs = blockTs - (cols - 1) * stepMs;
          blockEndMs = blockTs + stepMs;
        } else {
          blockStartMs = blockTs;
          blockEndMs = blockTs + cols * stepMs;
        }
      }

      coverageIntervals.push({ start: blockStartMs, end: blockEndMs });

      var bucketX0 = -1;
      var bucketX1 = -1;
      var hasBucket = false;
      var bucketValues = new Array(rows);

      for (var c = 0; c < cols; c += columnStride) {
        var timeMs;
        var nextTimeMs;
        if (hasExplicitInterval) {
          timeMs = blockStartMs + c * stepMs;
          nextTimeMs = blockStartMs + (c + columnStride) * stepMs;
          if (nextTimeMs > blockEndMs) {
            nextTimeMs = blockEndMs;
          }
        } else if (DEFAULT_CONFIG.blockTimestampMode === "end") {
          var blockTs = getBlockTimestampMs(block);
          timeMs = blockTs - (cols - 1 - c) * stepMs;
          nextTimeMs = timeMs + stepMs * columnStride;
        } else {
          var blockTsStart = getBlockTimestampMs(block);
          timeMs = blockTsStart + c * stepMs;
          nextTimeMs = timeMs + stepMs * columnStride;
        }

        if (nextTimeMs < fromMs || timeMs > toMs) {
          continue;
        }

        var x0 = Math.max(0, Math.min(plotW - 1, mapX(timeMs)));
        var x1 = Math.max(x0 + 1, Math.min(plotW, mapX(nextTimeMs) + 1));

        if (!hasBucket) {
          hasBucket = true;
          bucketX0 = x0;
          bucketX1 = x1;
          for (var initR = 0; initR < rows; initR += 1) {
            bucketValues[initR] = getMatrixValue(matrix, initR, c);
          }
          continue;
        }

        if (x0 === bucketX0) {
          if (x1 > bucketX1) {
            bucketX1 = x1;
          }

          for (var mergeR = 0; mergeR < rows; mergeR += 1) {
            var mergedValue = getMatrixValue(matrix, mergeR, c);
            if (mergedValue > bucketValues[mergeR]) {
              bucketValues[mergeR] = mergedValue;
            }
          }
          continue;
        }

        flushColumnBucket(rows, bucketValues, bucketX0, bucketX1);
        bucketX0 = x0;
        bucketX1 = x1;
        for (var resetR = 0; resetR < rows; resetR += 1) {
          bucketValues[resetR] = getMatrixValue(matrix, resetR, c);
        }
      }

      if (hasBucket) {
        flushColumnBucket(rows, bucketValues, bucketX0, bucketX1);
      }
    }

    nativeCtx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = !!DEFAULT_CONFIG.smoothVertical;
    if (ctx.imageSmoothingEnabled && typeof ctx.imageSmoothingQuality === "string") {
      ctx.imageSmoothingQuality = "high";
    }
    ctx.drawImage(nativeCanvas, p.left, p.top, plotW, plotH);
    ctx.imageSmoothingEnabled = false;

    function computeGaps(from, to, intervals) {
      if (!intervals.length) {
        return [{ start: from, end: to }];
      }

      var clipped = intervals
        .map(function (interval) {
          return {
            start: Math.max(from, interval.start),
            end: Math.min(to, interval.end)
          };
        })
        .filter(function (interval) {
          return interval.end > interval.start;
        })
        .sort(function (a, b) {
          return a.start - b.start;
        });

      if (!clipped.length) {
        return [{ start: from, end: to }];
      }

      var merged = [clipped[0]];
      for (var i = 1; i < clipped.length; i += 1) {
        var current = clipped[i];
        var last = merged[merged.length - 1];
        if (current.start <= last.end) {
          if (current.end > last.end) {
            last.end = current.end;
          }
        } else {
          merged.push(current);
        }
      }

      var gaps = [];
      var cursor = from;
      for (var j = 0; j < merged.length; j += 1) {
        var seg = merged[j];
        if (seg.start > cursor) {
          gaps.push({ start: cursor, end: seg.start });
        }
        if (seg.end > cursor) {
          cursor = seg.end;
        }
      }
      if (cursor < to) {
        gaps.push({ start: cursor, end: to });
      }

      return gaps;
    }

    var gaps = computeGaps(fromMs, toMs, coverageIntervals);
    var gapRenderInfo = [];
    if (gaps.length) {
      ctx.fillStyle = DEFAULT_CONFIG.gapFill;
      ctx.strokeStyle = DEFAULT_CONFIG.gapStroke;
      ctx.lineWidth = 1;
      ctx.font = "11px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      for (var g = 0; g < gaps.length; g += 1) {
        var gap = gaps[g];
        var gx0 = Math.max(0, Math.min(plotW - 1, mapX(gap.start)));
        var gx1 = Math.max(gx0 + 1, Math.min(plotW, mapX(gap.end) + 1));
        var gw = Math.max(1, gx1 - gx0);

        gapRenderInfo.push({
          start: gap.start,
          end: gap.end,
          durationMs: gap.end - gap.start,
          xStart: p.left + gx0,
          xEnd: p.left + gx1
        });

        ctx.fillRect(p.left + gx0, p.top, gw, plotH);

        ctx.beginPath();
        ctx.moveTo(p.left + gx0 + 0.5, p.top);
        ctx.lineTo(p.left + gx0 + 0.5, p.top + plotH);
        ctx.moveTo(p.left + gx1 - 0.5, p.top);
        ctx.lineTo(p.left + gx1 - 0.5, p.top + plotH);
        ctx.stroke();

        if (gw >= 52) {
          var gapMinutes = Math.round((gap.end - gap.start) / 60000);
          ctx.fillStyle = "rgba(225, 244, 255, 0.95)";
          ctx.fillText("NO DATA " + gapMinutes + "m", p.left + gx0 + gw / 2, p.top + 4);
          ctx.fillStyle = DEFAULT_CONFIG.gapFill;
        }
      }
    }

    var xTicks = chooseTicks(plotW, 4, 8);
    ctx.strokeStyle = DEFAULT_CONFIG.gridColor;
    ctx.lineWidth = 1;
    for (var tx = 0; tx <= xTicks; tx += 1) {
      var xFrac = tx / xTicks;
      var x = p.left + Math.round(xFrac * plotW);
      ctx.beginPath();
      ctx.moveTo(x, p.top);
      ctx.lineTo(x, p.top + plotH);
      ctx.stroke();
    }

    var yTicks = 5;
    for (var ty = 0; ty <= yTicks; ty += 1) {
      var yFrac = ty / yTicks;
      var y = p.top + Math.round(yFrac * plotH);
      ctx.beginPath();
      ctx.moveTo(p.left, y);
      ctx.lineTo(p.left + plotW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = DEFAULT_CONFIG.axisColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.left, p.top);
    ctx.lineTo(p.left, p.top + plotH);
    ctx.lineTo(p.left + plotW, p.top + plotH);
    ctx.stroke();

    ctx.fillStyle = DEFAULT_CONFIG.textColor;
    ctx.font = "12px Segoe UI";

    var withDate = rangeMs > 24 * 60 * 60 * 1000;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var lx = 0; lx <= xTicks; lx += 1) {
      var lf = lx / xTicks;
      var labelMs = fromMs + lf * rangeMs;
      var labelX = p.left + Math.round(lf * plotW);
      ctx.fillText(formatTimeLabel(labelMs, withDate), labelX, p.top + plotH + 8);
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var minFrequency = options.minFrequency;
    var maxFrequency = options.maxFrequency;
    var hasRealFrequency = Number.isFinite(minFrequency) && Number.isFinite(maxFrequency) && maxFrequency > minFrequency;
    var axisMinFrequency = Number(DEFAULT_CONFIG.axisMinFrequency);
    if (!Number.isFinite(axisMinFrequency) || axisMinFrequency < 0) {
      axisMinFrequency = 30;
    }
    var displayMinFrequency = hasRealFrequency ? Math.max(minFrequency, axisMinFrequency) : null;

    for (var ly = 0; ly <= yTicks; ly += 1) {
      var yF = ly / yTicks;
      var yPos = p.top + Math.round(yF * plotH);
      var label;
      if (hasRealFrequency) {
        var hz = maxFrequency - yF * (maxFrequency - displayMinFrequency);
        label = Math.round(hz) + " Hz";
      } else {
        var bin = Math.round((1 - yF) * (binCount - 1));
        label = "Band " + bin;
      }
      ctx.fillText(label, p.left - 8, yPos);
    }

    ctx.save();
    ctx.fillStyle = DEFAULT_CONFIG.textColor;
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(14, p.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(hasRealFrequency ? "Frequency (Hz)" : "Frequency bands (Hz unavailable)", 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Time", p.left + plotW / 2, cssHeight - 8);

    if (options.legendCanvas) {
      drawLegend(options.legendCanvas);
    }

    return {
      layout: {
        plotLeft: p.left,
        plotTop: p.top,
        plotRight: p.left + plotW,
        plotBottom: p.top + plotH
      },
      hasRealFrequency: hasRealFrequency,
      gaps: gapRenderInfo.map(function (gap) {
        return {
          start: new Date(gap.start).toISOString(),
          end: new Date(gap.end).toISOString(),
          durationMs: gap.durationMs,
          xStart: gap.xStart,
          xEnd: gap.xEnd
        };
      })
    };
  }

  window.Spectrogram = {
    configure: configure,
    renderSpectrogram: renderSpectrogram,
    drawLegend: drawLegend,
    valueToColor: valueToColor
  };
})();
