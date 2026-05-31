import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPackageHealthReport,
  requiredBuildFilePatterns,
  validatePackageHealth,
} from "../electron/package-health.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-package-health-"));
const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "package-check.mjs",
);

try {
  const missingPetsRoot = await writeProject("missing-pets-pattern", {
    buildFiles: requiredBuildFilePatterns.filter((pattern) => pattern !== "pets/**/*"),
    pet: "valid",
  });
  const missingPetsResult = await validatePackageHealth({ projectRoot: missingPetsRoot });
  assert.equal(missingPetsResult.ok, false);
  assert.equal(missingPetsResult.packageErrorCount, 1);
  assert.equal(missingPetsResult.petHealth.ok, true);
  assert.equal(
    findIssue(missingPetsResult, "missing_required_build_file", "pets/**/*").severity,
    "error",
  );
  const missingPetsCli = await execFileResult(process.execPath, [
    cliPath,
    "--project-root",
    missingPetsRoot,
  ]);
  assert.notEqual(missingPetsCli.code, 0);
  assert.match(missingPetsCli.stdout, /missing required entry "pets\/\*\*\/\*"/);

  const completeRoot = await writeProject("complete-config", {
    buildFiles: requiredBuildFilePatterns,
    pet: "valid",
  });
  const completeResult = await validatePackageHealth({ projectRoot: completeRoot });
  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.packageErrorCount, 0);
  assert.equal(completeResult.petHealth.scannedPetCount, 1);

  const completeReport = formatPackageHealthReport(completeResult);
  assert.match(completeReport, /Package check passed/);
  assert.match(completeReport, /does not run electron-builder/);
  const completeCli = await execFileResult(process.execPath, [
    cliPath,
    "--project-root",
    completeRoot,
  ]);
  assert.equal(completeCli.code, 0);
  assert.match(completeCli.stdout, /Package check passed/);

  const brokenPetRoot = await writeProject("broken-pet", {
    buildFiles: requiredBuildFilePatterns,
    pet: "missing-spritesheet",
  });
  const brokenPetResult = await validatePackageHealth({ projectRoot: brokenPetRoot });
  assert.equal(brokenPetResult.ok, false);
  assert.equal(brokenPetResult.packageErrorCount, 0);
  assert.equal(brokenPetResult.petHealth.ok, false);
  assert.ok(brokenPetResult.petHealth.errorCount > 0);

  const brokenPetReport = formatPackageHealthReport(brokenPetResult);
  assert.match(brokenPetReport, /Package check failed/);
  assert.match(brokenPetReport, /spritesheet file does not exist/);

  console.log("package health tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeProject(name, { buildFiles, pet }) {
  const projectRoot = path.join(tempDir, name);
  await mkdir(path.join(projectRoot, "pets"), { recursive: true });
  await writePackageJson(projectRoot, buildFiles);
  await writePet(path.join(projectRoot, "pets"), pet);
  return projectRoot;
}

async function writePackageJson(projectRoot, files) {
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({
      name: "desktop-pet-mvp-test",
      type: "module",
      build: {
        files,
      },
    }),
    "utf8",
  );
}

async function writePet(petsRoot, fixture) {
  const petDir = path.join(petsRoot, fixture);
  await mkdir(petDir, { recursive: true });
  await writeFile(
    path.join(petDir, "pet.json"),
    JSON.stringify({
      id: fixture,
      displayName: fixture,
      spritesheetPath: "spritesheet.webp",
    }),
    "utf8",
  );
  if (fixture === "valid") {
    await writeFile(path.join(petDir, "spritesheet.webp"), "sprite", "utf8");
  }
}

function findIssue(result, code, pattern) {
  return result.packageIssues.find(
    (issue) => issue.code === code && (pattern === undefined || issue.pattern === pattern),
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
