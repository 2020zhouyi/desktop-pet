import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage } from "@electron/asar";
import {
  formatPackageVerifyReport,
  validatePackageArtifacts,
} from "../electron/package-verify.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-package-verify-"));
const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "package-verify.mjs",
);

try {
  const completeRoot = await writeProject("complete", [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
    { folderName: "beta", spritesheetPath: "assets/spritesheet.png" },
  ]);
  await writeReleaseAsars(completeRoot, [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
    { folderName: "beta", spritesheetPath: "assets/spritesheet.png" },
  ]);
  const completeResult = await validatePackageArtifacts({ projectRoot: completeRoot });
  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.localPetCount, 2);
  assert.equal(completeResult.artifacts.length, 2);
  assert.equal(completeResult.errorCount, 0);
  const completeReport = formatPackageVerifyReport(completeResult);
  assert.match(completeReport, /Package artifact verify passed/);
  assert.match(completeReport, /2 app\.asar artifacts checked/);

  const completeCli = await execFileResult(process.execPath, [
    cliPath,
    "--project-root",
    completeRoot,
  ]);
  assert.equal(completeCli.code, 0);
  assert.match(completeCli.stdout, /Package artifact verify passed/);

  const missingPetsRoot = await writeProject("missing-pets", [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
  ]);
  await writeReleaseAsars(missingPetsRoot, [], { includePetsDirectory: false });
  const missingPetsResult = await validatePackageArtifacts({ projectRoot: missingPetsRoot });
  assert.equal(missingPetsResult.ok, false);
  assert.equal(findIssue(missingPetsResult, "missing_pets_directory").severity, "error");

  const countMismatchRoot = await writeProject("count-mismatch", [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
    { folderName: "beta", spritesheetPath: "spritesheet.webp" },
  ]);
  await writeReleaseAsars(countMismatchRoot, [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
  ]);
  const countMismatchResult = await validatePackageArtifacts({ projectRoot: countMismatchRoot });
  assert.equal(countMismatchResult.ok, false);
  assert.equal(findIssue(countMismatchResult, "manifest_count_mismatch").localCount, 2);
  assert.equal(findIssue(countMismatchResult, "missing_packaged_manifest").folderName, "beta");

  const badEntryRoot = await writeProject("bad-entries", [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
  ]);
  await writeReleaseAsars(badEntryRoot, [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
    { folderName: "alpha_副本", spritesheetPath: "spritesheet.webp" },
    { folderName: ".importing-alpha-123", spritesheetPath: "spritesheet.webp" },
    { folderName: "test-material", spritesheetPath: "spritesheet.webp" },
  ]);
  const badEntryResult = await validatePackageArtifacts({ projectRoot: badEntryRoot });
  assert.equal(badEntryResult.ok, false);
  assert.equal(findIssue(badEntryResult, "disallowed_pet_entry", "alpha_副本").reason, "copy");
  assert.equal(
    findIssue(badEntryResult, "disallowed_pet_entry", ".importing-alpha-123").reason,
    "staging",
  );
  assert.equal(findIssue(badEntryResult, "disallowed_pet_entry", "test-material").reason, "test");

  const badEntryCli = await execFileResult(process.execPath, [
    cliPath,
    "--project-root",
    badEntryRoot,
  ]);
  assert.notEqual(badEntryCli.code, 0);
  assert.match(badEntryCli.stdout, /Package artifact verify failed/);
  assert.match(badEntryCli.stdout, /disallowed pet package entry/);

  console.log("package verify tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeProject(name, pets) {
  const projectRoot = path.join(tempDir, name);
  await mkdir(path.join(projectRoot, "pets"), { recursive: true });

  for (const pet of pets) {
    await writePet(path.join(projectRoot, "pets"), pet);
  }

  return projectRoot;
}

async function writeReleaseAsars(projectRoot, pets, options = {}) {
  await writeAppAsar(
    path.join(
      projectRoot,
      "release",
      "mac-arm64",
      "Desktop Pet MVP.app",
      "Contents",
      "Resources",
      "app.asar",
    ),
    pets,
    options,
  );
  await writeAppAsar(
    path.join(projectRoot, "release", "win-unpacked", "resources", "app.asar"),
    pets,
    options,
  );
}

async function writeAppAsar(asarPath, pets, { includePetsDirectory = true } = {}) {
  const appRoot = path.join(tempDir, `asar-src-${Math.random().toString(16).slice(2)}`);
  await mkdir(path.dirname(asarPath), { recursive: true });
  await mkdir(appRoot, { recursive: true });
  await writeFile(path.join(appRoot, "package.json"), JSON.stringify({ name: "fake-app" }), "utf8");

  if (includePetsDirectory) {
    await mkdir(path.join(appRoot, "pets"), { recursive: true });
    for (const pet of pets) {
      await writePet(path.join(appRoot, "pets"), pet);
    }
  }

  await createPackage(appRoot, asarPath);
  await rm(appRoot, { recursive: true, force: true });
}

async function writePet(root, { folderName, spritesheetPath }) {
  const petDir = path.join(root, folderName);
  await mkdir(petDir, { recursive: true });
  await writeFile(
    path.join(petDir, "pet.json"),
    JSON.stringify({
      id: folderName,
      displayName: folderName,
      spritesheetPath,
    }),
    "utf8",
  );
  const spriteFile = path.join(petDir, ...spritesheetPath.split("/"));
  await mkdir(path.dirname(spriteFile), { recursive: true });
  await writeFile(spriteFile, `sprite:${folderName}`, "utf8");
}

function findIssue(result, code, folderName) {
  for (const artifact of result.artifacts) {
    const issue = artifact.issues.find(
      (item) =>
        item.code === code &&
        (folderName === undefined || item.folderName === folderName),
    );
    if (issue) return issue;
  }
  return result.issues.find((item) => item.code === code);
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
