import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const [appSource, controlSource, preloadSource, mainSource, pickerCss, shellCss] = await Promise.all([
  readFile(path.join(projectRoot, "src", "App.tsx"), "utf8"),
  readFile(path.join(projectRoot, "src", "control", "ControlSurface.tsx"), "utf8"),
  readFile(path.join(projectRoot, "electron", "preload.cjs"), "utf8"),
  readFile(path.join(projectRoot, "electron", "main.mjs"), "utf8"),
  readFile(path.join(projectRoot, "src", "control", "PetPicker.css"), "utf8"),
  readFile(path.join(projectRoot, "src", "styles.css"), "utf8"),
]);

assert.doesNotMatch(appSource, /panel\s*!==\s*["']settings["']/);
assert.doesNotMatch(controlSource, /PetSettingsPanel|useDesktopPetSettings|updatePetSettings/);
assert.doesNotMatch(preloadSource, /getSettings|updateSettings|onSettingsChanged/);
assert.doesNotMatch(mainSource, /showControlWindow\(["']settings["']\)/);
assert.doesNotMatch(mainSource, /label:\s*["']Settings/);
assert.doesNotMatch(mainSource, /DESKTOP_PET_DEBUG/);
assert.match(mainSource, /transparent:\s*true/);
assert.match(appSource, /className=["']resize-handle no-drag["']/);
assert.match(preloadSource, /resizeMascot/);
assert.match(preloadSource, /openPetLibrary/);
assert.match(mainSource, /window:resize-mascot/);
assert.match(mainSource, /pet:library-open/);
assert.match(controlSource, /openPetLibrary/);
assert.match(controlSource, /onManageLibrary/);

const controlWindowSource = mainSource.slice(
  mainSource.indexOf("async function openControlWindowNow"),
  mainSource.indexOf("function showControlWindow"),
);
const pickerHeaderRule = cssRule(pickerCss, ".picker-header");
const pickerGalleryRule = cssRule(pickerCss, ".picker-gallery");
const controlShellRule = cssRule(shellCss, ".pet-shell[data-control-panel]");
assert.match(controlWindowSource, /frame:\s*false/);
assert.match(controlWindowSource, /transparent:\s*false/);
assert.match(controlWindowSource, /backgroundColor:\s*["']#f7f7f8["']/);
assert.doesNotMatch(controlWindowSource, /frame:\s*true/);
assert.match(pickerHeaderRule, /-webkit-app-region:\s*drag/);
assert.match(pickerGalleryRule, /padding:\s*5px 4px 6px/);
assert.doesNotMatch(pickerGalleryRule, /padding:\s*1px/);
assert.doesNotMatch(pickerCss, /background:\s*#292f2c/);
assert.doesNotMatch(pickerCss, /background:\s*#d09a53/);
assert.match(pickerCss, /--picker-paper:\s*#f7f7f8/);
assert.match(pickerCss, /--picker-card:\s*#ffffff/);
assert.match(pickerCss, /--picker-ink:\s*#171717/);
assert.match(pickerCss, /--picker-line:\s*#e5e5e5/);
assert.match(pickerCss, /--picker-accent:\s*#10a37f/);
assert.match(pickerCss, /--picker-dock:\s*#f1f2f2/);
assert.match(pickerCss, /color-scheme:\s*light/);
assert.doesNotMatch(pickerCss, /#f8f4ed|#fffdf8|#b7803d|#e4ede8/);
assert.doesNotMatch(pickerCss, /prefers-color-scheme:\s*dark/);
assert.match(controlShellRule, /background:\s*transparent/);
assert.match(controlShellRule, /padding:\s*0/);

console.log("picker-only control surface tests passed");

function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`);
  const end = css.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`);
  return css.slice(start, end + 1);
}
