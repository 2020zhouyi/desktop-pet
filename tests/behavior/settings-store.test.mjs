import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSettingsStore } from "../../electron/settings-store.mjs";
import {
  defaultInteractionMode,
  interactionModes,
} from "../../src/behavior/lifestyle.ts";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-settings-"));
const settingsPath = path.join(tempDir, "desktop-pet-settings.json");
const store = createSettingsStore(settingsPath);
const defaultExpectedSettings = {
  interactionMode: defaultInteractionMode,
  mascotWidthPx: 120,
  opacity: 1,
  alwaysOnTopEnabled: true,
  launchAtLoginEnabled: false,
  speechBubblesEnabled: true,
  proactiveEventsEnabled: true,
};

try {
  assert.deepEqual(await store.read(), defaultExpectedSettings);

  for (const mode of interactionModes) {
    assert.deepEqual(await store.update({ interactionMode: mode }), {
      interactionMode: mode,
      mascotWidthPx: 120,
      opacity: 1,
      alwaysOnTopEnabled: true,
      launchAtLoginEnabled: false,
      speechBubblesEnabled: true,
      proactiveEventsEnabled: true,
    });
  }

  await writeFile(settingsPath, JSON.stringify({ interactionMode: "lively" }), "utf8");
  assert.deepEqual(await store.read(), {
    interactionMode: "lively",
    mascotWidthPx: 120,
    opacity: 1,
    alwaysOnTopEnabled: true,
    launchAtLoginEnabled: false,
    speechBubblesEnabled: true,
    proactiveEventsEnabled: true,
  });

  await writeFile(settingsPath, JSON.stringify({
    interactionMode: "storm",
    mascotWidthPx: 999,
    opacity: 3,
    alwaysOnTopEnabled: "yes",
    launchAtLoginEnabled: 1,
    speechBubblesEnabled: "yes",
    proactiveEventsEnabled: 0,
  }), "utf8");
  assert.deepEqual(await store.read(), defaultExpectedSettings);

  await writeFile(settingsPath, "{broken-json", "utf8");
  assert.deepEqual(await store.read(), defaultExpectedSettings);

  await writeFile(settingsPath, JSON.stringify({
    interactionMode: "quiet",
    mascotWidthPx: 120,
    opacity: 1,
    alwaysOnTopEnabled: true,
    launchAtLoginEnabled: false,
    speechBubblesEnabled: true,
    proactiveEventsEnabled: true,
  }), "utf8");
  assert.deepEqual(await store.update({
    interactionMode: "sleep",
    mascotWidthPx: 156,
    opacity: 0.72,
    alwaysOnTopEnabled: false,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: false,
    ignored: true,
  }), {
    interactionMode: "sleep",
    mascotWidthPx: 156,
    opacity: 0.72,
    alwaysOnTopEnabled: false,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: false,
  });
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
    interactionMode: "sleep",
    mascotWidthPx: 156,
    opacity: 0.72,
    alwaysOnTopEnabled: false,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: false,
  });

  assert.deepEqual(await store.update({
    interactionMode: "storm",
    mascotWidthPx: 12,
    opacity: "transparent",
    alwaysOnTopEnabled: null,
    launchAtLoginEnabled: "soon",
    speechBubblesEnabled: "no",
    proactiveEventsEnabled: null,
  }), {
    interactionMode: "sleep",
    mascotWidthPx: 156,
    opacity: 0.72,
    alwaysOnTopEnabled: false,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: false,
  });
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
    interactionMode: "sleep",
    mascotWidthPx: 156,
    opacity: 0.72,
    alwaysOnTopEnabled: false,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: false,
  });

  assert.deepEqual(await store.update({
    interactionMode: "lively",
    mascotWidthPx: 157,
    opacity: 0.865,
    alwaysOnTopEnabled: true,
    speechBubblesEnabled: "still-invalid",
    proactiveEventsEnabled: true,
  }), {
    interactionMode: "lively",
    mascotWidthPx: 156,
    opacity: 0.87,
    alwaysOnTopEnabled: true,
    launchAtLoginEnabled: true,
    speechBubblesEnabled: false,
    proactiveEventsEnabled: true,
  });

  console.log("settings store tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
