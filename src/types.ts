export type PetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping";

export type PetManifest = {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  author?: string;
  version?: string;
  tags?: string[];
  faction?: string;
  recommendedScale?: number;
  accentColor?: string;
  behaviorProfile?: string;
  bubbleLines?: Partial<Record<"welcome" | "click" | "drag" | "petSwitch", string[]>>;
};

export type PetOption = PetManifest & {
  folder: string;
  spritesheetUrl?: string;
  source: "app" | "project" | "sample" | "user";
};

export type PetStatus = {
  selectedPet: PetOption | null;
  state: PetState;
  pets: PetOption[];
  mascotWidthPx: number;
};

export type DesktopPetApi = {
  getStatus(): Promise<PetStatus>;
  listPets(): Promise<PetOption[]>;
  getPetPreview(id: string): Promise<string | null>;
  selectPet(id: string): Promise<PetOption | null>;
  openPetLibrary(): Promise<string>;
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(enabled: boolean): Promise<boolean>;
  setState(state: PetState, durationMs?: number): Promise<PetState>;
  startWindowDrag(payload: {
    pointerWindowX: number;
    pointerWindowY: number;
  }): Promise<void>;
  moveWindowDrag(): Promise<void>;
  stopWindowDrag(): Promise<void>;
  resizeMascot(widthPx: number, persist?: boolean): Promise<number>;
  setVisualInsets(insets: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): Promise<void>;
  setPointerPassthrough(enabled: boolean): Promise<void>;
  closeControlWindow(): Promise<void>;
  showContextMenu(): Promise<void>;
  close(): Promise<void>;
  onStatusChanged(callback: (status: PetStatus) => void): () => void;
};

declare global {
  interface Window {
    desktopPet?: DesktopPetApi;
  }
}
