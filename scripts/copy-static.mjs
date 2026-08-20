import fs from "fs";
import path from "path";

const rootDir = process.cwd();

function copyDirectory(sourceRelative, targetRelative) {
  const sourcePath = path.join(rootDir, sourceRelative);
  const targetPath = path.join(rootDir, targetRelative);

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

copyDirectory("src/views", "dist/views");
copyDirectory("src/public", "dist/public");
