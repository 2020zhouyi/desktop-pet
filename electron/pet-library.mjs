import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const bundledPetSeedMarker = ".bundled-pets-seeded-v1.json";

export async function seedBundledPetLibrary({ bundledRoot, libraryRoot }) {
  await mkdir(libraryRoot, { recursive: true });
  const markerPath = path.join(libraryRoot, bundledPetSeedMarker);
  if (await pathExists(markerPath)) return { seeded: false, copiedFolders: [] };

  const entries = await readdir(bundledRoot, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const copiedFolders = [];

  for (const folder of folders) {
    const source = path.join(bundledRoot, folder);
    const manifest = await readPetManifest(source);
    const destinationFolder = petFolderName(manifest?.displayName, folder);
    const destination = path.join(libraryRoot, destinationFolder);
    if (await pathExists(destination)) continue;
    await cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    copiedFolders.push(destinationFolder);
  }

  await writeFile(markerPath, `${JSON.stringify({ folders }, null, 2)}\n`, "utf8");
  return { seeded: true, copiedFolders };
}

export async function consumeBundledPetLibrary({ bundledRoot, libraryRoot }) {
  await mkdir(libraryRoot, { recursive: true });
  const markerPath = path.join(libraryRoot, bundledPetSeedMarker);
  if (await pathExists(markerPath)) {
    await removeBestEffort(bundledRoot);
    return { consumed: false, movedFolders: [], preservedFolders: [] };
  }

  const entries = await readdir(bundledRoot, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const movedFolders = [];
  const preservedFolders = [];

  for (const folder of folders) {
    const source = path.join(bundledRoot, folder);
    const manifest = await readPetManifest(source);
    const destinationFolder = petFolderName(manifest?.displayName, folder);
    const destination = path.join(libraryRoot, destinationFolder);
    if (await pathExists(destination)) {
      preservedFolders.push(destinationFolder);
      await removeBestEffort(source);
      continue;
    }

    await moveDirectory(source, destination);
    movedFolders.push(destinationFolder);
  }

  await writeFile(path.join(libraryRoot, bundledPetSeedMarker), `${JSON.stringify({ folders }, null, 2)}\n`, "utf8");
  await removeBestEffort(bundledRoot);
  return { consumed: true, movedFolders, preservedFolders };
}

export async function normalizePetLibraryFolders(libraryRoot) {
  await mkdir(libraryRoot, { recursive: true });
  const entries = await readdir(libraryRoot, { withFileTypes: true });
  const renamed = [];
  const conflicts = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const source = path.join(libraryRoot, entry.name);
    const manifest = await readPetManifest(source);
    if (!manifest) continue;
    const targetName = petFolderName(manifest.displayName, entry.name);
    if (targetName === entry.name) continue;
    const target = path.join(libraryRoot, targetName);
    if (await pathExists(target)) {
      conflicts.push({ folder: entry.name, target: targetName });
      continue;
    }
    await rename(source, target);
    renamed.push({ from: entry.name, to: targetName });
  }

  return { renamed, conflicts };
}

export function petFolderName(displayName, fallback) {
  const friendlyName = typeof displayName === "string"
    ? displayName.replace(/\s+Codex Pet\s+\d+$/i, "").trim()
    : "";
  const sanitized = friendlyName
    .replace(/[\\/:*?"<>|]/g, "－")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || fallback;
}

export function migrateSelectedPetId(selectedPetId) {
  return typeof selectedPetId === "string" && selectedPetId.startsWith("project:")
    ? `user:${selectedPetId.slice("project:".length)}`
    : selectedPetId;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPetManifest(petFolder) {
  try {
    const value = JSON.parse(await readFile(path.join(petFolder, "pet.json"), "utf8"));
    return typeof value?.id === "string" && typeof value?.displayName === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

async function moveDirectory(source, destination) {
  try {
    await rename(source, destination);
  } catch (error) {
    if (!["EXDEV", "EACCES", "EPERM", "EROFS"].includes(error?.code)) throw error;
    await cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await removeBestEffort(source);
  }
}

async function removeBestEffort(target) {
  try {
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (!["EACCES", "EPERM", "EROFS"].includes(error?.code)) throw error;
  }
}
