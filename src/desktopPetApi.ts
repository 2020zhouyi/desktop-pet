import { defaultInteractionMode, isInteractionMode } from "./behavior/lifestyle";
import type {
  CodexPetImportResult,
  DesktopPetApi,
  DesktopPetSettings,
  LocalPetDeleteResult,
  PetState,
  PetStatus,
} from "./types";

const serverBase = "http://127.0.0.1:7777";
const settingsStorageKey = "desktop-pet-mvp:settings";
const mascotWidthSettings = {
  min: 84,
  max: 228,
  step: 12,
};
const opacitySettings = {
  min: 0.35,
  max: 1,
};
export const localPreviewStatus: PetStatus = {
  selectedPet: null,
  state: "idle",
  pets: [],
};

let fallbackStatus: PetStatus = localPreviewStatus;
let fallbackSettings: DesktopPetSettings = readStoredSettings();
const fallbackListeners = new Set<(status: PetStatus) => void>();

function hasHttpTransport(): boolean {
  return "fetch" in window || "XMLHttpRequest" in window;
}

function notifyFallback() {
  fallbackListeners.forEach((listener) => listener(fallbackStatus));
}

function defaultSettings(): DesktopPetSettings {
  return {
    interactionMode: defaultInteractionMode,
    mascotWidthPx: 120,
    opacity: 1,
    alwaysOnTopEnabled: true,
    launchAtLoginEnabled: false,
    speechBubblesEnabled: true,
    proactiveEventsEnabled: true,
  };
}

function normalizeSettings(value: unknown): DesktopPetSettings {
  if (!value || typeof value !== "object") return defaultSettings();
  const interactionMode = (value as { interactionMode?: unknown }).interactionMode;
  const mascotWidthPx = normalizeMascotWidth(
    (value as { mascotWidthPx?: unknown }).mascotWidthPx,
  );
  const opacity = normalizeOpacity((value as { opacity?: unknown }).opacity);
  const alwaysOnTopEnabled = (
    value as { alwaysOnTopEnabled?: unknown }
  ).alwaysOnTopEnabled;
  const launchAtLoginEnabled = (
    value as { launchAtLoginEnabled?: unknown }
  ).launchAtLoginEnabled;
  const speechBubblesEnabled = (value as { speechBubblesEnabled?: unknown }).speechBubblesEnabled;
  const proactiveEventsEnabled = (
    value as { proactiveEventsEnabled?: unknown }
  ).proactiveEventsEnabled;
  return {
    interactionMode: isInteractionMode(interactionMode)
      ? interactionMode
      : defaultInteractionMode,
    mascotWidthPx: mascotWidthPx ?? defaultSettings().mascotWidthPx,
    opacity: opacity ?? defaultSettings().opacity,
    alwaysOnTopEnabled: typeof alwaysOnTopEnabled === "boolean"
      ? alwaysOnTopEnabled
      : defaultSettings().alwaysOnTopEnabled,
    launchAtLoginEnabled: typeof launchAtLoginEnabled === "boolean"
      ? launchAtLoginEnabled
      : defaultSettings().launchAtLoginEnabled,
    speechBubblesEnabled: typeof speechBubblesEnabled === "boolean"
      ? speechBubblesEnabled
      : true,
    proactiveEventsEnabled: typeof proactiveEventsEnabled === "boolean"
      ? proactiveEventsEnabled
      : true,
  };
}

function readStoredSettings(): DesktopPetSettings {
  if (!("localStorage" in window)) return defaultSettings();
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return raw ? normalizeSettings(JSON.parse(raw)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

function writeStoredSettings(settings: DesktopPetSettings) {
  fallbackSettings = settings;
  if (!("localStorage" in window)) return;
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Browser preview storage is best-effort; the in-memory fallback still reflects this session.
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if ("fetch" in window) {
    const response = await fetch(`${serverBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Pet API failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  return requestJsonWithXhr<T>(path, init);
}

function requestJsonWithXhr<T>(path: string, init?: RequestInit): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(init?.method ?? "GET", `${serverBase}${path}`);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Pet API failed: ${request.status}`));
        return;
      }
      resolve(JSON.parse(request.responseText) as T);
    };
    request.onerror = () => reject(new Error("Pet API request failed"));
    request.send(typeof init?.body === "string" ? init.body : null);
  });
}

const browserApi: DesktopPetApi = {
  async getStatus() {
    if (!hasHttpTransport()) return fallbackStatus;
    try {
      return await requestJson<PetStatus>("/status?assets=1");
    } catch {
      return fallbackStatus;
    }
  },
  async getSettings() {
    if (hasHttpTransport()) {
      try {
        const settings = normalizeSettings(await requestJson<DesktopPetSettings>("/settings"));
        writeStoredSettings(settings);
        return settings;
      } catch {
        // Standalone browser previews can still use localStorage when Electron is absent.
      }
    }
    fallbackSettings = readStoredSettings();
    return fallbackSettings;
  },
  async updateSettings(patch) {
    if (hasHttpTransport()) {
      try {
        const settings = normalizeSettings(await requestJson<DesktopPetSettings>("/settings", {
          method: "POST",
          body: JSON.stringify(patch ?? {}),
        }));
        writeStoredSettings(settings);
        return settings;
      } catch {
        // Browser preview storage is the fallback when the local Electron API is unavailable.
      }
    }

    const current = readStoredSettings();
    const next = normalizeSettingsPatch(current, patch);
    if (next === current) return current;

    writeStoredSettings(next);
    return next;
  },
  async listPets() {
    if (!hasHttpTransport()) return fallbackStatus.pets;
    try {
      const body = await requestJson<Pick<PetStatus, "pets">>("/pets?assets=1");
      return Array.isArray(body.pets) ? body.pets : fallbackStatus.pets;
    } catch {
      return fallbackStatus.pets;
    }
  },
  async listCodexPetImports() {
    if (!hasHttpTransport()) return [];
    try {
      const body = await requestJson<{
        candidates: Awaited<ReturnType<DesktopPetApi["listCodexPetImports"]>>;
      }>("/codex-pets/imports");
      return Array.isArray(body.candidates) ? body.candidates : [];
    } catch {
      return [];
    }
  },
  async importCodexPet(folderName) {
    if (!hasHttpTransport()) return unavailableImportResult(folderName);
    try {
      return await requestJson<CodexPetImportResult>("/codex-pets/import", {
        method: "POST",
        body: JSON.stringify({ folderName }),
      });
    } catch {
      return unavailableImportResult(folderName);
    }
  },
  async listLocalPetManagement() {
    if (!hasHttpTransport()) return [];
    try {
      const body = await requestJson<{
        pets: Awaited<ReturnType<DesktopPetApi["listLocalPetManagement"]>>;
      }>("/pets/local-management");
      return Array.isArray(body.pets) ? body.pets : [];
    } catch {
      return [];
    }
  },
  async deleteLocalPet(folderName) {
    if (!hasHttpTransport()) return unavailableDeleteResult(folderName);
    try {
      return await requestJson<LocalPetDeleteResult>("/pets/delete-local", {
        method: "POST",
        body: JSON.stringify({ folderName }),
      });
    } catch {
      return unavailableDeleteResult(folderName);
    }
  },
  async getPetPreview(id) {
    if (!hasHttpTransport()) return null;
    try {
      const body = await requestJson<{ previewUrl: string | null }>(
        `/pet/preview?id=${encodeURIComponent(id)}`,
      );
      return body.previewUrl;
    } catch {
      return null;
    }
  },
  async selectPet(id) {
    if (!hasHttpTransport()) return null;
    try {
      const body = await requestJson<{ pet: PetStatus["selectedPet"] }>("/pet/select?assets=1", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      return body.pet;
    } catch {
      return null;
    }
  },
  async setState(state: PetState, durationMs = 1800) {
    if (!hasHttpTransport()) {
      fallbackStatus = { ...fallbackStatus, state };
      notifyFallback();
      if (state !== "idle" && durationMs > 0) {
        window.setTimeout(() => {
          fallbackStatus = { ...fallbackStatus, state: "idle" };
          notifyFallback();
        }, durationMs);
      }
      return state;
    }

    try {
      const body = await requestJson<{ state: PetState }>("/state", {
        method: "POST",
        body: JSON.stringify({ state, durationMs }),
      });
      return body.state;
    } catch {
      fallbackStatus = { ...fallbackStatus, state };
      notifyFallback();
      return state;
    }
  },
  startWindowDrag: async () => undefined,
  stopWindowDrag: async () => undefined,
  resizeMascot: async () => undefined,
  setVisualInsets: async () => undefined,
  setPointerPassthrough: async () => undefined,
  setPickerOpen: async () => undefined,
  showContextMenu: async () => undefined,
  close: async () => undefined,
  onStatusChanged(callback) {
    if (!hasHttpTransport()) {
      callback(fallbackStatus);
      fallbackListeners.add(callback);
      return () => fallbackListeners.delete(callback);
    }

    let lastPayload = "";
    let disposed = false;

    const poll = async () => {
      try {
        const status = await browserApi.getStatus();
        const payload = JSON.stringify({
          selectedPetId: status.selectedPet?.id,
          state: status.state,
          pets: status.pets.map((pet) => pet.id),
        });
        if (!disposed && payload !== lastPayload) {
          lastPayload = payload;
          callback(status);
        }
      } catch {
        // The standalone browser preview is optional; Electron IPC remains the primary path.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  },
  onOpenPetPicker() {
    return () => undefined;
  },
  onOpenPetSettings() {
    return () => undefined;
  },
};

function normalizeSettingsPatch(
  current: DesktopPetSettings,
  patch: Partial<DesktopPetSettings> | null | undefined,
): DesktopPetSettings {
  if (!patch || typeof patch !== "object") return current;
  const next = { ...current };
  let changed = false;

  if (hasOwn(patch, "interactionMode") && isInteractionMode(patch.interactionMode)) {
    next.interactionMode = patch.interactionMode;
    changed = changed || next.interactionMode !== current.interactionMode;
  }

  if (hasOwn(patch, "mascotWidthPx")) {
    const mascotWidthPx = normalizeMascotWidth(patch.mascotWidthPx);
    if (mascotWidthPx !== null) {
      next.mascotWidthPx = mascotWidthPx;
      changed = changed || next.mascotWidthPx !== current.mascotWidthPx;
    }
  }

  if (hasOwn(patch, "opacity")) {
    const opacity = normalizeOpacity(patch.opacity);
    if (opacity !== null) {
      next.opacity = opacity;
      changed = changed || next.opacity !== current.opacity;
    }
  }

  if (hasOwn(patch, "alwaysOnTopEnabled") && typeof patch.alwaysOnTopEnabled === "boolean") {
    next.alwaysOnTopEnabled = patch.alwaysOnTopEnabled;
    changed = changed || next.alwaysOnTopEnabled !== current.alwaysOnTopEnabled;
  }

  if (hasOwn(patch, "launchAtLoginEnabled") && typeof patch.launchAtLoginEnabled === "boolean") {
    next.launchAtLoginEnabled = patch.launchAtLoginEnabled;
    changed = changed || next.launchAtLoginEnabled !== current.launchAtLoginEnabled;
  }

  if (hasOwn(patch, "speechBubblesEnabled") && typeof patch.speechBubblesEnabled === "boolean") {
    next.speechBubblesEnabled = patch.speechBubblesEnabled;
    changed = changed || next.speechBubblesEnabled !== current.speechBubblesEnabled;
  }

  if (
    hasOwn(patch, "proactiveEventsEnabled") &&
    typeof patch.proactiveEventsEnabled === "boolean"
  ) {
    next.proactiveEventsEnabled = patch.proactiveEventsEnabled;
    changed = changed || next.proactiveEventsEnabled !== current.proactiveEventsEnabled;
  }

  return changed ? next : current;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeMascotWidth(value: unknown): number | null {
  const number = Number(value);
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(number) ||
    number < mascotWidthSettings.min ||
    number > mascotWidthSettings.max
  ) {
    return null;
  }
  return clamp(
    Math.round(number / mascotWidthSettings.step) * mascotWidthSettings.step,
    mascotWidthSettings.min,
    mascotWidthSettings.max,
  );
}

function normalizeOpacity(value: unknown): number | null {
  const number = Number(value);
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(number) ||
    number < opacitySettings.min ||
    number > opacitySettings.max
  ) {
    return null;
  }
  return Math.round(number * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function unavailableImportResult(folderName: string): CodexPetImportResult {
  return {
    ok: false,
    status: "error",
    folderName,
    message: "当前运行环境不能访问本机 Codex 宠物目录。",
    reason: "unavailable",
  };
}

function unavailableDeleteResult(folderName: string): LocalPetDeleteResult {
  return {
    ok: false,
    status: "error",
    folderName,
    message: "当前运行环境不能管理本机项目宠物目录。",
    reason: "unavailable",
  };
}

export const desktopPetApi: DesktopPetApi = window.desktopPet ?? browserApi;
