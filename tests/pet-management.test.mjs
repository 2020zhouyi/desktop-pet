import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deleteLocalPet,
  isImportedPetManifest,
  listLocalPetManagement,
  withImportedPetMarker,
} from "../electron/pet-management.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-management-"));
const targetRoot = path.join(tempDir, "project-pets");
const outsideDir = path.join(tempDir, "outside-pet");

try {
  await mkdir(targetRoot, { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(path.join(outsideDir, "sentinel.txt"), "keep outside", "utf8");

  await writeTargetPet("builtin-pet", {
    id: "builtin-pet",
    displayName: "Builtin Pet",
    spritesheetPath: "spritesheet.webp",
  });
  await writeTargetPet(
    "imported-pet",
    withImportedPetMarker(
      {
        id: "imported-pet",
        displayName: "Imported Pet",
        spritesheetPath: "spritesheet.webp",
      },
      { sourceFolderName: "imported-pet", importedAt: new Date("2026-05-30T00:00:00.000Z") },
    ),
  );

  assert.equal(isImportedPetManifest({ desktopPetMvp: { imported: true } }), false);
  assert.equal(
    isImportedPetManifest({
      desktopPetMvp: { imported: true, origin: "codex-import" },
    }),
    true,
  );

  const localPets = await listLocalPetManagement({ targetRoot });
  const builtin = localPets.find((pet) => pet.folderName === "builtin-pet");
  const imported = localPets.find((pet) => pet.folderName === "imported-pet");
  assert.ok(builtin, "expected builtin pet");
  assert.equal(builtin.kind, "builtin");
  assert.equal(builtin.canDelete, false);
  assert.equal(builtin.protectedReason, "builtin");
  assert.ok(imported, "expected imported pet");
  assert.equal(imported.kind, "imported");
  assert.equal(imported.canDelete, true);

  const protectedDelete = await deleteLocalPet({ folderName: "builtin-pet", targetRoot });
  assert.equal(protectedDelete.ok, false);
  assert.equal(protectedDelete.status, "protected");
  assert.equal(await readFile(path.join(targetRoot, "builtin-pet", "pet.json"), "utf8").then(Boolean), true);

  const missingDelete = await deleteLocalPet({ folderName: "missing-pet", targetRoot });
  assert.equal(missingDelete.ok, false);
  assert.equal(missingDelete.status, "missing");

  const unsafeDelete = await deleteLocalPet({ folderName: "../outside-pet", targetRoot });
  assert.equal(unsafeDelete.ok, false);
  assert.equal(unsafeDelete.status, "invalid");
  assert.equal(await readFile(path.join(outsideDir, "sentinel.txt"), "utf8"), "keep outside");

  const rootDelete = await deleteLocalPet({ folderName: ".", targetRoot });
  assert.equal(rootDelete.ok, false);
  assert.equal(rootDelete.status, "invalid");
  assert.equal(await pathExists(targetRoot), true);

  const deleted = await deleteLocalPet({ folderName: "imported-pet", targetRoot });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.status, "deleted");
  assert.equal(await pathExists(path.join(targetRoot, "imported-pet")), false);
  assert.equal(await pathExists(path.join(targetRoot, "builtin-pet")), true);

  console.log("pet management tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeTargetPet(folderName, manifest) {
  const dir = path.join(targetRoot, folderName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(dir, manifest.spritesheetPath), `sprite:${folderName}`, "utf8");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
