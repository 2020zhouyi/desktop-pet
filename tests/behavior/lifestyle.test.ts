import assert from "node:assert/strict";
import {
  bubbleCooldownForDecision,
  classifyLifestyleEvent,
  canScheduleProactiveEvents,
  clickComboThreshold,
  clickComboWindowMs,
  decideLifestyleEvent,
  dragLongThresholdMsForMode,
  idleDelayMsForMode,
  idleLongDelayMsForMode,
  lifestyleRhythmForMode,
  longSessionDelayMsForMode,
  msUntilNextNightComfort,
  nightComfortDelayMsForMode,
  nextInteractionMode,
  rareChanceForTrigger,
  rareClickComboThreshold,
  resolveLifestyleProfile,
  speechBubbleSceneForDecision,
  visiblePetStateLabel,
} from "../../src/behavior/lifestyle.ts";
import {
  addRecentBubbleText,
  bubbleCooldownMultiplierForCadence,
  bubbleScenes,
  bubbleTextForPet,
  selectBubbleLine,
} from "../../src/petBubbles.ts";
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

const qixiu = pet("七秀 Codex Pet 1", "project:jx3-u4e03-u79c0-01");
const lingxueAlias = pet("shadow", "project:jx3-u51cc-u96ea-u9601-01");
const wanling = pet("万灵山庄 Codex Pet 1", "project:jx3-u4e07-u7075-u5c71-u5e84-01");
const tangmen = pet("唐门 Codex Pet 1", "project:jx3-u5510-u95e8-01");
const shaolin = pet("少林 Codex Pet 1", "project:jx3-u5c11-u6797-01");
const cangyun = pet("苍云 Codex Pet 1", "project:jx3-u82cd-u4e91-01");

assert.equal(resolveLifestyleProfile(qixiu).sect, "七秀");
assert.equal(resolveLifestyleProfile(lingxueAlias).sect, "凌雪阁");
assert.equal(resolveLifestyleProfile(wanling).sect, "万灵山庄");
assert.equal(resolveLifestyleProfile(tangmen).sect, "唐门");
assert.equal(resolveLifestyleProfile(shaolin).sect, "少林");
assert.equal(resolveLifestyleProfile(cangyun).sect, "苍云");
assert.equal(resolveLifestyleProfile(pet("Snowfeather", "project:snowfeather")).sect, "蓬莱");
assert.equal(resolveLifestyleProfile(null).sect, "fallback");
assert.equal(resolveLifestyleProfile(pet("unknown", "project:unknown")).bubbleStyleKey, "fallback");
assert.equal(resolveLifestyleProfile(qixiu).idleTendency, "expressive");
assert.equal(resolveLifestyleProfile(tangmen).longSessionTendency, "eye-rest");

assert.equal(classifyLifestyleEvent({ type: "pet-clicked" }).layer, "user");
assert.equal(classifyLifestyleEvent({ type: "pet-dragged" }).kind, "drag");
assert.equal(classifyLifestyleEvent({ type: "wake" }).immediate, true);
assert.equal(classifyLifestyleEvent({
  type: "welcome",
  now: new Date(2026, 4, 30, 8, 0, 0).getTime(),
}).kind, "morning");
assert.equal(classifyLifestyleEvent({
  type: "welcome",
  now: new Date(2026, 4, 30, 22, 0, 0).getTime(),
}).kind, "night");
assert.equal(classifyLifestyleEvent({
  type: "welcome",
  now: new Date(2026, 4, 30, 2, 0, 0).getTime(),
}).kind, "night");
assert.equal(classifyLifestyleEvent({ type: "idle-timeout" }).kind, "idle");
assert.equal(classifyLifestyleEvent({ type: "long-session" }).layer, "time");

const quietRhythm = lifestyleRhythmForMode("quiet", resolveLifestyleProfile(qixiu));
const standardRhythm = lifestyleRhythmForMode("standard", resolveLifestyleProfile(qixiu));
const livelyRhythm = lifestyleRhythmForMode("lively", resolveLifestyleProfile(qixiu));
assert.ok(quietRhythm.idleDelayMs !== null);
assert.ok(standardRhythm.idleDelayMs !== null);
assert.ok(livelyRhythm.idleDelayMs !== null);
assert.ok(quietRhythm.idleDelayMs > standardRhythm.idleDelayMs);
assert.ok(standardRhythm.idleDelayMs > livelyRhythm.idleDelayMs);
assert.ok(quietRhythm.longSessionDelayMs !== null);
assert.ok(standardRhythm.longSessionDelayMs !== null);
assert.ok(livelyRhythm.longSessionDelayMs !== null);
assert.ok(quietRhythm.longSessionDelayMs > standardRhythm.longSessionDelayMs);
assert.ok(standardRhythm.longSessionDelayMs > livelyRhythm.longSessionDelayMs);
assert.ok(quietRhythm.idleLongDelayMs !== null);
assert.ok(standardRhythm.idleLongDelayMs !== null);
assert.ok(livelyRhythm.idleLongDelayMs !== null);
assert.ok(quietRhythm.idleLongDelayMs > standardRhythm.idleLongDelayMs);
assert.ok(standardRhythm.idleLongDelayMs > livelyRhythm.idleLongDelayMs);
assert.ok(quietRhythm.nightComfortDelayMs !== null);
assert.ok(standardRhythm.nightComfortDelayMs !== null);
assert.ok(livelyRhythm.nightComfortDelayMs !== null);
assert.ok(quietRhythm.nightComfortDelayMs > standardRhythm.nightComfortDelayMs);
assert.ok(standardRhythm.nightComfortDelayMs > livelyRhythm.nightComfortDelayMs);
assert.ok(quietRhythm.dragLongThresholdMs > standardRhythm.dragLongThresholdMs);
assert.ok(standardRhythm.dragLongThresholdMs > livelyRhythm.dragLongThresholdMs);
assert.equal(quietRhythm.bubbleCadence, "quiet");
assert.equal(standardRhythm.bubbleCadence, "normal");
assert.equal(livelyRhythm.bubbleCadence, "lively");
assert.equal(lifestyleRhythmForMode("sleep").idleDelayMs, null);
assert.equal(lifestyleRhythmForMode("sleep").idleLongDelayMs, null);
assert.equal(lifestyleRhythmForMode("sleep").nightComfortDelayMs, null);

const click = decideLifestyleEvent({ type: "pet-clicked" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.deepEqual(
  {
    shouldAct: click.shouldAct,
    state: click.state,
    bubbleScene: click.bubbleScene,
    durationMs: click.durationMs,
  },
  {
    shouldAct: true,
    state: "waving",
    bubbleScene: "click",
    durationMs: 1600,
  },
);

const switchPet = decideLifestyleEvent({ type: "pet-switched" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(switchPet.state, "jumping");
assert.equal(switchPet.bubbleScene, "petSwitch");
assert.ok(switchPet.priority > click.priority);

const clickCombo = decideLifestyleEvent({ type: "click-combo", clickCount: 3 }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(clickCombo.state, "waving");
assert.equal(clickCombo.bubbleScene, "clickCombo");
assert.ok(clickCombo.priority > click.priority);
assert.equal(clickComboThreshold, 3);
assert.ok(rareClickComboThreshold > clickComboThreshold);
assert.ok(clickComboWindowMs > 0);

const dragLong = decideLifestyleEvent({ type: "drag-long", dragMs: 4200 }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(dragLong.bubbleScene, "dragLong");
assert.ok(dragLong.priority > decideLifestyleEvent({ type: "pet-dragged" }, {
  interactionMode: "standard",
  pet: qixiu,
}).priority);

const quietIdle = decideLifestyleEvent({ type: "idle-timeout" }, {
  interactionMode: "quiet",
  pet: qixiu,
});
assert.equal(quietIdle.state, "idle");
assert.equal(quietIdle.bubbleScene, "idle");

const standardIdle = decideLifestyleEvent({ type: "idle-timeout" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(standardIdle.state, "review");
assert.equal(standardIdle.bubbleScene, "idle");

const livelyIdle = decideLifestyleEvent({ type: "idle-timeout" }, {
  interactionMode: "lively",
  pet: qixiu,
});
assert.equal(livelyIdle.state, "waiting");

const idleLong = decideLifestyleEvent({ type: "idle-long" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(idleLong.state, "waiting");
assert.equal(idleLong.bubbleScene, "idleLong");
assert.ok(idleLong.cooldownMs > idleDelayMsForMode("standard")!);

const longSession = decideLifestyleEvent({ type: "long-session", sessionMinutes: 70 }, {
  interactionMode: "standard",
  pet: pet("万花 Codex Pet 1"),
});
assert.equal(longSession.state, "waiting");
assert.equal(longSession.bubbleScene, "longSession");
assert.ok(bubbleCooldownForDecision(longSession) >= 45 * 60 * 1000);

const quietLongSession = decideLifestyleEvent({ type: "long-session" }, {
  interactionMode: "quiet",
  pet: qixiu,
});
const livelyLongSession = decideLifestyleEvent({ type: "long-session" }, {
  interactionMode: "lively",
  pet: qixiu,
});
assert.ok(quietLongSession.cooldownMs > livelyLongSession.cooldownMs);
assert.ok(quietLongSession.priority < livelyLongSession.priority);
assert.ok(bubbleCooldownForDecision(quietLongSession) > quietLongSession.cooldownMs);
assert.ok(bubbleCooldownForDecision(livelyLongSession) < livelyLongSession.cooldownMs);

const comfort = decideLifestyleEvent({ type: "comfort", reason: "night" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(comfort.state, "waiting");
assert.equal(comfort.bubbleScene, "comfort");
assert.equal(comfort.bubbleCadence, "quiet");

const rare = decideLifestyleEvent({ type: "rare", reason: "click-combo" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(rare.state, "review");
assert.equal(rare.bubbleScene, "rare");
assert.ok(rare.cooldownMs >= 24 * 60 * 60 * 1000);
assert.ok(rare.priority > clickCombo.priority);

const sleepingIdle = decideLifestyleEvent({ type: "idle-timeout" }, {
  interactionMode: "sleep",
  pet: qixiu,
});
assert.equal(sleepingIdle.shouldAct, false);
assert.equal(sleepingIdle.reason, "sleep-mode");
assert.equal(decideLifestyleEvent({ type: "welcome" }, {
  interactionMode: "sleep",
  pet: qixiu,
}).shouldAct, false);
assert.equal(decideLifestyleEvent({
  type: "welcome",
  now: new Date(2026, 4, 30, 8, 0, 0).getTime(),
}, {
  interactionMode: "sleep",
  pet: qixiu,
}).reason, "sleep-mode");
assert.equal(decideLifestyleEvent({ type: "long-session" }, {
  interactionMode: "sleep",
  pet: qixiu,
}).shouldAct, false);
assert.equal(decideLifestyleEvent({ type: "idle-long" }, {
  interactionMode: "sleep",
  pet: qixiu,
}).reason, "sleep-mode");
assert.equal(decideLifestyleEvent({ type: "comfort", reason: "night" }, {
  interactionMode: "sleep",
  pet: qixiu,
}).reason, "sleep-mode");

const sleepingClick = decideLifestyleEvent({ type: "pet-clicked" }, {
  interactionMode: "sleep",
  pet: qixiu,
});
assert.equal(sleepingClick.shouldAct, true);
assert.equal(sleepingClick.bubbleScene, "click");
assert.equal(decideLifestyleEvent({ type: "click-combo", clickCount: 3 }, {
  interactionMode: "sleep",
  pet: qixiu,
}).bubbleScene, "clickCombo");

const noSpeechClick = decideLifestyleEvent({ type: "pet-clicked" }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(speechBubbleSceneForDecision(noSpeechClick, {
  speechBubblesEnabled: false,
}), undefined);
assert.equal(speechBubbleSceneForDecision(noSpeechClick, {
  speechBubblesEnabled: true,
}), "click");

assert.equal(canScheduleProactiveEvents({
  interactionMode: "standard",
  proactiveEventsEnabled: false,
}), false);
assert.equal(canScheduleProactiveEvents({
  interactionMode: "sleep",
  proactiveEventsEnabled: true,
}), false);
assert.equal(canScheduleProactiveEvents({
  interactionMode: "standard",
  proactiveEventsEnabled: true,
}), true);
assert.equal(decideLifestyleEvent({ type: "welcome" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).shouldAct, false);
assert.equal(decideLifestyleEvent({ type: "long-session" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).reason, "proactive-disabled");
assert.equal(decideLifestyleEvent({ type: "idle-long" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).reason, "proactive-disabled");
assert.equal(decideLifestyleEvent({ type: "comfort", reason: "night" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).reason, "proactive-disabled");
assert.equal(decideLifestyleEvent({ type: "pet-clicked" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).shouldAct, true);
assert.equal(decideLifestyleEvent({ type: "rare", reason: "click-combo" }, {
  interactionMode: "standard",
  proactiveEventsEnabled: false,
  pet: qixiu,
}).shouldAct, true);

const importSuccess = decideLifestyleEvent({ type: "import-finished", ok: true }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(importSuccess.state, "jumping");
assert.equal(importSuccess.bubbleScene, "importSuccess");

const importFail = decideLifestyleEvent({ type: "import-finished", ok: false }, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(importFail.state, "failed");
assert.equal(importFail.bubbleScene, "importFail");

const morning = decideLifestyleEvent({
  type: "welcome",
  now: new Date(2026, 4, 30, 8, 0, 0).getTime(),
}, {
  interactionMode: "standard",
  pet: qixiu,
});
assert.equal(morning.bubbleScene, "morning");

assert.equal(nextInteractionMode("standard"), "lively");
assert.equal(nextInteractionMode("lively"), "sleep");
assert.equal(nextInteractionMode("sleep"), "quiet");
assert.equal(idleDelayMsForMode("sleep"), null);
assert.equal(idleLongDelayMsForMode("sleep"), null);
assert.equal(longSessionDelayMsForMode("sleep"), null);
assert.equal(nightComfortDelayMsForMode("sleep"), null);
assert.equal(dragLongThresholdMsForMode("sleep"), 5 * 1000);
assert.ok(idleLongDelayMsForMode("standard")! > idleDelayMsForMode("standard")!);
assert.ok(nightComfortDelayMsForMode("quiet")! > nightComfortDelayMsForMode("lively")!);
assert.equal(rareChanceForTrigger("click-combo"), 0.2);
assert.equal(rareChanceForTrigger("idle-long"), 0.1);
assert.equal(rareChanceForTrigger("night"), 0.1);
assert.equal(
  msUntilNextNightComfort(
    new Date(2026, 4, 30, 22, 30, 0).getTime(),
    60 * 60 * 1000,
  ),
  30 * 60 * 1000,
);
assert.equal(
  msUntilNextNightComfort(
    new Date(2026, 4, 30, 23, 30, 0).getTime(),
    60 * 60 * 1000,
  ),
  60 * 60 * 1000,
);

assert.equal(visiblePetStateLabel("review"), "观察");
assert.ok(!visiblePetStateLabel("review").includes("审"));
assert.ok(bubbleTextForPet(qixiu, "longSession").length > 0);

const baseQixiuIdleLine = bubbleTextForPet(qixiu, "idle", { cadence: "normal" });
const livelyQixiuIdleLine = bubbleTextForPet(qixiu, "idle", {
  cadence: "lively",
  recentTexts: [baseQixiuIdleLine],
});
assert.notEqual(livelyQixiuIdleLine, baseQixiuIdleLine);

const selectedLine = selectBubbleLine(["alpha", "beta", "gamma"], "pet:idle");
const dedupedLine = selectBubbleLine(["alpha", "beta", "gamma"], "pet:idle", [
  selectedLine,
]);
assert.notEqual(dedupedLine, selectedLine);
assert.equal(selectBubbleLine(["solo"], "pet:idle", ["solo"]), "solo");
assert.deepEqual(addRecentBubbleText(["older", selectedLine], selectedLine, 2), [
  selectedLine,
  "older",
]);
assert.deepEqual(addRecentBubbleText(["older", selectedLine], "fresh", 2), [
  "fresh",
  "older",
]);
assert.ok(bubbleCooldownMultiplierForCadence("quiet") > bubbleCooldownMultiplierForCadence("normal"));
assert.ok(bubbleCooldownMultiplierForCadence("normal") > bubbleCooldownMultiplierForCadence("lively"));

assert.deepEqual(bubbleScenes, [
  "welcome",
  "idle",
  "click",
  "drag",
  "clickCombo",
  "idleLong",
  "dragLong",
  "rare",
  "comfort",
  "morning",
  "evening",
  "longSession",
  "petSwitch",
  "importSuccess",
  "importFail",
  "sleep",
  "wake",
]);

console.log("behavior lifestyle tests passed");
