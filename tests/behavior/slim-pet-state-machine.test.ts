import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  directionalDragEvent,
  initialPetState,
  petStates,
  transitionPetState,
} from "../../src/behavior/petStateMachine.ts";
import { sequenceFor, stateFrames } from "../../src/petAnimation.ts";

assert.deepEqual(petStates, [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
]);
assert.equal(initialPetState, "idle");
assert.equal(directionalDragEvent(3), null);
assert.equal(directionalDragEvent(-3), null);
assert.deepEqual(directionalDragEvent(4), { type: "drag-right" });
assert.deepEqual(directionalDragEvent(-4), { type: "drag-left" });
assert.deepEqual(Object.keys(stateFrames), petStates);
assert.equal(stateFrames["running-right"][0].row, 1);
assert.equal(stateFrames["running-left"][0].row, 2);
assert.equal(sequenceFor("running-right", false).loopStartIndex, 0);
assert.equal(sequenceFor("running-left", false).loopStartIndex, 0);
assert.equal(sequenceFor("jumping", false).loopStartIndex, stateFrames.jumping.length * 3);

const transitions = [
  ["idle", "press", "idle"],
  ["waving", "press", "waving"],
  ["jumping", "press", "jumping"],
  ["idle", "drag-right", "running-right"],
  ["waving", "drag-left", "running-left"],
  ["running-right", "drag-left", "running-left"],
  ["running-left", "drag-right", "running-right"],
  ["running-right", "drag-end", "idle"],
  ["running-left", "drag-end", "idle"],
  ["idle", "click", "waving"],
  ["waving", "action-complete", "idle"],
  ["idle", "hover-enter", "jumping"],
  ["waving", "hover-enter", "jumping"],
  ["jumping", "hover-leave", "idle"],
  ["running-right", "click", "running-right"],
  ["running-left", "hover-enter", "running-left"],
  ["idle", "action-complete", "idle"],
] as const;

for (const [state, eventType, expectedState] of transitions) {
  assert.equal(
    transitionPetState(state, { type: eventType }),
    expectedState,
    `${state} + ${eventType} should transition to ${expectedState}`,
  );
}

assert.throws(
  () => transitionPetState("failed" as never, { type: "click" }),
  /unsupported pet state/i,
);

const [appSource, controlSurfaceSource, smokeProbeSource] = await Promise.all([
  readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../src/control/ControlSurface.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../electron/smoke-probe.mjs", import.meta.url), "utf8"),
]);

assert.doesNotMatch(
  appSource,
  /corePetState|data-core-state/,
  "PetSurface must not maintain a second animation state beside status.state",
);
assert.match(
  appSource,
  /useFrameAnimation\(status\.state,/,
  "production animation must read the single status.state source",
);
assert.doesNotMatch(
  controlSurfaceSource,
  /desktopPetApi\.setState/,
  "ControlSurface selection must not bypass the PetSurface transition mechanism",
);
assert.doesNotMatch(
  smokeProbeSource,
  /api\.selectPet\(/,
  "the smoke probe must switch pets through picker UI instead of the preload shortcut",
);
assert.match(
  smokeProbeSource,
  /dataset\.state/,
  "the smoke probe must observe the renderer data-state attribute",
);

console.log("slim pet state machine tests passed");
