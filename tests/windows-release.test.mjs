import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const mainSource = await readFile(path.join(projectRoot, "electron", "main.mjs"), "utf8");

const windowsTargets = new Set(
  packageJson.build.win.target.map((entry) => typeof entry === "string" ? entry : entry.target),
);

assert.equal(windowsTargets.has("nsis"), true, "Windows release must include an installer");
assert.equal(windowsTargets.has("zip"), true, "Windows release should keep a portable ZIP");
assert.equal(packageJson.build.nsis.oneClick, false);
assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
assert.equal(packageJson.build.nsis.runAfterFinish, true);
assert.deepEqual(packageJson.build.asarUnpack, ["pets/**/*"]);

assert.match(mainSource, /webContents\.once\("did-finish-load", revealInitialPetWindow\)/);
assert.match(mainSource, /process\.platform === "win32"\s*\? mainWindow\.show\(\)/);
assert.match(mainSource, /: mainWindow\.showInactive\(\)/);
assert.match(mainSource, /path\.join\(process\.resourcesPath, "app\.asar\.unpacked", "pets"\)/);

const moveDragBody = mainSource.match(
  /function moveOverlayDrag\([^)]*\) \{(?<body>[\s\S]*?)\n\}/,
)?.groups?.body ?? "";
assert.match(moveDragBody, /screen\.getCursorScreenPoint\(\)/);
assert.doesNotMatch(
  moveDragBody,
  /payload\?\.screen[XY]/,
  "Windows drag movement must not mix renderer screen coordinates with Electron screen coordinates",
);

console.log("Windows release contract tests passed");
