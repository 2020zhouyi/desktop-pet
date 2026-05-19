import type { DesktopPetApi, PetState, PetStatus } from "./types";

const serverBase = "http://127.0.0.1:7777";
const fallbackPet = {
  id: "sample:codexish",
  displayName: "Codexish",
  description: "A simple local sample pet for the MVP renderer.",
  spritesheetPath: "spritesheet.svg",
  folder: "public/pets/codexish",
  source: "sample",
  spritesheetUrl: "/pets/codexish/spritesheet.svg",
} as const;

export const localPreviewStatus: PetStatus = {
  selectedPet: fallbackPet,
  state: "idle",
  pets: [fallbackPet],
};

let fallbackStatus: PetStatus = localPreviewStatus;
const fallbackListeners = new Set<(status: PetStatus) => void>();

function hasHttpTransport(): boolean {
  return "fetch" in window || "XMLHttpRequest" in window;
}

function notifyFallback() {
  fallbackListeners.forEach((listener) => listener(fallbackStatus));
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
  async listPets() {
    if (!hasHttpTransport()) return fallbackStatus.pets;
    try {
      const body = await requestJson<Pick<PetStatus, "pets">>("/pets?assets=1");
      return body.pets;
    } catch {
      return fallbackStatus.pets;
    }
  },
  async getPetPreview(id) {
    if (!hasHttpTransport()) return id === fallbackPet.id ? fallbackPet.spritesheetUrl : null;
    try {
      const body = await requestJson<{ previewUrl: string | null }>(
        `/pet/preview?id=${encodeURIComponent(id)}`,
      );
      return body.previewUrl;
    } catch {
      return id === fallbackPet.id ? fallbackPet.spritesheetUrl : null;
    }
  },
  async selectPet(id) {
    if (!hasHttpTransport()) return id === fallbackPet.id ? fallbackPet : null;
    try {
      const body = await requestJson<{ pet: PetStatus["selectedPet"] }>("/pet/select?assets=1", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      return body.pet;
    } catch {
      return id === fallbackPet.id ? fallbackPet : null;
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
};

export const desktopPetApi: DesktopPetApi = window.desktopPet ?? browserApi;
