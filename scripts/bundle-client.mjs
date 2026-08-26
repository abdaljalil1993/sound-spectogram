import { build } from "esbuild";
import fs from "fs/promises";
import path from "path";

const rootDir = process.cwd();

const entries = [
  "src/public/js/frequency-mapping.js",
  "src/public/js/spectrogram.js",
  "src/public/js/dashboard.js"
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 ? 0 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function percentDelta(original, minified) {
  if (!Number.isFinite(original) || original <= 0) {
    return "0.00";
  }

  const ratio = ((original - minified) / original) * 100;
  return ratio.toFixed(2);
}

async function fileSize(absPath) {
  const stat = await fs.stat(absPath);
  return stat.size;
}

async function run() {
  const entryAbsPaths = entries.map((entry) => path.join(rootDir, entry));

  await build({
    entryPoints: entryAbsPaths,
    bundle: false,
    minify: true,
    outdir: path.join(rootDir, "dist/public/js"),
    allowOverwrite: true,
    logLevel: "silent"
  });

  const lines = [];
  for (const entry of entries) {
    const srcPath = path.join(rootDir, entry);
    const outPath = path.join(rootDir, "dist/public/js", path.basename(entry));

    const [srcSize, outSize] = await Promise.all([fileSize(srcPath), fileSize(outPath)]);
    lines.push(
      `- ${path.basename(entry)}: ${formatBytes(srcSize)} -> ${formatBytes(outSize)} (${percentDelta(srcSize, outSize)}% smaller)`
    );
  }

  console.log("[bundle-client] Minified client JS files:");
  console.log(lines.join("\n"));
}

run().catch((error) => {
  console.error("[bundle-client] Failed to minify client files", error);
  process.exit(1);
});
