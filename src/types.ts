export type PetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type PetManifest = {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
};

export type PetOption = PetManifest & {
  folder: string;
  spritesheetUrl?: string;
  source: "app" | "codex" | "sample";
};

export type PetStatus = {
  selectedPet: PetOption | null;
  state: PetState;
  pets: PetOption[];
};

export type DesktopPetApi = {
  getStatus(): Promise<PetStatus>;
  listPets(): Promise<PetOption[]>;
  getPetPreview(id: string): Promise<string | null>;
  selectPet(id: string): Promise<PetOption | null>;
  setState(state: PetState, durationMs?: number): Promise<PetState>;
  startWindowDrag(payload: {
    pointerWindowX: number;
    pointerWindowY: number;
  }): Promise<void>;
  stopWindowDrag(): Promise<void>;
  resizeMascot(widthPx: number): Promise<void>;
  setVisualInsets(insets: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): Promise<void>;
  setPointerPassthrough(enabled: boolean): Promise<void>;
  setPickerOpen(enabled: boolean): Promise<void>;
  showContextMenu(): Promise<void>;
  close(): Promise<void>;
  onStatusChanged(callback: (status: PetStatus) => void): () => void;
  onOpenPetPicker(callback: () => void): () => void;
};

declare global {
  interface Window {
    desktopPet?: DesktopPetApi;
  }
}
