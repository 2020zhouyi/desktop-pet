import { lstat, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const importedOrigin = "codex-import";

export function withImportedPetMarker(manifest, { sourceFolderName, importedAt = new Date() } = {}) {
  return {
    ...manifest,
    desktopPetMvp: {
      ...(isPlainObject(manifest?.desktopPetMvp) ? manifest.desktopPetMvp : {}),
      imported: true,
      origin: importedOrigin,
      sourceFolderName,
      importedAt: importedAt.toISOString(),
    },
  };
}

export function isImportedPetManifest(manifest) {
  return (
    isPlainObject(manifest?.desktopPetMvp) &&
    manifest.desktopPetMvp.imported === true &&
    manifest.desktopPetMvp.origin === importedOrigin
  );
}

export async function listLocalPetManagement({ targetRoot } = {}) {
  if (!targetRoot) throw new Error("targetRoot is required");
  const entries = await readdir(targetRoot, { withFileTypes: true }).catch(() => []);
  const pets = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const folderPath = path.join(targetRoot, entry.name);
    const manifest = await readPetManifest(folderPath);
    const isImported = isImportedPetManifest(manifest);
    pets.push({
      folderName: entry.name,
      petId: `project:${entry.name}`,
      manifestId: typeof manifest?.id === "string" ? manifest.id : undefined,
      displayName: typeof manifest?.displayName === "string" ? manifest.displayName : entry.name,
      kind: isImported ? "imported" : "builtin",
      canDelete: isImported,
      protectedReason: isImported ? undefined : "builtin",
    });
  }

  return pets.sort((left, right) => {
    const kindDelta = petKindScore(left.kind) - petKindScore(right.kind);
    if (kindDelta !== 0) return kindDelta;
    return left.displayName.localeCompare(right.displayName, "zh-Hans-CN");
  });
}

export async function deleteLocalPet({ folderName, targetRoot } = {}) {
  if (!targetRoot) throw new Error("targetRoot is required");
  const safeFolderName = sanitizeFolderName(folderName);
  if (!safeFolderName) {
    return failure("invalid", "请选择一个有效的本地宠物目录。", "invalid_folder");
  }

  const resolvedTargetRoot = path.resolve(targetRoot);
  const petDir = path.resolve(resolvedTargetRoot, safeFolderName);
  if (!isPathStrictlyInside(petDir, resolvedTargetRoot)) {
    return failure("invalid", "宠物目录路径不安全，已取消删除。", "unsafe_path", safeFolderName);
  }

  if (!(await isPlainDirectory(petDir))) {
    return failure("missing", "找不到这个本地宠物。", "missing_pet", safeFolderName);
  }

  const manifest = await readPetManifest(petDir);
  if (!isImportedPetManifest(manifest)) {
    return failure("protected", "内置宠物受保护，不能在这里删除。", "protected_builtin", safeFolderName);
  }

  try {
    await rm(petDir, { recursive: true, force: false });
    return {
      ok: true,
      status: "deleted",
      folderName: safeFolderName,
      petId: `project:${safeFolderName}`,
      message: "已删除本地导入宠物。",
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      folderName: safeFolderName,
      message: error instanceof Error ? error.message : String(error),
      reason: "delete_failed",
    };
  }
}

async function readPetManifest(folderPath) {
  try {
    return JSON.parse(await readFile(path.join(folderPath, "pet.json"), "utf8"));
  } catch {
    return null;
  }
}

function sanitizeFolderName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return trimmed;
}

function isPathStrictlyInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function isPlainDirectory(filePath) {
  try {
    const stat = await lstat(filePath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function petKindScore(kind) {
  if (kind === "builtin") return 0;
  return 1;
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
