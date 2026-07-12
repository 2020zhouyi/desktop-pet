import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPetSelectionStore } from "../../electron/pet-selection-store.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-selection-"));
const selectionPath = path.join(tempDir, "desktop-pet-settings.json");
const store = createPetSelectionStore(selectionPath);

try {
  assert.equal(await store.read(), null);
  assert.equal(await store.readLaunchAtLogin(), false);

  await writeFile(selectionPath, JSON.stringify({
    selectedPetId: " project:player-03 ",
    mascotWidthPx: 180,
    opacity: 0.5,
    alwaysOnTopEnabled: false,
    launchAtLogin: true,
  }), "utf8");
  assert.equal(await store.read(), "project:player-03");
  assert.equal(await store.readMascotWidth(), 180);
  assert.equal(await store.readLaunchAtLogin(), true);

  assert.equal(await store.write("project:player-05"), "project:player-05");
  assert.deepEqual(JSON.parse(await readFile(selectionPath, "utf8")), {
    selectedPetId: "project:player-05",
    mascotWidthPx: 180,
    launchAtLogin: true,
  });

  assert.equal(await store.writeMascotWidth(204), 204);
  assert.equal(await store.writeLaunchAtLogin(false), false);
  assert.equal(await store.readMascotWidth(), 204);
  assert.deepEqual(JSON.parse(await readFile(selectionPath, "utf8")), {
    selectedPetId: "project:player-05",
    mascotWidthPx: 204,
    launchAtLogin: false,
  });

  await Promise.all([
    store.write("project:player-01"),
    store.write("project:player-02"),
  ]);
  assert.equal(await store.read(), "project:player-02");
  assert.equal(await store.write(""), "project:player-02");
  assert.equal(await store.write(null), null);
  assert.deepEqual(JSON.parse(await readFile(selectionPath, "utf8")), {
    selectedPetId: null,
    mascotWidthPx: 204,
    launchAtLogin: false,
  });

  await writeFile(selectionPath, "{broken-json", "utf8");
  assert.equal(await store.read(), null);

  console.log("pet selection store tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
