// Regenerates dist-electron/package.json — the manifest electron-builder packages
// as the app. Kept out of source control (dist-electron is gitignored), so the
// build must recreate it every run instead of relying on a leftover file.
const fs = require("fs");
const path = require("path");

const root = require("../package.json");
const outDir = path.join(__dirname, "..", "dist-electron");
fs.mkdirSync(outDir, { recursive: true });

const manifest = {
  name: "exponential",
  version: root.version,
  main: "main.js",
  type: "commonjs",
};

fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("wrote dist-electron/package.json");
