import type { PetState } from "./types";

export type Frame = {
  row: number;
  column: number;
  durationMs: number;
};

export const atlas = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
} as const;

const idle: Frame[] = [
  { row: 0, column: 0, durationMs: 280 },
  { row: 0, column: 1, durationMs: 110 },
  { row: 0, column: 2, durationMs: 110 },
  { row: 0, column: 3, durationMs: 140 },
  { row: 0, column: 4, durationMs: 140 },
  { row: 0, column: 5, durationMs: 320 },
];

function frames(row: number, count: number, durationMs: number, finalMs: number): Frame[] {
  return Array.from({ length: count }, (_, column) => ({
    row,
    column,
    durationMs: column === count - 1 ? finalMs : durationMs,
  }));
}

export const stateFrames: Record<PetState, Frame[]> = {
  idle,
  "running-right": frames(1, 8, 120, 220),
  "running-left": frames(2, 8, 120, 220),
  waving: frames(3, 4, 140, 280),
  jumping: frames(4, 5, 140, 280),
};

export function actionDurationMs(state: "waving" | "jumping"): number {
  return stateFrames[state].reduce((total, frame) => total + frame.durationMs, 0) * 3;
}

export function backgroundPosition(frame: Frame): string {
  const x = (frame.column / (atlas.columns - 1)) * 100;
  const y = (frame.row / (atlas.rows - 1)) * 100;
  return `${x}% ${y}%`;
}

export function sequenceFor(state: PetState, reducedMotion: boolean): {
  frames: Frame[];
  loopStartIndex: number | null;
} {
  const current = stateFrames[state] ?? idle;
  if (reducedMotion) return { frames: [current[0]], loopStartIndex: null };

  if (state === "idle") {
    return {
      frames: idle.map((frame) => ({ ...frame, durationMs: frame.durationMs * 6 })),
      loopStartIndex: 0,
    };
  }

  if (state === "running-right" || state === "running-left") {
    return {
      frames: current,
      loopStartIndex: 0,
    };
  }

  const action = [...current, ...current, ...current];
  return {
    frames: [...action, ...idle],
    loopStartIndex: action.length,
  };
}
