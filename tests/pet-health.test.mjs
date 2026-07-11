import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPetHealthReport,
  validatePetHealth,
} from "../electron/pet-health.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-health-"));
const petsRoot = path.join(tempDir, "pets");
const cleanRoot = path.join(tempDir, "clean-pets");
const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "pet-health.mjs",
);

try {
  await mkdir(petsRoot, { recursive: true });
  await mkdir(cleanRoot, { recursive: true });

  await writePet(petsRoot, "good-pet", {
    manifest: {
      id: "good-pet",
      displayName: "Good Pet",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "nested-good", {
    manifest: {
      id: "nested-good",
      displayName: "Nested Good",
      spritesheetPath: "assets/spritesheet.webp",
      author: "Pi Team",
      version: "1.0.0",
      tags: ["jx3", "built-in"],
      faction: "七秀",
      recommendedScale: 1.15,
      accentColor: "#217d74",
      behaviorProfile: "watchful",
    },
    spritesheetPath: "assets/spritesheet.webp",
  });
  await writePet(petsRoot, "invalid-optional-fields", {
    manifest: {
      id: "invalid-optional-fields",
      displayName: "Invalid Optional Fields",
      spritesheetPath: "spritesheet.webp",
      author: 7,
      version: "",
      tags: "jx3",
      faction: [],
      recommendedScale: 8,
      accentColor: "green",
      behaviorProfile: {},
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "unexpected-file", {
    manifest: {
      id: "unexpected-file",
      displayName: "Unexpected File",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
    extraFiles: {
      "notes.txt": "do not package me",
    },
  });
  await mkdir(path.join(petsRoot, "missing-manifest"), { recursive: true });
  await mkdir(path.join(petsRoot, "invalid-json"), { recursive: true });
  await writeFile(path.join(petsRoot, "invalid-json", "pet.json"), "{not json", "utf8");
  await writePet(petsRoot, "missing-id", {
    manifest: {
      displayName: "Missing ID",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "missing-display-name", {
    manifest: {
      id: "missing-display-name",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "missing-spritesheet-path", {
    manifest: {
      id: "missing-spritesheet-path",
      displayName: "Missing Spritesheet Path",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "missing-spritesheet-file", {
    manifest: {
      id: "missing-spritesheet-file",
      displayName: "Missing Spritesheet File",
      spritesheetPath: "spritesheet.webp",
    },
  });
  await writePet(petsRoot, "absolute-spritesheet", {
    manifest: {
      id: "absolute-spritesheet",
      displayName: "Absolute Spritesheet",
      spritesheetPath: path.join(tempDir, "outside.webp"),
    },
  });
  await writePet(petsRoot, "windows-absolute-spritesheet", {
    manifest: {
      id: "windows-absolute-spritesheet",
      displayName: "Windows Absolute Spritesheet",
      spritesheetPath: "C:\\tmp\\spritesheet.webp",
    },
  });
  await writePet(petsRoot, "traversal-spritesheet", {
    manifest: {
      id: "traversal-spritesheet",
      displayName: "Traversal Spritesheet",
      spritesheetPath: "../outside.webp",
    },
  });
  await writePet(petsRoot, "duplicate-one", {
    manifest: {
      id: "duplicate-id",
      displayName: "Duplicate One",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "duplicate-two", {
    manifest: {
      id: "duplicate-id",
      displayName: "Duplicate Two",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "copy-folder_副本", {
    manifest: {
      id: "copy-folder",
      displayName: "Copy Folder",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await writePet(petsRoot, "copy-folder copy", {
    manifest: {
      id: "copy-folder-copy",
      displayName: "Copy Folder Copy",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  await mkdir(path.join(petsRoot, ".importing-copy-folder-123"), { recursive: true });

  const result = await validatePetHealth({ petsRoot });
  assert.equal(result.ok, false);
  assert.ok(result.errorCount >= 10, "expected all invalid fixtures to be errors");
  assert.equal(result.warningCount, 9);
  assert.equal(result.scannedPetCount, 17);
  assert.equal(findIssue(result, "missing_manifest", "missing-manifest").severity, "error");
  assert.equal(findIssue(result, "invalid_json", "invalid-json").severity, "error");
  assertRequiredField(result, "missing-id", "id");
  assertRequiredField(result, "missing-display-name", "displayName");
  assertRequiredField(result, "missing-spritesheet-path", "spritesheetPath");
  assert.equal(
    findIssue(result, "spritesheet_missing", "missing-spritesheet-file").severity,
    "error",
  );
  assert.equal(
    findIssue(result, "unsafe_spritesheet_path", "absolute-spritesheet").reason,
    "absolute",
  );
  assert.equal(
    findIssue(result, "unsafe_spritesheet_path", "windows-absolute-spritesheet").reason,
    "absolute",
  );
  assert.equal(
    findIssue(result, "unsafe_spritesheet_path", "traversal-spritesheet").reason,
    "traversal",
  );
  assert.deepEqual(
    findIssue(result, "duplicate_manifest_id").folders,
    ["duplicate-one", "duplicate-two"],
  );
  assert.equal(
    findIssue(result, "copy_suffix_folder", "copy-folder_副本").severity,
    "warning",
  );
  assert.equal(findIssue(result, "copy_suffix_folder", "copy-folder copy").severity, "warning");
  assert.equal(
    findIssue(result, "stale_importing_staging", ".importing-copy-folder-123").severity,
    "error",
  );
  assert.equal(findIssue(result, "spritesheet_missing", "good-pet"), undefined);
  assert.equal(findIssue(result, "unsafe_spritesheet_path", "nested-good"), undefined);
  assert.equal(findIssue(result, "unexpected_pet_file", "nested-good"), undefined);
  assert.equal(
    findIssue(result, "unexpected_pet_file", "unexpected-file").filePath,
    "notes.txt",
  );
  assert.equal(
    findIssue(result, "too_many_pet_files", "unexpected-file").fileCount,
    3,
  );
  assert.equal(findIssue(result, "invalid_optional_manifest_field", "nested-good"), undefined);
  assertOptionalFieldWarning(result, "invalid-optional-fields", "author");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "version");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "tags");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "faction");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "recommendedScale");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "accentColor");
  assertOptionalFieldWarning(result, "invalid-optional-fields", "behaviorProfile");

  const report = formatPetHealthReport(result);
  assert.match(report, /Pet health check failed/);
  assert.match(report, /desktop-pet-mvp\/pets only/);

  const failedCli = await execFileResult(process.execPath, [
    cliPath,
    "--pets-root",
    petsRoot,
  ]);
  assert.notEqual(failedCli.code, 0);
  assert.match(failedCli.stdout, /Pet health check failed/);

  await writePet(cleanRoot, "valid-copy-warning copy", {
    manifest: {
      id: "valid-copy-warning",
      displayName: "Valid Copy Warning",
      spritesheetPath: "spritesheet.webp",
    },
    spritesheetPath: "spritesheet.webp",
  });
  const warningOnlyCli = await execFileResult(process.execPath, [
    cliPath,
    "--pets-root",
    cleanRoot,
  ]);
  assert.equal(warningOnlyCli.code, 0);
  assert.match(warningOnlyCli.stdout, /0 errors, 1 warning/);

  console.log("pet health tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writePet(root, folderName, { manifest, spritesheetPath, extraFiles = {} }) {
  const dir = path.join(root, folderName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "pet.json"), JSON.stringify(manifest), "utf8");
  if (spritesheetPath) {
    const spriteFile = path.join(dir, ...spritesheetPath.split("/"));
    await mkdir(path.dirname(spriteFile), { recursive: true });
    await writeFile(spriteFile, `sprite:${folderName}`, "utf8");
  }
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const filePath = path.join(dir, ...relativePath.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
}

function assertRequiredField(result, folderName, field) {
  const issue = result.issues.find(
    (item) =>
      item.code === "missing_required_field" &&
      item.folderName === folderName &&
      item.field === field,
  );
  assert.ok(issue, `expected ${folderName} to report missing ${field}`);
  assert.equal(issue.severity, "error");
}

function assertOptionalFieldWarning(result, folderName, field) {
  const issue = result.issues.find(
    (item) =>
      item.code === "invalid_optional_manifest_field" &&
      item.folderName === folderName &&
      item.field === field,
  );
  assert.ok(issue, `expected ${folderName} to warn about optional ${field}`);
  assert.equal(issue.severity, "warning");
}

function findIssue(result, code, folderName) {
  return result.issues.find(
    (issue) =>
      issue.code === code &&
      (folderName === undefined || issue.folderName === folderName),
  );
}

function execFileResult(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({
        code: typeof error?.code === "number" ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}
