import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { listPackage } from "@electron/asar";
import {
  formatPetHealthReport,
  validatePetHealth,
} from "./pet-health.mjs";

const requiredPlatforms = ["mac", "win"];
const requiredRuntimeEntries = [
  "/electron/main.mjs",
  "/electron/preload.cjs",
  "/electron/ipc-capabilities.mjs",
  "/electron/pet-selection-store.mjs",
  "/electron/pet-manifest.mjs",
  "/electron/smoke-probe.mjs",
  "/electron/window-geometry.mjs",
  "/electron/window-surfaces.mjs",
  "/electron/window-security.mjs",
  "/dist/index.html",
  "/package.json",
];
const requiredRuntimeAssetGroups = [
  { label: "JavaScript", pattern: /^\/dist\/assets\/[^/]+\.js$/ },
  { label: "CSS", pattern: /^\/dist\/assets\/[^/]+\.css$/ },
];
const retiredRuntimeEntries = [
  "/electron/behavior-controller.mjs",
  "/electron/state-api-auth.mjs",
  "/electron/pet-importer.mjs",
  "/electron/pet-management.mjs",
  "/electron/settings-store.mjs",
  "/scripts/pet-state.mjs",
];

export async function validatePackageArtifacts({
  projectRoot = process.cwd(),
  releaseRoot,
  petsRoot,
} = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedReleaseRoot = path.resolve(releaseRoot ?? path.join(resolvedProjectRoot, "release"));
  const resolvedPetsRoot = path.resolve(petsRoot ?? path.join(resolvedProjectRoot, "pets"));
  const issues = [];

  const petHealth = await validatePetHealth({ petsRoot: resolvedPetsRoot });
  const localPets = await readLocalPets(resolvedPetsRoot, issues);
  const releaseState = await statReleaseRoot(resolvedReleaseRoot);
  const artifacts = [];

  if (releaseState.status === "missing") {
    issues.push(issue({
      severity: "error",
      code: "release_missing",
      message: `Release directory does not exist: ${resolvedReleaseRoot}. Run npm run dist:all before npm run package:verify.`,
    }));
  } else if (releaseState.status === "not_directory") {
    issues.push(issue({
      severity: "error",
      code: "release_not_directory",
      message: `Release path is not a directory: ${resolvedReleaseRoot}.`,
    }));
  } else {
    const discovered = await discoverAppAsars(resolvedReleaseRoot);
    if (discovered.length === 0) {
      issues.push(issue({
        severity: "error",
        code: "app_asar_missing",
        message: `No app.asar artifacts found under ${resolvedReleaseRoot}. Expected mac*/**/*.app/Contents/Resources/app.asar and win-unpacked/resources/app.asar.`,
      }));
    }

    for (const platform of requiredPlatforms) {
      if (discovered.some((artifact) => artifact.platform === platform)) continue;
      issues.push(issue({
        severity: "error",
        code: "platform_app_asar_missing",
        platform,
        message: `Missing ${platform} app.asar under release/. Expected output from npm run dist:all.`,
      }));
    }

    for (const artifact of discovered) {
      artifacts.push(await validateAsarArtifact(artifact, localPets));
    }
  }

  const artifactErrors = artifacts.reduce((count, artifact) => count + artifact.errorCount, 0);
  const artifactWarnings = artifacts.reduce((count, artifact) => count + artifact.warningCount, 0);
  const ownErrors = countSeverity(issues, "error");
  const ownWarnings = countSeverity(issues, "warning");
  const errorCount = ownErrors + artifactErrors + petHealth.errorCount;
  const warningCount = ownWarnings + artifactWarnings + petHealth.warningCount;

  return {
    ok: errorCount === 0,
    projectRoot: resolvedProjectRoot,
    releaseRoot: resolvedReleaseRoot,
    petsRoot: resolvedPetsRoot,
    localPetCount: localPets.length,
    petHealth,
    issues,
    artifacts,
    errorCount,
    warningCount,
  };
}

export function formatPackageVerifyReport(result) {
  const lines = [];
  const status = result.ok ? "passed" : "failed";
  lines.push(
    `Package artifact verify ${status}: ${result.artifacts.length} app.asar artifacts checked, ` +
      `${formatCount(result.localPetCount, "local pet")}, ` +
      `${formatCount(result.errorCount, "error")}, ${formatCount(result.warningCount, "warning")}.`,
  );
  lines.push(
    "Scope: reads desktop-pet-mvp/release app.asar files and project-local desktop-pet-mvp/pets only.",
  );
  lines.push(
    "This check is read-only; it does not run electron-builder, generate installers, or modify release files.",
  );
  lines.push(`Project root: ${result.projectRoot}`);
  lines.push(`Release root: ${result.releaseRoot}`);
  lines.push(`Pets root: ${result.petsRoot}`);

  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Release discovery:");
    for (const item of result.issues) {
      lines.push(formatIssue(item));
    }
  }

  lines.push("");
  lines.push("Local pet health:");
  lines.push(formatPetHealthReport(result.petHealth).trimEnd());

  lines.push("");
  lines.push("Packaged artifacts:");
  if (result.artifacts.length === 0) {
    lines.push("No app.asar artifacts were checked.");
  } else {
    for (const artifact of result.artifacts) {
      lines.push(
        `- ${artifact.platform}: ${artifact.relativePath} ` +
          `(${formatCount(artifact.packagedManifestCount, "pet manifest")}, ` +
          `${formatCount(artifact.packagedSpritesheetCount, "covered spritesheet")})`,
      );
      if (artifact.issues.length === 0) {
        lines.push("  OK");
      } else {
        for (const item of artifact.issues) {
          lines.push(`  ${formatIssue(item)}`);
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function validateAsarArtifact(artifact, localPets) {
  let entries;
  const artifactIssues = [];

  try {
    entries = listPackage(artifact.asarPath).map(normalizeAsarEntry);
  } catch (error) {
    artifactIssues.push(issue({
      severity: "error",
      code: "asar_list_failed",
      message: `Unable to list app.asar: ${error instanceof Error ? error.message : String(error)}`,
    }));
    entries = [];
  }

  const entrySet = new Set(entries);
  artifactIssues.push(...findRuntimeEntryIssues(entrySet));
  const hasPetsDirectory = entrySet.has("/pets");
  const petEntries = entries.filter((entry) => entry === "/pets" || entry.startsWith("/pets/"));
  if (!hasPetsDirectory) {
    artifactIssues.push(issue({
      severity: "error",
      code: "missing_pets_directory",
      message: "Packaged app.asar is missing /pets.",
    }));
  }

  const packagedManifestPaths = entries.filter((entry) => /^\/pets\/[^/]+\/pet\.json$/.test(entry));
  const packagedManifestFolders = packagedManifestPaths.map((entry) => entry.split("/")[2]).sort();
  const expectedFolders = localPets.map((pet) => pet.folderName).sort();

  if (packagedManifestPaths.length !== localPets.length) {
    artifactIssues.push(issue({
      severity: "error",
      code: "manifest_count_mismatch",
      localCount: localPets.length,
      packagedCount: packagedManifestPaths.length,
      message: `Packaged /pets/*/pet.json count is ${packagedManifestPaths.length}, expected ${localPets.length}.`,
    }));
  }

  for (const folderName of expectedFolders) {
    if (packagedManifestFolders.includes(folderName)) continue;
    artifactIssues.push(issue({
      severity: "error",
      code: "missing_packaged_manifest",
      folderName,
      message: `Missing packaged manifest /pets/${folderName}/pet.json.`,
    }));
  }

  for (const folderName of packagedManifestFolders) {
    if (expectedFolders.includes(folderName)) continue;
    artifactIssues.push(issue({
      severity: "error",
      code: "unexpected_packaged_manifest",
      folderName,
      message: `Unexpected packaged manifest /pets/${folderName}/pet.json.`,
    }));
  }

  let packagedSpritesheetCount = 0;
  for (const pet of localPets) {
    const expectedSprite = `/pets/${pet.folderName}/${pet.spritesheetPath}`;
    if (entrySet.has(expectedSprite)) {
      packagedSpritesheetCount += 1;
      continue;
    }
    artifactIssues.push(issue({
      severity: "error",
      code: "missing_packaged_spritesheet",
      folderName: pet.folderName,
      spritesheetPath: pet.spritesheetPath,
      message: `Missing packaged spritesheet ${expectedSprite}.`,
    }));
  }

  const disallowedEntries = findDisallowedPetEntries(petEntries);
  artifactIssues.push(...disallowedEntries);
  artifactIssues.push(...findUnexpectedPackagedPetEntries(petEntries, localPets));

  return {
    ...artifact,
    packagedManifestCount: packagedManifestPaths.length,
    packagedSpritesheetCount,
    issues: artifactIssues,
    errorCount: countSeverity(artifactIssues, "error"),
    warningCount: countSeverity(artifactIssues, "warning"),
  };
}

function findRuntimeEntryIssues(entrySet) {
  const issues = [];

  for (const entry of requiredRuntimeEntries) {
    if (entrySet.has(entry)) continue;
    issues.push(issue({
      severity: "error",
      code: "missing_runtime_entry",
      entry,
      message: `Packaged app.asar is missing required runtime entry ${entry}.`,
    }));
  }

  for (const group of requiredRuntimeAssetGroups) {
    if ([...entrySet].some((entry) => group.pattern.test(entry))) continue;
    issues.push(issue({
      severity: "error",
      code: "missing_runtime_asset",
      assetType: group.label,
      message: `Packaged app.asar is missing a built ${group.label} asset under /dist/assets/.`,
    }));
  }

  for (const entry of retiredRuntimeEntries) {
    if (!entrySet.has(entry)) continue;
    issues.push(issue({
      severity: "error",
      code: "retired_runtime_entry",
      entry,
      message: `Packaged app.asar contains retired runtime entry ${entry}.`,
    }));
  }

  return issues;
}

function findUnexpectedPackagedPetEntries(entries, localPets) {
  const expectedPets = new Map(localPets.map((pet) => [pet.folderName, pet]));
  const issues = [];
  const seen = new Set();

  for (const entry of entries) {
    const parts = entry.split("/").filter(Boolean);
    if (parts.length <= 1) continue;
    const folderName = parts[1];
    const pet = expectedPets.get(folderName);
    if (!pet) continue;

    const allowedEntries = allowedPackagedEntriesForPet(pet);
    if (allowedEntries.has(entry)) continue;
    if ([...allowedEntries].some((allowed) => allowed.startsWith(`${entry}/`))) continue;

    const key = `${folderName}:${entry}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(issue({
      severity: "error",
      code: "unexpected_packaged_pet_entry",
      folderName,
      entry,
      message: `Unexpected packaged pet entry ${entry}; only pet.json and the spritesheet are expected.`,
    }));
  }

  return issues;
}

function allowedPackagedEntriesForPet(pet) {
  return new Set([
    `/pets/${pet.folderName}`,
    `/pets/${pet.folderName}/pet.json`,
    `/pets/${pet.folderName}/${pet.spritesheetPath}`,
  ]);
}

async function discoverAppAsars(releaseRoot) {
  const found = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "app.asar") continue;
      const relativePath = normalizePath(path.relative(releaseRoot, filePath));
      const platform = classifyAppAsar(relativePath);
      if (!platform) continue;
      found.push({
        platform,
        asarPath: filePath,
        relativePath,
      });
    }
  }

  await walk(releaseRoot);
  return found.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function readLocalPets(petsRoot, issues) {
  let entries;
  try {
    entries = await readdir(petsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const pets = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
    const manifestPath = path.join(petsRoot, entry.name, "pet.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      issues.push(issue({
        severity: "error",
        code: "local_manifest_unreadable",
        folderName: entry.name,
        message: `Unable to read local manifest ${normalizePath(path.relative(petsRoot, manifestPath))}.`,
      }));
      continue;
    }

    const spritesheetPath = normalizeManifestSpritesheetPath(manifest?.spritesheetPath);
    if (!spritesheetPath) {
      issues.push(issue({
        severity: "error",
        code: "local_manifest_missing_spritesheet",
        folderName: entry.name,
        message: `Local manifest /pets/${entry.name}/pet.json is missing a usable spritesheetPath.`,
      }));
      continue;
    }

    pets.push({
      folderName: entry.name,
      spritesheetPath,
    });
  }

  return pets;
}

async function statReleaseRoot(releaseRoot) {
  try {
    const stat = await lstat(releaseRoot);
    return stat.isDirectory() ? { status: "ok" } : { status: "not_directory" };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing" };
    throw error;
  }
}

function classifyAppAsar(relativePath) {
  if (/^mac[^/]*\/.+\.app\/Contents\/Resources\/app\.asar$/.test(relativePath)) {
    return "mac";
  }
  if (relativePath === "win-unpacked/resources/app.asar") {
    return "win";
  }
  return null;
}

function findDisallowedPetEntries(entries) {
  const issues = [];
  const seen = new Set();

  for (const entry of entries) {
    for (const segment of entry.split("/").filter(Boolean).slice(1)) {
      const disallowed = classifyDisallowedPetSegment(segment);
      if (!disallowed) continue;
      const key = `${segment}:${disallowed.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue({
        severity: "error",
        code: "disallowed_pet_entry",
        folderName: segment,
        reason: disallowed.reason,
        message: `Found disallowed pet package entry "${segment}" (${disallowed.description}).`,
      }));
    }
  }

  return issues;
}

function classifyDisallowedPetSegment(segment) {
  if (segment.startsWith(".importing-")) {
    return { reason: "staging", description: "stale .importing-* staging directory" };
  }
  if (hasCopySuffix(segment)) {
    return { reason: "copy", description: "duplicate copy suffix" };
  }
  if (hasTestMaterialName(segment)) {
    return { reason: "test", description: "test or temporary material name" };
  }
  return null;
}

function normalizeManifestSpritesheetPath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = value.trim().split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("/");
}

function normalizeAsarEntry(entry) {
  const normalized = normalizePath(entry);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function hasCopySuffix(folderName) {
  return (
    /_副本(?:$|[-_\s(（])/.test(folderName) ||
    /(?:^|[-_\s])副本(?:$|[-_\s)）])/.test(folderName) ||
    /(?:^|[-_\s])copy(?:$|[-_\s]?\d+$|\s+\d+$)/i.test(folderName) ||
    /\(\d+\)$/.test(folderName)
  );
}

function hasTestMaterialName(segment) {
  if (/测试|测试素材|示例素材/.test(segment)) return true;
  return /(?:^|[-_.\s])(test|fixture|fixtures|sample|mock|tmp|temp)(?:$|[-_.\s])/i.test(segment);
}

function issue(value) {
  return value;
}

function formatIssue(item) {
  const prefix = `[${item.severity.toUpperCase()}]`;
  const location = item.folderName ? `${item.folderName}: ` : "";
  const suffix = item.code ? ` (${item.code})` : "";
  return `${prefix} ${location}${item.message}${suffix}`;
}

function countSeverity(items, severity) {
  return items.filter((item) => item.severity === severity).length;
}

function formatCount(value, singular) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
