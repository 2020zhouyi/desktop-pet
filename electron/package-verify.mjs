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
  "/electron/pet-library.mjs",
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
    "Scope: reads release app.asar and pets-seed artifacts plus project-local desktop-pet-mvp/pets.",
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
          `(${formatCount(artifact.seedPetCount, "seed pet")})`,
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
  const petEntries = entries.filter((entry) => entry === "/pets" || entry.startsWith("/pets/"));
  if (petEntries.length > 0) {
    artifactIssues.push(issue({
      severity: "error",
      code: "bundled_pet_resources_in_app_asar",
      message: "Packaged app.asar must not contain /pets; runtime uses the consumable pets-seed resource.",
    }));
  }

  const seedHealth = await validatePetHealth({ petsRoot: artifact.seedRoot });
  artifactIssues.push(...seedHealth.issues.map((item) => ({
    ...item,
    code: `seed_${item.code}`,
    message: `Packaged pets-seed: ${item.message}`,
  })));
  const seedPets = await readLocalPets(artifact.seedRoot, artifactIssues);
  artifactIssues.push(...compareSeedPets(localPets, seedPets));

  return {
    ...artifact,
    seedPetCount: seedPets.length,
    issues: artifactIssues,
    errorCount: countSeverity(artifactIssues, "error"),
    warningCount: countSeverity(artifactIssues, "warning"),
  };
}

function compareSeedPets(localPets, seedPets) {
  const issues = [];
  const expected = new Map(localPets.map((pet) => [pet.folderName, pet]));
  const actual = new Map(seedPets.map((pet) => [pet.folderName, pet]));

  for (const [folderName, pet] of expected) {
    const packagedPet = actual.get(folderName);
    if (!packagedPet) {
      issues.push(issue({
        severity: "error",
        code: "seed_pet_missing",
        folderName,
        message: `Packaged pets-seed is missing ${folderName}.`,
      }));
      continue;
    }
    if (packagedPet.spritesheetPath !== pet.spritesheetPath) {
      issues.push(issue({
        severity: "error",
        code: "seed_spritesheet_mismatch",
        folderName,
        message: `Packaged pets-seed uses ${packagedPet.spritesheetPath}; expected ${pet.spritesheetPath}.`,
      }));
    }
  }

  for (const folderName of actual.keys()) {
    if (expected.has(folderName)) continue;
    issues.push(issue({
      severity: "error",
      code: "unexpected_seed_pet",
      folderName,
      message: `Packaged pets-seed contains unexpected pet ${folderName}.`,
    }));
  }

  return issues;
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
        seedRoot: path.join(path.dirname(filePath), "pets-seed"),
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
