import assert from "node:assert/strict";
import {
  activeHoldMsForDecision,
  BehaviorEventQueue,
} from "../../src/behavior/eventQueue.ts";
import {
  canScheduleProactiveEvents,
  decideLifestyleEvent,
  type InteractionMode,
  type LifestyleDecision,
  type PetEvent,
} from "../../src/behavior/lifestyle.ts";
import type { PetOption } from "../../src/types.ts";

function pet(displayName: string, id = `project:${displayName}`): PetOption {
  return {
    id,
    displayName,
    spritesheetPath: "spritesheet.webp",
    folder: "/tmp/pet",
    source: "project",
  };
}

function decision(
  event: PetEvent,
  options: {
    mode?: InteractionMode;
    proactiveEventsEnabled?: boolean;
    pet?: PetOption | null;
  } = {},
): LifestyleDecision {
  return decideLifestyleEvent(event, {
    interactionMode: options.mode ?? "standard",
    proactiveEventsEnabled: options.proactiveEventsEnabled,
    pet: options.pet ?? qixiu,
  });
}

function queueItem(
  event: PetEvent,
  options: {
    forceBubble?: boolean;
    mode?: InteractionMode;
    proactiveEventsEnabled?: boolean;
    pet?: PetOption | null;
  } = {},
) {
  const value = decision(event, options);
  return {
    decision: value,
    activeMs: activeHoldMsForDecision(value, {
      bubbleDurationMs: 3200,
      speechBubblesEnabled: true,
    }),
    forceBubble: options.forceBubble,
    petId: options.pet?.id,
  };
}

const qixiu = pet("七秀 Codex Pet 1", "project:jx3-u4e03-u79c0-01");

{
  const queue = new BehaviorEventQueue();
  const idle = queue.enqueue(queueItem({ type: "idle-timeout" }));
  assert.equal(idle.action, "play");
  assert.equal(queue.active?.decision.eventType, "idle-timeout");

  const click = queue.enqueue(queueItem({ type: "pet-clicked" }));
  assert.equal(click.action, "play");
  assert.equal(click.interrupted?.decision.eventType, "idle-timeout");
  assert.equal(queue.active?.decision.eventType, "pet-clicked");
  assert.equal(queue.pending.length, 0);
}

{
  const queue = new BehaviorEventQueue();
  assert.equal(queue.enqueue(queueItem({ type: "pet-clicked" })).action, "play");

  const idle = queue.enqueue(queueItem({ type: "idle-timeout" }));
  assert.equal(idle.action, "queued");
  assert.equal(queue.active?.decision.eventType, "pet-clicked");
  assert.deepEqual(queue.pending.map((item) => item.decision.eventType), ["idle-timeout"]);

  const next = queue.completeActive();
  assert.equal(next.action, "play");
  assert.equal(next.item?.decision.eventType, "idle-timeout");
}

{
  const queue = new BehaviorEventQueue();
  queue.enqueue(queueItem({ type: "pet-clicked" }));
  assert.equal(queue.enqueue(queueItem({ type: "idle-timeout" })).action, "queued");
  assert.equal(queue.enqueue(queueItem({ type: "idle-timeout" })).action, "merged");
  assert.deepEqual(queue.pending.map((item) => item.decision.eventType), ["idle-timeout"]);

  assert.equal(queue.enqueue(queueItem({ type: "welcome", now: Date.now() })).action, "queued");
  assert.equal(queue.enqueue(queueItem({ type: "welcome", now: Date.now() })).action, "merged");
  assert.deepEqual(queue.pending.map((item) => item.decision.eventType), [
    "idle-timeout",
    "welcome",
  ]);
}

{
  const queue = new BehaviorEventQueue();
  assert.equal(queue.enqueue(queueItem({ type: "import-finished", ok: true })).action, "play");
  const idle = queue.enqueue(queueItem({ type: "idle-timeout" }));
  assert.equal(idle.action, "queued");
  assert.equal(queue.active?.decision.eventType, "import-finished");
  assert.deepEqual(queue.pending.map((item) => item.decision.eventType), ["idle-timeout"]);

  const switchPet = queue.enqueue(queueItem({ type: "pet-switched" }));
  assert.equal(switchPet.action, "play");
  assert.equal(switchPet.interrupted?.decision.eventType, "import-finished");
  assert.equal(queue.active?.decision.eventType, "pet-switched");
  assert.deepEqual(queue.pending.map((item) => item.decision.eventType), ["idle-timeout"]);
}

{
  assert.equal(canScheduleProactiveEvents({
    interactionMode: "sleep",
    proactiveEventsEnabled: true,
  }), false);
  assert.equal(decision({ type: "idle-timeout" }, { mode: "sleep" }).shouldAct, false);
  assert.equal(decision({ type: "welcome" }, {
    mode: "standard",
    proactiveEventsEnabled: false,
  }).shouldAct, false);

  const queue = new BehaviorEventQueue();
  assert.equal(queue.enqueue(queueItem({ type: "welcome" }, {
    mode: "standard",
    proactiveEventsEnabled: false,
  })).action, "dropped");
  assert.equal(queue.active, null);
  assert.equal(queue.pending.length, 0);
}

{
  const queue = new BehaviorEventQueue();
  assert.equal(queue.enqueue(queueItem({ type: "pet-clicked" })).action, "play");
  assert.equal(queue.enqueue(queueItem({ type: "idle-timeout" })).action, "queued");
  queue.clear();
  assert.equal(queue.active, null);
  assert.equal(queue.pending.length, 0);
  assert.equal(queue.enqueue(queueItem({ type: "sleep" }, { mode: "sleep" })).action, "play");
  assert.equal(queue.active?.decision.eventType, "sleep");
}

{
  const idleDecision = decision({ type: "idle-timeout" });
  assert.equal(
    activeHoldMsForDecision(idleDecision, {
      bubbleDurationMs: 3200,
      speechBubblesEnabled: false,
    }),
    idleDecision.durationMs ?? 0,
  );
}

console.log("behavior event queue tests passed");
