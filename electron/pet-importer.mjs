import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizePetManifest,
  publicManifestMetadata,
} from "./pet-manifest.mjs";
import { withImportedPetMarker } from "./pet-management.mjs";

export const commonSpritesheetNames = [
  "spritesheet.webp",
  "spritesheet.png",
  "spritesheet.svg",
];

export function defaultCodexPetsRoot() {
  return path.join(os.homedir(), ".codex", "pets");
}

export async function listCodexPetCandidates({
  sourceRoot = defaultCodexPetsRoot(),
  targetRoot,
} = {}) {
  if (!targetRoot) throw new Error("targetRoot is required");

  const entries = await readdir(sourceRoot, { withFileTypes: true }).catch(() => []);
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const sourceDir = path.join(sourceRoot, entry.name);
    candidates.push(publicCandidate(
      await candidateForSource({ sourceDir, folderName: entry.name, targetRoot }),
    ));
  }

  return candidates.sort((left, right) => {
    const statusDelta = candidateStatusScore(left.status) - candidateStatusScore(right.status);
    if (statusDelta !== 0) return statusDelta;
    return left.displayName.localeCompare(right.displayName, "zh-Hans-CN");
  });
}

export async function importCodexPet({
  folderName,
  sourceRoot = defaultCodexPetsRoot(),
  targetRoot,
} = {}) {
  if (!targetRoot) throw new Error("targetRoot is required");
  const safeFolderName = sanitizeFolderName(folderName);
  if (!safeFolderName) {
    return failure("invalid", "请选择一个有效的 Codex 宠物目录。", "invalid_folder");
  }

  const resolvedSourceRoot = path.resolve(sourceRoot);
  const sourceDir = path.resolve(resolvedSourceRoot, safeFolderName);
  if (!isPathInside(sourceDir, resolvedSourceRoot)) {
    return failure("invalid", "宠物目录路径不安全，已取消导入。", "invalid_folder");
  }

  const resolvedTargetRoot = path.resolve(targetRoot);
  const targetDir = path.resolve(resolvedTargetRoot, safeFolderName);
  if (!isPathInside(targetDir, resolvedTargetRoot)) {
    return failure("invalid", "目标目录路径不安全，已取消导入。", "invalid_folder");
  }

  const candidate = await candidateForSource({
    sourceDir,
    folderName: safeFolderName,
    targetRoot,
  });
  if (candidate.status === "installed") {
    const reason = candidate.reason ?? "target_exists";
    return {
      ok: false,
      status: "conflict",
      folderName: safeFolderName,
      targetFolder: candidate.targetFolder ?? safeFolderName,
      message: messageForReason(reason),
      reason,
    };
  }
  if (candidate.status !== "importable") {
    return failure(
      "invalid",
      messageForReason(candidate.reason),
      candidate.reason ?? "invalid_pet",
      safeFolderName,
    );
  }

  const stagingDir = path.resolve(
    resolvedTargetRoot,
    `.importing-${safeFolderName}-${process.pid}-${Date.now()}`,
  );

  try {
    await mkdir(resolvedTargetRoot, { recursive: true });
    await copyDirectoryFiles(sourceDir, stagingDir);
    await writeFile(
      path.join(stagingDir, "pet.json"),
      `${JSON.stringify({
        ...withImportedPetMarker(candidate.manifest, { sourceFolderName: safeFolderName }),
        spritesheetPath: candidate.spritesheetPath,
      }, null, 2)}\n`,
      "utf8",
    );
    await rename(stagingDir, targetDir);
    return {
      ok: true,
      status: "imported",
      folderName: safeFolderName,
      targetFolder: safeFolderName,
      petId: `project:${safeFolderName}`,
      message: `已导入 ${candidate.displayName}。`,
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      ok: false,
      status: "error",
      folderName: safeFolderName,
      message: error instanceof Error ? error.message : String(error),
      reason: "copy_failed",
    };
  }
}

async function candidateForSource({ sourceDir, folderName, targetRoot }) {
  const targetDir = path.join(targetRoot, folderName);
  const manifestPath = path.join(sourceDir, "pet.json");
  const targetExists = await exists(targetDir);
  const baseCandidate = {
    folderName,
    id: folderName,
    displayName: folderName,
    sourcePath: sourceDir,
    targetFolder: folderName,
  };

  if (!(await isPlainDirectory(sourceDir))) {
    return invalidCandidate(baseCandidate, "missing_source");
  }

  let manifest;
  try {
    const manifestResult = normalizePetManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    if (!manifestResult.ok) {
      return invalidCandidate(baseCandidate, "invalid_manifest");
    }
    manifest = manifestResult.manifest;
  } catch {
    return invalidCandidate(baseCandidate, "missing_manifest");
  }

  const spritesheetPath = await resolveSpritesheetPath(sourceDir, manifest);
  const existingManifestFolder = targetExists
    ? folderName
    : await findTargetFolderByManifestId(targetRoot, manifest.id);
  const candidate = {
    ...baseCandidate,
    id: manifest.id,
    displayName: manifest.displayName,
    description: typeof manifest.description === "string" ? manifest.description : undefined,
    ...publicManifestMetadata(manifest),
    manifest,
    spritesheetPath,
  };

  if (!spritesheetPath) return invalidCandidate(candidate, "spritesheet_missing");
  if (targetExists) {
    const { manifest: _manifest, ...publicCandidate } = candidate;
    return {
      ...publicCandidate,
      status: "installed",
      reason: "target_exists",
      message: messageForReason("target_exists"),
    };
  }
  if (existingManifestFolder) {
    const { manifest: _manifest, ...publicCandidate } = candidate;
    return {
      ...publicCandidate,
      status: "installed",
      reason: "manifest_exists",
      message: messageForReason("manifest_exists"),
      targetFolder: existingManifestFolder,
    };
  }

  const { manifest: _manifest, ...publicCandidate } = candidate;
  return { ...publicCandidate, status: "importable", manifest };
}

function invalidCandidate(candidate, reason) {
  const publicValue = publicCandidate(candidate);
  return {
    ...publicValue,
    status: "invalid",
    reason,
    message: messageForReason(reason),
  };
}

function publicCandidate(candidate) {
  const { manifest: _manifest, ...publicValue } = candidate;
  return publicValue;
}

async function resolveSpritesheetPath(sourceDir, manifest) {
  const manifestPath = typeof manifest.spritesheetPath === "string"
    ? manifest.spritesheetPath
    : "";
  if (manifestPath && isSafeRelativePath(manifestPath)) {
    const filePath = path.resolve(sourceDir, manifestPath);
    if (isPathInside(filePath, path.resolve(sourceDir)) && await isPlainFile(filePath)) {
      return normalizeRelativePath(path.relative(sourceDir, filePath));
    }
  }

  for (const fileName of commonSpritesheetNames) {
    const filePath = path.join(sourceDir, fileName);
    if (await isPlainFile(filePath)) return fileName;
  }

  return null;
}

async function copyDirectoryFiles(sourceDir, targetDir) {
  if (await exists(targetDir)) throw new Error("target_exists");
  await mkdir(targetDir, { recursive: false });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "." || entry.name === "..") continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      await copyDirectoryFiles(sourcePath, targetPath);
    } else if (stat.isFile()) {
      await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
    }
  }
}

async function findTargetFolderByManifestId(targetRoot, manifestId) {
  const entries = await readdir(targetRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    try {
      const manifest = JSON.parse(
        await readFile(path.join(targetRoot, entry.name, "pet.json"), "utf8"),
      );
      if (manifest?.id === manifestId) return entry.name;
    } catch {
      // Broken local pet folders are ignored here; loadPets already skips them too.
    }
  }
  return null;
}

function sanitizeFolderName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return trimmed;
}

function isSafeRelativePath(value) {
  if (!value || path.isAbsolute(value)) return false;
  return !value.split(/[\\/]/).some((part) => part === ".." || part === "");
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isPlainDirectory(filePath) {
  try {
    const stat = await lstat(filePath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isPlainFile(filePath) {
  try {
    const stat = await lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function candidateStatusScore(status) {
  if (status === "importable") return 0;
  if (status === "installed") return 1;
  return 2;
}

function messageForReason(reason) {
  if (reason === "missing_manifest") return "缺少 pet.json，不能导入。";
  if (reason === "invalid_manifest") return "pet.json 缺少必要字段。";
  if (reason === "spritesheet_missing") return "找不到 manifest 指向的 spritesheet，也没有常见 spritesheet 文件。";
  if (reason === "missing_source") return "找不到这个 Codex 宠物目录。";
  if (reason === "invalid_folder") return "宠物目录名无效。";
  if (reason === "target_exists") return "本地已经有同名宠物，未覆盖现有文件。";
  if (reason === "manifest_exists") return "本地已经有相同 ID 的宠物，未重复导入。";
  return "这个 Codex 宠物暂时不能导入。";
}

function failure(status, message, reason, folderName) {
  return {
    ok: false,
    status,
    folderName,
    message,
    reason,
  };
}
