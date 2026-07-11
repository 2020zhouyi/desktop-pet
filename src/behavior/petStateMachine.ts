export const petStates = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
] as const;

export type PetState = (typeof petStates)[number];

export type PetStateEvent = {
  type:
    | "press"
    | "drag-left"
    | "drag-right"
    | "drag-end"
    | "click"
    | "jump"
    | "hover-enter"
    | "hover-leave"
    | "action-complete";
};

export const initialPetState: PetState = "idle";

export function directionalDragEvent(
  deltaX: number,
  thresholdPx = 4,
): PetStateEvent | null {
  if (deltaX >= thresholdPx) return { type: "drag-right" };
  if (deltaX <= -thresholdPx) return { type: "drag-left" };
  return null;
}

export function transitionPetState(
  state: PetState,
  event: PetStateEvent,
): PetState {
  if (!petStates.includes(state)) {
    throw new Error(`Unsupported pet state: ${String(state)}`);
  }

  if (event.type === "drag-left") {
    return "running-left";
  }

  if (event.type === "drag-right") {
    return "running-right";
  }

  const isDirectionalDrag = state === "running-left" || state === "running-right";
  if (isDirectionalDrag) {
    return event.type === "drag-end" ? "idle" : state;
  }

  if (event.type === "action-complete") {
    return "idle";
  }

  if (state === "idle" && event.type === "click") {
    return "waving";
  }

  if (event.type === "hover-enter") {
    return "jumping";
  }

  if (state === "jumping" && event.type === "hover-leave") return "idle";

  if (state === "idle" && event.type === "jump") return "jumping";

  return state;
}
