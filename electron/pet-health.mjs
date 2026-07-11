import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { invalidOptionalManifestFields } from "./pet-manifest.mjs";

const requiredManifestFields = ["id", "displayName", "spritesheetPath"];
const maxPetFileCount = 2;
const maxPetBytes = 25 * 1024 * 1024;

export async function validatePetHealth({ petsRoot } = {}) {
  if (!petsRoot) throw new Error("petsRoot is required");

  const resolvedPetsRoot = path.resolve(petsRoot);
  const issues = [];
  const manifestIdFolders = new Map();
  let scannedPetCount = 0;
  const entries = await readPetsRoot(resolvedPetsRoot, issues);

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      if (entry.isDirectory() && entry.name.startsWith(".importing-")) {
        issues.push(issue({
          severity: "error",
          code: "stale_importing_staging",
          folderName: entry.name,
          message: "Found a stale hidden .importing-* staging directory.",
        }));
      }
      continue;
    }
    if (!entry.isDirectory()) continue;

    scannedPetCount += 1;
    const folderName = entry.name;
    const petDir = path.join(resolvedPetsRoot, folderName);

    if (hasCopySuffix(folderName)) {
      issues.push(issue({
        severity: "warning",
        code: "copy_suffix_folder",
        folderName,
        message: "Pet folder name looks like a copied duplicate.",
      }));
    }

    const manifestResult = await readManifest(path.join(petDir, "pet.json"));
    if (manifestResult.status === "missing") {
      issues.push(issue({
        severity: "error",
        code: "missing_manifest",
        folderName,
        message: "Missing pet.json.",
      }));
      continue;
    }
    if (manifestResult.status === "invalid_json") {
      issues.push(issue({
        severity: "error",
        code: "invalid_json",
        folderName,
        message: "pet.json is not valid JSON.",
      }));
      continue;
    }

    const manifest = manifestResult.manifest;
    const manifestFieldState = validateManifestFields(manifest);
    for (const field of manifestFieldState.missingFields) {
      issues.push(issue({
        severity: "error",
        code: "missing_required_field",
        folderName,
        field,
        message: `pet.json is missing required field ${field}.`,
      }));
    }
    for (const field of invalidOptionalManifestFields(manifest)) {
      issues.push(issue({
        severity: "warning",
        code: "invalid_optional_manifest_field",
        folderName,
        field,
        message: `Optional manifest field ${field} is invalid and will be ignored by the app.`,
      }));
    }

    if (manifestFieldState.id) {
      const folders = manifestIdFolders.get(manifestFieldState.id) ?? [];
      folders.push(folderName);
      manifestIdFolders.set(manifestFieldState.id, folders);
    }

    if (!manifestFieldState.spritesheetPath) continue;
    const sprite = resolveSafeSpritesheetPath(petDir, manifestFieldState.spritesheetPath);
    if (!sprite.ok) {
      issues.push(issue({
        severity: "error",
        code: "unsafe_spritesheet_path",
        folderName,
        reason: sprite.reason,
        message: `spritesheetPath is ${messageForUnsafePath(sprite.reason)}.`,
      }));
      continue;
    }

    if (!(await isPlainFile(sprite.filePath))) {
      issues.push(issue({
        severity: "error",
        code: "spritesheet_missing",
        folderName,
        spritesheetPath: sprite.normalizedPath,
        message: `spritesheet file does not exist: ${sprite.normalizedPath}.`,
      }));
    }

    issues.push(...await validatePetBundleEntries({
      petDir,
      folderName,
      spritesheetPath: sprite.normalizedPath,
    }));
  }

  for (const [manifestId, folders] of manifestIdFolders) {
    if (folders.length < 2) continue;
    issues.push(issue({
      severity: "error",
      code: "duplicate_manifest_id",
      manifestId,
      folders: [...folders],
      message: `Duplicate manifest id "${manifestId}" appears in ${folders.join(", ")}.`,
    }));
  }

  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warningCount = issues.filter((item) => item.severity === "warning").length;

  return {
    ok: errorCount === 0,
    petsRoot: resolvedPetsRoot,
    scannedPetCount,
    errorCount,
    warningCount,
    issues,
  };
}

export function formatPetHealthReport(result) {
  const lines = [];
  const status = result.ok ? "passed" : "failed";
  lines.push(
    `Pet health check ${status}: ${result.scannedPetCount} pet folders scanned, ` +
      `${formatCount(result.errorCount, "error")}, ${formatCount(result.warningCount, "warning")}.`,
  );
  lines.push("Scope: desktop-pet-mvp/pets only; this check does not read or modify ~/.codex/pets.");
  lines.push(`Root: ${result.petsRoot}`);

  if (result.issues.length === 0) {
    lines.push("No pet resource issues found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("");
  for (const item of result.issues) {
    lines.push(formatIssue(item));
  }
  return `${lines.join("\n")}\n`;
}

async function readPetsRoot(petsRoot, issues) {
  try {
    return await readdir(petsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      issues.push(issue({
        severity: "error",
        code: "pets_root_missing",
        message: "Project-local pets directory does not exist.",
      }));
      return [];
    }
    throw error;
  }
}

async function validatePetBundleEntries({ petDir, folderName, spritesheetPath }) {
  const allowedFiles = new Set(["pet.json", spritesheetPath]);
  const files = [];
  let totalBytes = 0;

  await walkPlainFiles(petDir, async ({ relativePath, stat }) => {
    files.push(relativePath);
    totalBytes += stat.size;
  });

  const issues = [];
  for (const filePath of files) {
    if (allowedFiles.has(filePath)) continue;
    issues.push(issue({
      severity: "error",
      code: "unexpected_pet_file",
      folderName,
      filePath,
      message: `Pet folder contains unexpected file ${filePath}.`,
    }));
  }

  if (files.length > maxPetFileCount) {
    issues.push(issue({
      severity: "error",
      code: "too_many_pet_files",
      folderName,
      fileCount: files.length,
      message: `Pet folder contains ${files.length} files; only pet.json and the spritesheet are expected.`,
    }));
  }
  if (totalBytes > maxPetBytes) {
    issues.push(issue({
      severity: "error",
      code: "pet_bundle_too_large",
      folderName,
      byteCount: totalBytes,
      message: "Pet folder is too large for the MVP resource allowlist.",
    }));
  }

  return issues;
}

async function walkPlainFiles(rootDir, visitor, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(currentDir, entry.name);
    const stat = await lstat(filePath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      await walkPlainFiles(rootDir, visitor, filePath);
      continue;
    }
    if (!stat.isFile()) continue;
    await visitor({
      relativePath: normalizePath(path.relative(rootDir, filePath)),
      stat,
    });
  }
}

async function readManifest(manifestPath) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing" };
    return { status: "invalid_json" };
  }

  try {
    return { status: "ok", manifest: JSON.parse(raw) };
  } catch {
    return { status: "invalid_json" };
  }
}

function validateManifestFields(manifest) {
  const missingFields = [];
  const values = {};

  for (const field of requiredManifestFields) {
    if (typeof manifest?.[field] === "string" && manifest[field].trim()) {
      values[field] = manifest[field].trim();
    } else {
      missingFields.push(field);
    }
  }

  return {
    missingFields,
    id: values.id,
    spritesheetPath: values.spritesheetPath,
  };
}

function resolveSafeSpritesheetPath(petDir, spritesheetPath) {
  if (spritesheetPath.includes("\0")) return { ok: false, reason: "unsafe" };
  if (
    path.isAbsolute(spritesheetPath) ||
    path.posix.isAbsolute(spritesheetPath) ||
    path.win32.isAbsolute(spritesheetPath)
  ) {
    return { ok: false, reason: "absolute" };
  }

  const parts = spritesheetPath.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === ".")) {
    return { ok: false, reason: "unsafe" };
  }
  if (parts.some((part) => part === "..")) {
    return { ok: false, reason: "traversal" };
  }

  const resolvedPetDir = path.resolve(petDir);
  const filePath = path.resolve(resolvedPetDir, ...parts);
  if (!isPathInside(filePath, resolvedPetDir)) {
    return { ok: false, reason: "traversal" };
  }

  return {
    ok: true,
    filePath,
    normalizedPath: parts.join("/"),
  };
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

async function isPlainFile(filePath) {
  try {
    const stat = await lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function hasCopySuffix(folderName) {
  return (
    /_副本(?:$|[-_\s(（])/.test(folderName) ||
    /(?:^|[-_\s])副本(?:$|[-_\s)）])/.test(folderName) ||
    /(?:^|[-_\s])copy(?:$|[-_\s]?\d+$|\s+\d+$)/i.test(folderName) ||
    /\(\d+\)$/.test(folderName)
  );
}

function issue(value) {
  return value;
}

function messageForUnsafePath(reason) {
  if (reason === "absolute") return "an absolute path";
  if (reason === "traversal") return "a path traversal outside the pet folder";
  return "not a safe relative path";
}

function formatIssue(item) {
  const prefix = `[${item.severity.toUpperCase()}]`;
  const location = item.folderName ? `${item.folderName}: ` : "";
  const suffix = item.code ? ` (${item.code})` : "";
  return `${prefix} ${location}${item.message}${suffix}`;
}

function formatCount(value, singular) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
