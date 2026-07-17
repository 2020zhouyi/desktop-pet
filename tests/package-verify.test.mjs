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

const removeDirectory = process.versions.electron
  ? (await import("original-fs")).promises.rm
  : rm;
const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-package-verify-"));
const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "package-verify.mjs",
);
const requiredRuntimeEntries = [
  "electron/main.mjs",
  "electron/preload.cjs",
  "electron/ipc-capabilities.mjs",
  "electron/pet-selection-store.mjs",
  "electron/pet-manifest.mjs",
  "electron/pet-library.mjs",
  "electron/smoke-probe.mjs",
  "electron/window-geometry.mjs",
  "electron/window-surfaces.mjs",
  "electron/window-security.mjs",
  "dist/index.html",
  "package.json",
];
const requiredAssetEntries = ["dist/assets/app.js", "dist/assets/app.css"];
const retiredRuntimeEntries = [
  "electron/behavior-controller.mjs",
  "electron/state-api-auth.mjs",
  "electron/pet-importer.mjs",
  "electron/pet-management.mjs",
  "electron/settings-store.mjs",
  "scripts/pet-state.mjs",
];

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

  for (const runtimeEntry of requiredRuntimeEntries) {
    const missingRuntimeRoot = await writeProject(
      `missing-runtime-${runtimeEntry.replaceAll("/", "-")}`,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
    );
    await writeReleaseAsars(
      missingRuntimeRoot,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
      { missingRuntimeEntries: [runtimeEntry] },
    );
    const missingRuntimeResult = await validatePackageArtifacts({
      projectRoot: missingRuntimeRoot,
    });
    assert.equal(
      missingRuntimeResult.ok,
      false,
      `missing /${runtimeEntry} must fail package verification`,
    );
    for (const artifact of missingRuntimeResult.artifacts) {
      assert.equal(
        findArtifactIssue(artifact, "missing_runtime_entry", `/${runtimeEntry}`).severity,
        "error",
      );
    }
  }

  for (const assetEntry of requiredAssetEntries) {
    const missingAssetRoot = await writeProject(
      `missing-asset-${path.extname(assetEntry).slice(1)}`,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
    );
    await writeReleaseAsars(
      missingAssetRoot,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
      { missingRuntimeEntries: [assetEntry] },
    );
    const missingAssetResult = await validatePackageArtifacts({ projectRoot: missingAssetRoot });
    assert.equal(missingAssetResult.ok, false, `missing ${assetEntry} must fail package verification`);
    for (const artifact of missingAssetResult.artifacts) {
      assert.equal(findArtifactIssue(artifact, "missing_runtime_asset").severity, "error");
    }
  }

  for (const runtimeEntry of retiredRuntimeEntries) {
    const retiredRuntimeRoot = await writeProject(
      `retired-runtime-${runtimeEntry.replaceAll("/", "-")}`,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
    );
    await writeReleaseAsars(
      retiredRuntimeRoot,
      [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
      { retiredRuntimeEntries: [runtimeEntry] },
    );
    const retiredRuntimeResult = await validatePackageArtifacts({
      projectRoot: retiredRuntimeRoot,
    });
    assert.equal(
      retiredRuntimeResult.ok,
      false,
      `packaged /${runtimeEntry} must fail package verification`,
    );
    for (const artifact of retiredRuntimeResult.artifacts) {
      assert.equal(
        findArtifactIssue(artifact, "retired_runtime_entry", `/${runtimeEntry}`).severity,
        "error",
      );
    }
  }

  const bundledPetsRoot = await writeProject("bundled-pets", [
    { folderName: "alpha", spritesheetPath: "spritesheet.webp" },
  ]);
  await writeReleaseAsars(
    bundledPetsRoot,
    [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }],
    { appPets: [{ folderName: "alpha", spritesheetPath: "spritesheet.webp" }] },
  );
  const bundledPetsResult = await validatePackageArtifacts({ projectRoot: bundledPetsRoot });
  assert.equal(bundledPetsResult.ok, false);
  assert.equal(findIssue(bundledPetsResult, "bundled_pet_resources_in_app_asar").severity, "error");

  console.log("package verify tests passed");
} finally {
  await removeTree(tempDir);
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
  const asarPaths = [
    path.join(
      projectRoot,
      "release",
      "mac-arm64",
      "Desktop Pet MVP.app",
      "Contents",
      "Resources",
      "app.asar",
    ),
    path.join(projectRoot, "release", "win-unpacked", "resources", "app.asar"),
  ];
  for (const asarPath of asarPaths) {
    await writeAppAsar(asarPath, options.appPets ?? [], options);
    const seedRoot = path.join(path.dirname(asarPath), "pets-seed");
    for (const pet of pets) await writePet(seedRoot, pet);
  }
}

async function writeAppAsar(
  asarPath,
  pets,
  {
    includePetsDirectory = pets.length > 0,
    missingRuntimeEntries = [],
    retiredRuntimeEntries: includedRetiredRuntimeEntries = [],
  } = {},
) {
  const appRoot = path.join(tempDir, `asar-src-${Math.random().toString(16).slice(2)}`);
  await mkdir(path.dirname(asarPath), { recursive: true });
  await mkdir(appRoot, { recursive: true });

  const omittedRuntimeEntries = new Set(missingRuntimeEntries);
  for (const runtimeEntry of requiredRuntimeEntries) {
    if (omittedRuntimeEntries.has(runtimeEntry)) continue;
    const filePath = path.join(appRoot, ...runtimeEntry.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      runtimeEntry === "package.json"
        ? JSON.stringify({ name: "fake-app" })
        : `fixture:${runtimeEntry}`,
      "utf8",
    );
  }
  for (const assetEntry of requiredAssetEntries) {
    if (omittedRuntimeEntries.has(assetEntry)) continue;
    const filePath = path.join(appRoot, ...assetEntry.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `fixture:${assetEntry}`, "utf8");
  }

  for (const runtimeEntry of includedRetiredRuntimeEntries) {
    const filePath = path.join(appRoot, ...runtimeEntry.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `retired-fixture:${runtimeEntry}`, "utf8");
  }

  if (includePetsDirectory) {
    await mkdir(path.join(appRoot, "pets"), { recursive: true });
    for (const pet of pets) {
      await writePet(path.join(appRoot, "pets"), pet);
    }
  }

  await createPackage(appRoot, asarPath);
  await removeTree(appRoot);
}

function removeTree(directory) {
  return removeDirectory(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

async function writePet(root, { folderName, spritesheetPath, extraFiles = {} }) {
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
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const filePath = path.join(petDir, ...relativePath.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
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

function findArtifactIssue(artifact, code, entry) {
  return artifact.issues.find(
    (item) => item.code === code && item.entry === entry,
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
