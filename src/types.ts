import type { InteractionMode } from "./behavior/lifestyle";

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
  author?: string;
  version?: string;
  tags?: string[];
  faction?: string;
  recommendedScale?: number;
  accentColor?: string;
  behaviorProfile?: string;
};

export type PetOption = PetManifest & {
  folder: string;
  spritesheetUrl?: string;
  source: "app" | "codex" | "project" | "sample";
  localKind?: "builtin" | "imported";
};

export type PetStatus = {
  selectedPet: PetOption | null;
  state: PetState;
  pets: PetOption[];
};

export type CodexPetImportCandidateStatus = "importable" | "installed" | "invalid";

export type CodexPetImportCandidate = {
  folderName: string;
  id: string;
  displayName: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string[];
  faction?: string;
  recommendedScale?: number;
  accentColor?: string;
  behaviorProfile?: string;
  sourcePath?: string;
  targetFolder: string;
  spritesheetPath?: string | null;
  status: CodexPetImportCandidateStatus;
  reason?: string;
  message?: string;
};

export type CodexPetImportResult = {
  ok: boolean;
  status: "imported" | "conflict" | "invalid" | "error";
  folderName?: string;
  targetFolder?: string;
  petId?: string;
  message: string;
  reason?: string;
  selectedPet?: PetOption | null;
  statusSnapshot?: PetStatus;
  management?: LocalPetManagementItem[];
};

export type LocalPetManagementItem = {
  folderName: string;
  petId: string;
  manifestId?: string;
  displayName: string;
  kind: "builtin" | "imported";
  canDelete: boolean;
  protectedReason?: "builtin";
};

export type LocalPetDeleteResult = {
  ok: boolean;
  status: "deleted" | "protected" | "invalid" | "missing" | "error";
  folderName?: string;
  petId?: string;
  message: string;
  reason?: string;
  selectedPet?: PetOption | null;
  statusSnapshot?: PetStatus;
  management?: LocalPetManagementItem[];
};

export type DesktopPetSettings = {
  interactionMode: InteractionMode;
  mascotWidthPx: number;
  opacity: number;
  alwaysOnTopEnabled: boolean;
  launchAtLoginEnabled: boolean;
  speechBubblesEnabled: boolean;
  proactiveEventsEnabled: boolean;
};

export type DesktopPetApi = {
  getStatus(): Promise<PetStatus>;
  getSettings(): Promise<DesktopPetSettings>;
  updateSettings(patch: Partial<DesktopPetSettings>): Promise<DesktopPetSettings>;
  listPets(): Promise<PetOption[]>;
  listCodexPetImports(): Promise<CodexPetImportCandidate[]>;
  importCodexPet(folderName: string): Promise<CodexPetImportResult>;
  listLocalPetManagement(): Promise<LocalPetManagementItem[]>;
  deleteLocalPet(folderName: string): Promise<LocalPetDeleteResult>;
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
  onOpenPetSettings(callback: () => void): () => void;
};

declare global {
  interface Window {
    desktopPet?: DesktopPetApi;
  }
}
