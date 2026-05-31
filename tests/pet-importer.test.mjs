import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  importCodexPet,
  listCodexPetCandidates,
} from "../electron/pet-importer.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-import-"));
const sourceRoot = path.join(tempDir, "codex-pets");
const targetRoot = path.join(tempDir, "project-pets");

try {
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(targetRoot, { recursive: true });

  await writePet("good-pet", {
    manifest: {
      id: "good-pet",
      displayName: "Good Pet",
      description: "A valid import candidate.",
      spritesheetPath: "spritesheet.webp",
      author: "Pi Team",
      version: "1.0.0",
      tags: ["jx3", "candidate"],
      faction: "七秀",
      recommendedScale: 1.2,
      accentColor: "#217d74",
      behaviorProfile: "watchful",
    },
    spritesheetName: "spritesheet.webp",
  });
  await writePet("invalid-optional-pet", {
    manifest: {
      id: "invalid-optional-pet",
      displayName: "Invalid Optional Pet",
      spritesheetPath: "spritesheet.webp",
      author: 42,
      tags: [false],
      recommendedScale: 12,
      accentColor: "teal",
    },
    spritesheetName: "spritesheet.webp",
  });
  await writePet("fallback-pet", {
    manifest: {
      id: "fallback-pet",
      displayName: "Fallback Pet",
      spritesheetPath: "missing.webp",
    },
    spritesheetName: "spritesheet.png",
  });
  await mkdir(path.join(sourceRoot, "missing-manifest"), { recursive: true });
  await writePet("missing-sprite", {
    manifest: {
      id: "missing-sprite",
      displayName: "Missing Sprite",
      spritesheetPath: "spritesheet.webp",
    },
  });
  await writePet("conflict-pet", {
    manifest: {
      id: "conflict-pet",
      displayName: "Conflict Pet",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetName: "spritesheet.webp",
  });
  await mkdir(path.join(targetRoot, "conflict-pet"), { recursive: true });
  await writeFile(path.join(targetRoot, "conflict-pet", "sentinel.txt"), "keep me", "utf8");
  await writePet("duplicate-id-copy", {
    manifest: {
      id: "duplicate-id",
      displayName: "Duplicate ID Copy",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetName: "spritesheet.webp",
  });
  await writeTargetPet("duplicate-id-home", {
    id: "duplicate-id",
    displayName: "Duplicate ID Home",
    spritesheetPath: "spritesheet.webp",
  });

  const candidates = await listCodexPetCandidates({ sourceRoot, targetRoot });
  assertCandidate(candidates, "good-pet", "importable");
  assertCandidate(candidates, "invalid-optional-pet", "importable");
  assertCandidate(candidates, "fallback-pet", "importable", "spritesheet.png");
  assertCandidate(candidates, "missing-manifest", "invalid", undefined, "missing_manifest");
  assertCandidate(candidates, "missing-sprite", "invalid", undefined, "spritesheet_missing");
  assertCandidate(candidates, "conflict-pet", "installed", undefined, "target_exists");
  assertCandidate(candidates, "duplicate-id-copy", "installed", "spritesheet.webp", "manifest_exists");

  const imported = await importCodexPet({ folderName: "good-pet", sourceRoot, targetRoot });
  assert.equal(imported.ok, true);
  assert.equal(imported.petId, "project:good-pet");
  const goodManifest = JSON.parse(await readFile(path.join(targetRoot, "good-pet", "pet.json"), "utf8"));
  assert.equal(goodManifest.displayName, "Good Pet");
  assert.equal(goodManifest.author, "Pi Team");
  assert.equal(goodManifest.version, "1.0.0");
  assert.deepEqual(goodManifest.tags, ["jx3", "candidate"]);
  assert.equal(goodManifest.faction, "七秀");
  assert.equal(goodManifest.recommendedScale, 1.2);
  assert.equal(goodManifest.accentColor, "#217d74");
  assert.equal(goodManifest.behaviorProfile, "watchful");
  assert.equal(goodManifest.desktopPetMvp.imported, true);
  assert.equal(goodManifest.desktopPetMvp.origin, "codex-import");
  assert.equal(goodManifest.desktopPetMvp.sourceFolderName, "good-pet");
  assert.match(goodManifest.desktopPetMvp.importedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    await readFile(path.join(targetRoot, "good-pet", "spritesheet.webp"), "utf8"),
    "sprite:good-pet",
  );

  const fallbackImported = await importCodexPet({
    folderName: "fallback-pet",
    sourceRoot,
    targetRoot,
  });
  assert.equal(fallbackImported.ok, true);
  assert.equal(
    JSON.parse(await readFile(path.join(targetRoot, "fallback-pet", "pet.json"), "utf8"))
      .spritesheetPath,
    "spritesheet.png",
  );

  const invalidOptionalImported = await importCodexPet({
    folderName: "invalid-optional-pet",
    sourceRoot,
    targetRoot,
  });
  assert.equal(invalidOptionalImported.ok, true);
  const invalidOptionalManifest = JSON.parse(
    await readFile(path.join(targetRoot, "invalid-optional-pet", "pet.json"), "utf8"),
  );
  assert.equal(invalidOptionalManifest.author, undefined);
  assert.equal(invalidOptionalManifest.tags, undefined);
  assert.equal(invalidOptionalManifest.recommendedScale, undefined);
  assert.equal(invalidOptionalManifest.accentColor, undefined);

  const missingManifest = await importCodexPet({
    folderName: "missing-manifest",
    sourceRoot,
    targetRoot,
  });
  assert.equal(missingManifest.ok, false);
  assert.equal(missingManifest.reason, "missing_manifest");

  const missingSprite = await importCodexPet({
    folderName: "missing-sprite",
    sourceRoot,
    targetRoot,
  });
  assert.equal(missingSprite.ok, false);
  assert.equal(missingSprite.reason, "spritesheet_missing");

  const conflict = await importCodexPet({ folderName: "conflict-pet", sourceRoot, targetRoot });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, "conflict");
  assert.equal(
    await readFile(path.join(targetRoot, "conflict-pet", "sentinel.txt"), "utf8"),
    "keep me",
  );

  const duplicateId = await importCodexPet({
    folderName: "duplicate-id-copy",
    sourceRoot,
    targetRoot,
  });
  assert.equal(duplicateId.ok, false);
  assert.equal(duplicateId.status, "conflict");
  assert.equal(duplicateId.reason, "manifest_exists");
  await assert.rejects(readFile(path.join(targetRoot, "duplicate-id-copy", "pet.json"), "utf8"));

  const targetEntries = await readdir(targetRoot);
  assert.deepEqual(
    targetEntries.filter((entry) => entry.startsWith(".importing-")),
    [],
  );

  console.log("pet importer tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writePet(folderName, { manifest, spritesheetName }) {
  const dir = path.join(sourceRoot, folderName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "pet.json"), JSON.stringify(manifest), "utf8");
  if (spritesheetName) {
    await writeFile(path.join(dir, spritesheetName), `sprite:${folderName}`, "utf8");
  }
}

async function writeTargetPet(folderName, manifest) {
  const dir = path.join(targetRoot, folderName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "pet.json"), JSON.stringify(manifest), "utf8");
  await writeFile(path.join(dir, manifest.spritesheetPath), `sprite:${folderName}`, "utf8");
}

function assertCandidate(candidates, folderName, status, spritesheetPath, reason) {
  const candidate = candidates.find((item) => item.folderName === folderName);
  assert.ok(candidate, `expected ${folderName} candidate`);
  assert.equal(candidate.status, status);
  if (spritesheetPath !== undefined) assert.equal(candidate.spritesheetPath, spritesheetPath);
  if (reason !== undefined) assert.equal(candidate.reason, reason);
}
