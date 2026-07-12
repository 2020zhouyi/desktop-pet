import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  consumeBundledPetLibrary,
  migrateSelectedPetId,
  normalizePetLibraryFolders,
  petFolderName,
  seedBundledPetLibrary,
} from "../../electron/pet-library.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-library-"));
const bundledRoot = path.join(root, "bundled");
const libraryRoot = path.join(root, "library");
const consumableRoot = path.join(root, "consumable");
const consumedLibraryRoot = path.join(root, "consumed-library");

assert.equal(migrateSelectedPetId("project:pet-one"), "user:pet-one");
assert.equal(migrateSelectedPetId("user:pet-one"), "user:pet-one");
assert.equal(migrateSelectedPetId(null), null);
assert.equal(petFolderName("七秀 Codex Pet 1", "fallback"), "七秀");
assert.equal(petFolderName("阿史那/承庆", "fallback"), "阿史那－承庆");

try {
  await createPet(bundledRoot, "built-in-one", "Built In One");
  await createPet(bundledRoot, "built-in-two", "Built In Two");
  await createPet(libraryRoot, "custom-one", "Custom One");

  const first = await seedBundledPetLibrary({ bundledRoot, libraryRoot });
  assert.equal(first.seeded, true);
  assert.deepEqual(first.copiedFolders.sort(), ["Built In One", "Built In Two"]);

  await rm(path.join(libraryRoot, "Built In One"), { recursive: true });
  const second = await seedBundledPetLibrary({ bundledRoot, libraryRoot });
  assert.equal(second.seeded, false);
  assert.deepEqual(second.copiedFolders, []);
  await assert.rejects(readFile(path.join(libraryRoot, "Built In One", "pet.json")));

  const normalized = await normalizePetLibraryFolders(libraryRoot);
  assert.deepEqual(normalized.renamed, [{ from: "custom-one", to: "Custom One" }]);

  await createPet(consumableRoot, "alpha", "甲");
  await createPet(consumableRoot, "beta", "乙");
  await mkdir(path.join(consumedLibraryRoot, "乙"), { recursive: true });
  await writeFile(path.join(consumedLibraryRoot, "乙", "keep.txt"), "player-owned", "utf8");

  const consumed = await consumeBundledPetLibrary({
    bundledRoot: consumableRoot,
    libraryRoot: consumedLibraryRoot,
  });
  assert.equal(consumed.consumed, true);
  assert.deepEqual(consumed.movedFolders, ["甲"]);
  assert.deepEqual(consumed.preservedFolders, ["乙"]);
  await assert.rejects(readFile(path.join(consumableRoot, "alpha", "pet.json")), /ENOENT/);
  assert.equal(
    await readFile(path.join(consumedLibraryRoot, "甲", "spritesheet.webp"), "utf8"),
    "fixture",
  );
  assert.equal(
    await readFile(path.join(consumedLibraryRoot, "乙", "keep.txt"), "utf8"),
    "player-owned",
  );

  await rm(path.join(consumedLibraryRoot, "甲"), { recursive: true, force: true });
  const afterPlayerDelete = await consumeBundledPetLibrary({
    bundledRoot: consumableRoot,
    libraryRoot: consumedLibraryRoot,
  });
  assert.equal(afterPlayerDelete.consumed, false);
  await assert.rejects(readFile(path.join(consumedLibraryRoot, "甲", "pet.json")), /ENOENT/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("pet library tests passed");

async function createPet(parent, folder, displayName) {
  const petDir = path.join(parent, folder);
  await mkdir(petDir, { recursive: true });
  await writeFile(path.join(petDir, "pet.json"), JSON.stringify({
    id: folder,
    displayName,
    spritesheetPath: "spritesheet.webp",
  }));
  await writeFile(path.join(petDir, "spritesheet.webp"), "fixture");
}
