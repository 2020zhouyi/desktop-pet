import { petStates } from "./behavior/petStateMachine";
import type {
  DesktopPetApi,
  PetState,
  PetStatus,
} from "./types";

export const localPreviewStatus: PetStatus = {
  selectedPet: null,
  state: "idle",
  pets: [],
  mascotWidthPx: 120,
};

let localStatus: PetStatus = localPreviewStatus;
let stateResetTimer: ReturnType<typeof setTimeout> | null = null;
const localStatusListeners = new Set<(status: PetStatus) => void>();

function notifyLocalStatus() {
  localStatusListeners.forEach((listener) => listener(localStatus));
}

export const localPreviewApi: DesktopPetApi = {
  async getStatus() {
    return localStatus;
  },
  async listPets() {
    return localStatus.pets;
  },
  async getPetPreview(id) {
    return localStatus.pets.find((pet) => pet.id === id)?.spritesheetUrl ?? null;
  },
  async selectPet(id) {
    const selectedPet = localStatus.pets.find((pet) => pet.id === id) ?? null;
    if (!selectedPet) return null;

    localStatus = { ...localStatus, selectedPet };
    notifyLocalStatus();
    return selectedPet;
  },
  async openPetLibrary() {
    return "";
  },
  async setState(state: PetState, durationMs = 1800) {
    if (!petStates.includes(state)) {
      throw new Error(`Unsupported pet state: ${String(state)}`);
    }
    if (stateResetTimer !== null) {
      clearTimeout(stateResetTimer);
      stateResetTimer = null;
    }

    localStatus = { ...localStatus, state };
    notifyLocalStatus();
    if (state === "waving" || state === "jumping") {
      const resetAfterMs = normalizeStateDuration(durationMs);
      stateResetTimer = setTimeout(() => {
        localStatus = { ...localStatus, state: "idle" };
        stateResetTimer = null;
        notifyLocalStatus();
      }, resetAfterMs);
    }
    return state;
  },
  startWindowDrag: async () => undefined,
  moveWindowDrag: async () => undefined,
  stopWindowDrag: async () => undefined,
  async resizeMascot(widthPx) {
    return Math.min(228, Math.max(84, Math.round(Number(widthPx) / 12) * 12));
  },
  setVisualInsets: async () => undefined,
  setPointerPassthrough: async () => undefined,
  closeControlWindow: async () => undefined,
  showContextMenu: async () => undefined,
  close: async () => undefined,
  onStatusChanged(callback) {
    callback(localStatus);
    localStatusListeners.add(callback);
    return () => localStatusListeners.delete(callback);
  },
};

function normalizeStateDuration(value: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1800;
  return Math.min(Math.max(Math.round(number), 0), 30_000);
}

export const desktopPetApi: DesktopPetApi = window.desktopPet ?? localPreviewApi;
