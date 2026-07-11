import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  migrateSelectedPetId,
  normalizePetLibraryFolders,
  petFolderName,
  seedBundledPetLibrary,
} from "../../electron/pet-library.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-library-"));
const bundledRoot = path.join(root, "bundled");
const libraryRoot = path.join(root, "library");

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
