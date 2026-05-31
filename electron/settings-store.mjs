import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const settingsFileName = "desktop-pet-settings.json";
export const settingsLimits = Object.freeze({
  mascotWidthPx: Object.freeze({
    min: 84,
    max: 228,
    step: 12,
  }),
  opacity: Object.freeze({
    min: 0.35,
    max: 1,
  }),
});
export const defaultSettings = Object.freeze({
  interactionMode: "standard",
  mascotWidthPx: 120,
  opacity: 1,
  alwaysOnTopEnabled: true,
  launchAtLoginEnabled: false,
  speechBubblesEnabled: true,
  proactiveEventsEnabled: true,
});

const validInteractionModes = new Set(["quiet", "standard", "lively", "sleep"]);

export function settingsPathForUserData(userDataPath) {
  return path.join(userDataPath, settingsFileName);
}

export function createSettingsStore(filePath) {
  return {
    read: () => readSettings(filePath),
    update: (patch) => updateSettings(filePath, patch),
  };
}

async function readSettings(filePath) {
  try {
    return normalizeSettings(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return { ...defaultSettings };
  }
}

async function updateSettings(filePath, patch) {
  const current = await readSettings(filePath);
  const next = normalizePatch(current, patch);
  if (next === current) return current;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") return { ...defaultSettings };
  const interactionMode = value.interactionMode;
  const mascotWidthPx = normalizeMascotWidth(value.mascotWidthPx);
  const opacity = normalizeOpacity(value.opacity);
  const alwaysOnTopEnabled = value.alwaysOnTopEnabled;
  const launchAtLoginEnabled = value.launchAtLoginEnabled;
  const speechBubblesEnabled = value.speechBubblesEnabled;
  const proactiveEventsEnabled = value.proactiveEventsEnabled;
  return {
    interactionMode: isInteractionMode(interactionMode)
      ? interactionMode
      : defaultSettings.interactionMode,
    mascotWidthPx: mascotWidthPx ?? defaultSettings.mascotWidthPx,
    opacity: opacity ?? defaultSettings.opacity,
    alwaysOnTopEnabled: typeof alwaysOnTopEnabled === "boolean"
      ? alwaysOnTopEnabled
      : defaultSettings.alwaysOnTopEnabled,
    launchAtLoginEnabled: typeof launchAtLoginEnabled === "boolean"
      ? launchAtLoginEnabled
      : defaultSettings.launchAtLoginEnabled,
    speechBubblesEnabled: typeof speechBubblesEnabled === "boolean"
      ? speechBubblesEnabled
      : defaultSettings.speechBubblesEnabled,
    proactiveEventsEnabled: typeof proactiveEventsEnabled === "boolean"
      ? proactiveEventsEnabled
      : defaultSettings.proactiveEventsEnabled,
  };
}

function normalizePatch(current, patch) {
  if (!patch || typeof patch !== "object") return current;
  const next = { ...current };
  let changed = false;

  if (hasOwn(patch, "interactionMode") && isInteractionMode(patch.interactionMode)) {
    next.interactionMode = patch.interactionMode;
    changed = changed || next.interactionMode !== current.interactionMode;
  }

  if (hasOwn(patch, "mascotWidthPx")) {
    const mascotWidthPx = normalizeMascotWidth(patch.mascotWidthPx);
    if (mascotWidthPx !== null) {
      next.mascotWidthPx = mascotWidthPx;
      changed = changed || next.mascotWidthPx !== current.mascotWidthPx;
    }
  }

  if (hasOwn(patch, "opacity")) {
    const opacity = normalizeOpacity(patch.opacity);
    if (opacity !== null) {
      next.opacity = opacity;
      changed = changed || next.opacity !== current.opacity;
    }
  }

  if (hasOwn(patch, "alwaysOnTopEnabled") && typeof patch.alwaysOnTopEnabled === "boolean") {
    next.alwaysOnTopEnabled = patch.alwaysOnTopEnabled;
    changed = changed || next.alwaysOnTopEnabled !== current.alwaysOnTopEnabled;
  }

  if (hasOwn(patch, "launchAtLoginEnabled") && typeof patch.launchAtLoginEnabled === "boolean") {
    next.launchAtLoginEnabled = patch.launchAtLoginEnabled;
    changed = changed || next.launchAtLoginEnabled !== current.launchAtLoginEnabled;
  }

  if (hasOwn(patch, "speechBubblesEnabled") && typeof patch.speechBubblesEnabled === "boolean") {
    next.speechBubblesEnabled = patch.speechBubblesEnabled;
    changed = changed || next.speechBubblesEnabled !== current.speechBubblesEnabled;
  }

  if (
    hasOwn(patch, "proactiveEventsEnabled") &&
    typeof patch.proactiveEventsEnabled === "boolean"
  ) {
    next.proactiveEventsEnabled = patch.proactiveEventsEnabled;
    changed = changed || next.proactiveEventsEnabled !== current.proactiveEventsEnabled;
  }

  return changed ? next : current;
}

function isInteractionMode(value) {
  return typeof value === "string" && validInteractionModes.has(value);
}

function normalizeMascotWidth(value) {
  const number = Number(value);
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(number) ||
    number < settingsLimits.mascotWidthPx.min ||
    number > settingsLimits.mascotWidthPx.max
  ) {
    return null;
  }

  const snapped = Math.round(number / settingsLimits.mascotWidthPx.step) *
    settingsLimits.mascotWidthPx.step;
  return Math.min(
    Math.max(snapped, settingsLimits.mascotWidthPx.min),
    settingsLimits.mascotWidthPx.max,
  );
}

function normalizeOpacity(value) {
  const number = Number(value);
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(number) ||
    number < settingsLimits.opacity.min ||
    number > settingsLimits.opacity.max
  ) {
    return null;
  }
  return Math.round(number * 100) / 100;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
