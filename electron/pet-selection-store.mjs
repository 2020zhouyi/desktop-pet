import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Keep the legacy filename so an existing selected pet survives this simplification.
export const petSelectionFileName = "desktop-pet-settings.json";

export function selectionPathForUserData(userDataPath) {
  return path.join(userDataPath, petSelectionFileName);
}

export function createPetSelectionStore(filePath) {
  let pendingWrite = Promise.resolve();

  return {
    read: () => pendingWrite.then(async () => (await readPetPreferences(filePath)).selectedPetId),
    readMascotWidth: () => pendingWrite.then(async () => (
      await readPetPreferences(filePath)
    ).mascotWidthPx),
    readLaunchAtLogin: () => pendingWrite.then(async () => (
      await readPetPreferences(filePath)
    ).launchAtLogin),
    write: (selectedPetId) => {
      const result = pendingWrite.then(() => updateSelectedPetId(filePath, selectedPetId));
      pendingWrite = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    writeMascotWidth: (mascotWidthPx) => {
      const result = pendingWrite.then(() => updateMascotWidth(filePath, mascotWidthPx));
      pendingWrite = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    writeLaunchAtLogin: (launchAtLogin) => {
      const result = pendingWrite.then(() => updateLaunchAtLogin(filePath, launchAtLogin));
      pendingWrite = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

async function readPetPreferences(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return {
      selectedPetId: normalizeSelectedPetId(value?.selectedPetId),
      mascotWidthPx: normalizeMascotWidth(value?.mascotWidthPx),
      launchAtLogin: value?.launchAtLogin === true,
    };
  } catch {
    return { selectedPetId: null, mascotWidthPx: null, launchAtLogin: false };
  }
}

async function updateSelectedPetId(filePath, value) {
  const current = await readPetPreferences(filePath);
  const selectedPetId = value === null ? null : normalizeSelectedPetId(value);
  if (value !== null && selectedPetId === null) return current.selectedPetId;

  await writePetPreferences(filePath, { ...current, selectedPetId });
  return selectedPetId;
}

async function updateMascotWidth(filePath, value) {
  const current = await readPetPreferences(filePath);
  const mascotWidthPx = normalizeMascotWidth(value);
  if (mascotWidthPx === null) return current.mascotWidthPx;

  await writePetPreferences(filePath, { ...current, mascotWidthPx });
  return mascotWidthPx;
}

async function updateLaunchAtLogin(filePath, value) {
  const current = await readPetPreferences(filePath);
  const launchAtLogin = value === true;
  await writePetPreferences(filePath, { ...current, launchAtLogin });
  return launchAtLogin;
}

async function writePetPreferences(filePath, preferences) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = {
    selectedPetId: preferences.selectedPetId,
    ...(preferences.mascotWidthPx === null ? {} : { mascotWidthPx: preferences.mascotWidthPx }),
    launchAtLogin: preferences.launchAtLogin === true,
  };
  await writeFile(filePath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
}

function normalizeSelectedPetId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

function normalizeMascotWidth(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 84 && number <= 228
    ? Math.round(number)
    : null;
}
