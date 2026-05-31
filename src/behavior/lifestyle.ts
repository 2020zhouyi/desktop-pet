import type { BubbleCadence, BubbleScene } from "../petBubbles";
import type { PetOption, PetState } from "../types";

export const interactionModes = ["quiet", "standard", "lively", "sleep"] as const;

export type InteractionMode = (typeof interactionModes)[number];

export const defaultInteractionMode: InteractionMode = "standard";

export const clickComboThreshold = 3;
export const rareClickComboThreshold = 5;
export const clickComboWindowMs = 1400;

export type RareTrigger = "click-combo" | "idle-long" | "night";

export type PetEvent =
  | { type: "welcome"; now?: number }
  | { type: "pet-clicked"; now?: number }
  | { type: "click-combo"; now?: number; clickCount?: number }
  | { type: "pet-dragged"; now?: number }
  | { type: "drag-long"; now?: number; dragMs?: number }
  | { type: "pet-switched"; now?: number }
  | { type: "idle-timeout"; now?: number }
  | { type: "idle-long"; now?: number }
  | { type: "long-session"; now?: number; sessionMinutes?: number }
  | { type: "import-finished"; now?: number; ok: boolean }
  | { type: "rare"; now?: number; reason: RareTrigger }
  | { type: "comfort"; now?: number; reason: "night" | "long-session" | "failure" }
  | { type: "sleep"; now?: number }
  | { type: "wake"; now?: number };

export type LifestyleDecision = {
  shouldAct: boolean;
  eventType: PetEvent["type"];
  priority: number;
  cooldownMs: number;
  state?: PetState;
  durationMs?: number;
  bubbleScene?: BubbleScene;
  bubbleCadence?: BubbleCadence;
  reason?: string;
};

export type LifestyleSect =
  | "七秀"
  | "万花"
  | "纯阳"
  | "五毒"
  | "丐帮"
  | "凌雪阁"
  | "北天药宗"
  | "段氏"
  | "万灵山庄"
  | "刀宗"
  | "衍天宗"
  | "蓬莱"
  | "霸刀"
  | "长歌"
  | "苍云"
  | "明教"
  | "唐门"
  | "藏剑"
  | "天策"
  | "少林"
  | "fallback";

export type LifestyleLayer = "time" | "user" | "system";
export type LifestyleKind =
  | "welcome"
  | "morning"
  | "night"
  | "click"
  | "click-combo"
  | "drag"
  | "drag-long"
  | "switch"
  | "idle"
  | "idle-long"
  | "long-session"
  | "import"
  | "rare"
  | "comfort"
  | "sleep"
  | "wake";
export type LifestyleIdleTendency = "calm" | "expressive" | "watchful";
export type LifestyleLongSessionTendency = "stretch" | "eye-rest" | "movement";

export type LifestyleEventClassification = {
  layer: LifestyleLayer;
  kind: LifestyleKind;
  immediate: boolean;
};

export type LifestyleRhythm = {
  idleDelayMs: number | null;
  idleLongDelayMs: number | null;
  longSessionDelayMs: number | null;
  nightComfortDelayMs: number | null;
  dragLongThresholdMs: number;
  bubbleCadence: BubbleCadence;
};

export type LifestyleProfile = {
  sect: LifestyleSect;
  aliases: string[];
  bubbleStyleKey: string;
  idleTendency: LifestyleIdleTendency;
  longSessionTendency: LifestyleLongSessionTendency;
  standardIdleState: PetState;
  livelyIdleState: PetState;
  longSessionState: PetState;
};

export type LifestyleContext = {
  interactionMode: InteractionMode;
  proactiveEventsEnabled?: boolean;
  pet: Pick<PetOption, "id" | "displayName"> | null;
};

const minute = 60 * 1000;

const profiles: LifestyleProfile[] = [
  profile("七秀", ["七秀", "xiutai", "u4e03-u79c0"], {
    idleTendency: "expressive",
    longSessionTendency: "movement",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("万花", ["万花", "wanhua", "u4e07-u82b1"], {
    idleTendency: "watchful",
    longSessionTendency: "eye-rest",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("纯阳", ["纯阳", "chunyang", "u7eaf-u9633"], {
    idleTendency: "calm",
    longSessionTendency: "movement",
    standardIdleState: "idle",
    livelyIdleState: "review",
  }),
  profile("五毒", ["五毒", "毒灵", "wudu", "duling", "u4e94-u6bd2"], {
    idleTendency: "watchful",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("丐帮", ["丐帮", "gaibang", "u4e10-u5e2e"], {
    idleTendency: "expressive",
    longSessionTendency: "movement",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("凌雪阁", ["凌雪阁", "lingxue", "u51cc-u96ea-u9601"], {
    idleTendency: "watchful",
    longSessionTendency: "eye-rest",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("北天药宗", ["北天药宗", "beitian", "yaozong", "u5317-u5929-u836f-u5b97"], {
    idleTendency: "watchful",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("万灵山庄", ["万灵山庄", "wanling", "lingshan", "u7075-u5c71-u5e84"], {
    idleTendency: "expressive",
    longSessionTendency: "movement",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("唐门", ["唐门", "tangmen", "u5510-u95e8"], {
    idleTendency: "watchful",
    longSessionTendency: "eye-rest",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("少林", ["少林", "shaolin", "u5c11-u6797"], {
    idleTendency: "calm",
    standardIdleState: "idle",
    livelyIdleState: "waiting",
  }),
  profile("苍云", ["苍云", "cangyun", "u82cd-u4e91"], {
    idleTendency: "watchful",
    longSessionTendency: "movement",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("蓬莱", ["蓬莱", "penglai", "snowfeather", "u84ec-u83b1"], {
    idleTendency: "expressive",
    longSessionTendency: "movement",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("段氏", ["段氏", "duanshi", "u6bb5-u6c0f"], {
    idleTendency: "expressive",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("刀宗", ["刀宗", "daozong", "u5200-u5b97"], {
    idleTendency: "watchful",
    longSessionTendency: "movement",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("衍天宗", ["衍天宗", "yantian", "u884d-u5929-u5b97"], {
    idleTendency: "watchful",
    longSessionTendency: "eye-rest",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("霸刀", ["霸刀", "badao", "u9738-u5200"], {
    idleTendency: "calm",
    longSessionTendency: "movement",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("长歌", ["长歌", "changge", "u957f-u6b4c"], {
    idleTendency: "calm",
    longSessionTendency: "eye-rest",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("明教", ["明教", "mingjiao", "mingyue-shi", "u660e-u6559"], {
    idleTendency: "watchful",
    longSessionTendency: "movement",
    standardIdleState: "review",
    livelyIdleState: "waiting",
  }),
  profile("藏剑", ["藏剑", "cangjian", "u85cf-u5251"], {
    idleTendency: "expressive",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
  profile("天策", ["天策", "tiance", "u5929-u7b56"], {
    idleTendency: "watchful",
    longSessionTendency: "movement",
    standardIdleState: "waiting",
    livelyIdleState: "review",
  }),
];

const fallbackProfile: LifestyleProfile = {
  sect: "fallback",
  aliases: [],
  bubbleStyleKey: "fallback",
  idleTendency: "calm",
  longSessionTendency: "stretch",
  standardIdleState: "waiting",
  livelyIdleState: "review",
  longSessionState: "waiting",
};

const proactiveEvents = new Set<PetEvent["type"]>([
  "welcome",
  "idle-timeout",
  "idle-long",
  "long-session",
  "comfort",
]);

export const interactionModeLabels: Record<InteractionMode, string> = {
  quiet: "清静",
  standard: "日常",
  lively: "活泼",
  sleep: "睡觉",
};

export const petStateLabels: Record<PetState, string> = {
  idle: "待机",
  "running-right": "右跑",
  "running-left": "左跑",
  waving: "招手",
  jumping: "雀跃",
  failed: "困惑",
  waiting: "歇脚",
  running: "跑动",
  review: "观察",
};

export function decideLifestyleEvent(
  event: PetEvent,
  context: LifestyleContext,
): LifestyleDecision {
  if (proactiveEvents.has(event.type)) {
    if (context.interactionMode === "sleep") return skip(event, "sleep-mode");
    if (context.proactiveEventsEnabled === false) return skip(event, "proactive-disabled");
  }

  const resolvedProfile = resolveLifestyleProfile(context.pet);
  const cadence = bubbleCadenceForMode(context.interactionMode);

  switch (event.type) {
    case "welcome":
      return decision(event, {
        bubbleScene: welcomeSceneFor(event.now),
        priority: 10,
        cooldownMs: 30 * minute,
        bubbleCadence: cadence,
      });
    case "pet-clicked":
      return decision(event, {
        state: "waving",
        durationMs: 1600,
        bubbleScene: "click",
        priority: 70,
        cooldownMs: 20 * 1000,
        bubbleCadence: cadence,
      });
    case "click-combo":
      return decision(event, {
        state: "waving",
        durationMs: 1600,
        bubbleScene: "clickCombo",
        priority: 76,
        cooldownMs: 8 * 1000,
        bubbleCadence: cadence,
      });
    case "pet-dragged":
      return decision(event, {
        bubbleScene: "drag",
        priority: 65,
        cooldownMs: 25 * 1000,
        bubbleCadence: cadence,
      });
    case "drag-long":
      return decision(event, {
        bubbleScene: "dragLong",
        priority: 68,
        cooldownMs: 14 * 1000,
        bubbleCadence: cadence,
      });
    case "pet-switched":
      return decision(event, {
        state: "jumping",
        durationMs: 1300,
        bubbleScene: "petSwitch",
        priority: 80,
        cooldownMs: 0,
        bubbleCadence: cadence,
      });
    case "idle-timeout": {
      const state = idleStateForMode(context.interactionMode, resolvedProfile);
      return decision(event, {
        state,
        durationMs: state === "idle" ? 0 : 1800,
        bubbleScene: "idle",
        priority: context.interactionMode === "quiet" ? 15 : 25,
        cooldownMs: idleDelayMsForMode(context.interactionMode) ?? 12 * minute,
        bubbleCadence: cadence,
      });
    }
    case "idle-long":
      return decision(event, {
        state: "waiting",
        durationMs: 2200,
        bubbleScene: "idleLong",
        priority: context.interactionMode === "quiet" ? 22 : 34,
        cooldownMs: idleLongDelayMsForMode(context.interactionMode) ?? 10 * minute,
        bubbleCadence: cadence,
      });
    case "long-session":
      return decision(event, {
        state: resolvedProfile.longSessionState,
        durationMs: 2400,
        bubbleScene: "longSession",
        priority: longSessionPriorityForMode(context.interactionMode),
        cooldownMs: longSessionDelayMsForMode(context.interactionMode) ?? 60 * minute,
        bubbleCadence: cadence,
      });
    case "import-finished":
      return decision(event, {
        state: event.ok ? "jumping" : "failed",
        durationMs: event.ok ? 1300 : 1800,
        bubbleScene: event.ok ? "importSuccess" : "importFail",
        priority: event.ok ? 78 : 90,
        cooldownMs: 0,
        bubbleCadence: cadence,
      });
    case "rare":
      return decision(event, {
        state: "review",
        durationMs: 1800,
        bubbleScene: "rare",
        priority: event.reason === "click-combo" ? 79 : 52,
        cooldownMs: 24 * 60 * minute,
        bubbleCadence: cadence,
      });
    case "comfort":
      return decision(event, {
        state: "waiting",
        durationMs: 2200,
        bubbleScene: "comfort",
        priority: event.reason === "failure" ? 58 : 38,
        cooldownMs: nightComfortDelayMsForMode(context.interactionMode) ?? 60 * minute,
        bubbleCadence: "quiet",
      });
    case "sleep":
      return decision(event, {
        state: "idle",
        durationMs: 0,
        bubbleScene: "sleep",
        priority: 35,
        cooldownMs: 0,
        bubbleCadence: "quiet",
      });
    case "wake":
      return decision(event, {
        state: "waving",
        durationMs: 1600,
        bubbleScene: "wake",
        priority: 75,
        cooldownMs: 0,
        bubbleCadence: cadence,
      });
  }
}

export function classifyLifestyleEvent(event: PetEvent): LifestyleEventClassification {
  switch (event.type) {
    case "welcome":
      return {
        layer: "time",
        kind: welcomeKindFor(event.now),
        immediate: false,
      };
    case "pet-clicked":
      return {
        layer: "user",
        kind: "click",
        immediate: true,
      };
    case "click-combo":
      return {
        layer: "user",
        kind: "click-combo",
        immediate: true,
      };
    case "pet-dragged":
      return {
        layer: "user",
        kind: "drag",
        immediate: true,
      };
    case "drag-long":
      return {
        layer: "user",
        kind: "drag-long",
        immediate: true,
      };
    case "pet-switched":
      return {
        layer: "user",
        kind: "switch",
        immediate: true,
      };
    case "idle-timeout":
      return {
        layer: "time",
        kind: "idle",
        immediate: false,
      };
    case "idle-long":
      return {
        layer: "time",
        kind: "idle-long",
        immediate: false,
      };
    case "long-session":
      return {
        layer: "time",
        kind: "long-session",
        immediate: false,
      };
    case "import-finished":
      return {
        layer: "system",
        kind: "import",
        immediate: true,
      };
    case "rare":
      return {
        layer: "system",
        kind: "rare",
        immediate: true,
      };
    case "comfort":
      return {
        layer: event.reason === "night" || event.reason === "long-session" ? "time" : "system",
        kind: "comfort",
        immediate: event.reason === "failure",
      };
    case "sleep":
      return {
        layer: "user",
        kind: "sleep",
        immediate: true,
      };
    case "wake":
      return {
        layer: "user",
        kind: "wake",
        immediate: true,
      };
  }
}

export function resolveLifestyleProfile(
  pet: Pick<PetOption, "id" | "displayName"> | null,
): LifestyleProfile {
  if (!pet) return fallbackProfile;
  const haystack = `${pet.displayName} ${pet.id}`.toLowerCase();
  return (
    profiles.find((item) =>
      item.aliases.some((alias) => haystack.includes(alias.toLowerCase())),
    ) ?? fallbackProfile
  );
}

export function nextInteractionMode(mode: InteractionMode): InteractionMode {
  const index = interactionModes.indexOf(mode);
  return interactionModes[(index + 1) % interactionModes.length] ?? defaultInteractionMode;
}

export function isInteractionMode(value: unknown): value is InteractionMode {
  return typeof value === "string" && interactionModes.includes(value as InteractionMode);
}

export function canScheduleProactiveEvents(settings: {
  interactionMode: InteractionMode;
  proactiveEventsEnabled: boolean;
}): boolean {
  return settings.proactiveEventsEnabled && settings.interactionMode !== "sleep";
}

export function lifestyleRhythmForMode(
  mode: InteractionMode,
  _profile: LifestyleProfile = fallbackProfile,
): LifestyleRhythm {
  return {
    idleDelayMs: idleDelayMsForMode(mode),
    idleLongDelayMs: idleLongDelayMsForMode(mode),
    longSessionDelayMs: longSessionDelayMsForMode(mode),
    nightComfortDelayMs: nightComfortDelayMsForMode(mode),
    dragLongThresholdMs: dragLongThresholdMsForMode(mode),
    bubbleCadence: bubbleCadenceForMode(mode),
  };
}

export function speechBubbleSceneForDecision(
  decisionValue: Pick<LifestyleDecision, "bubbleScene">,
  settings: { speechBubblesEnabled: boolean },
): BubbleScene | undefined {
  if (!settings.speechBubblesEnabled) return undefined;
  return decisionValue.bubbleScene;
}

export function idleDelayMsForMode(mode: InteractionMode): number | null {
  if (mode === "sleep") return null;
  if (mode === "quiet") return 12 * minute;
  if (mode === "lively") return 3 * minute;
  return 6 * minute;
}

export function idleLongDelayMsForMode(mode: InteractionMode): number | null {
  if (mode === "sleep") return null;
  if (mode === "quiet") return 20 * minute;
  if (mode === "lively") return 6 * minute;
  return 10 * minute;
}

export function longSessionDelayMsForMode(mode: InteractionMode): number | null {
  if (mode === "sleep") return null;
  if (mode === "quiet") return 120 * minute;
  if (mode === "lively") return 45 * minute;
  return 55 * minute;
}

export function nightComfortDelayMsForMode(mode: InteractionMode): number | null {
  if (mode === "sleep") return null;
  if (mode === "quiet") return 90 * minute;
  if (mode === "lively") return 45 * minute;
  return 60 * minute;
}

export function dragLongThresholdMsForMode(mode: InteractionMode): number {
  if (mode === "sleep") return 5 * 1000;
  if (mode === "quiet") return 4 * 1000;
  if (mode === "lively") return 2.5 * 1000;
  return 3.5 * 1000;
}

export function rareChanceForTrigger(trigger: RareTrigger): number {
  if (trigger === "click-combo") return 0.2;
  return 0.1;
}

export function msUntilNextNightComfort(nowMs: number, intervalMs: number): number {
  const now = new Date(nowMs);
  const hour = now.getHours();
  if (hour >= 23 || hour < 5) return intervalMs;

  const next = new Date(now);
  next.setHours(23, 0, 0, 0);
  return Math.max(0, next.getTime() - nowMs);
}

export function visiblePetStateLabel(state: PetState): string {
  return petStateLabels[state] ?? state;
}

export function bubbleCooldownForDecision(
  decisionValue: Pick<LifestyleDecision, "cooldownMs" | "bubbleCadence">,
): number {
  return Math.round(
    decisionValue.cooldownMs * cooldownMultiplierForCadence(decisionValue.bubbleCadence),
  );
}

function profile(
  sect: Exclude<LifestyleSect, "fallback">,
  aliases: string[],
  overrides: Partial<
    Pick<
      LifestyleProfile,
      | "idleTendency"
      | "longSessionTendency"
      | "standardIdleState"
      | "livelyIdleState"
      | "longSessionState"
    >
  >,
): LifestyleProfile {
  return {
    sect,
    aliases,
    bubbleStyleKey: sect,
    idleTendency: overrides.idleTendency ?? "calm",
    longSessionTendency: overrides.longSessionTendency ?? "stretch",
    standardIdleState: overrides.standardIdleState ?? "waiting",
    livelyIdleState: overrides.livelyIdleState ?? "review",
    longSessionState: overrides.longSessionState ?? "waiting",
  };
}

function idleStateForMode(mode: InteractionMode, currentProfile: LifestyleProfile): PetState {
  if (mode === "quiet" || mode === "sleep") return "idle";
  if (mode === "lively") return currentProfile.livelyIdleState;
  return currentProfile.standardIdleState;
}

function welcomeSceneFor(now: number | undefined): BubbleScene {
  const hour = new Date(now ?? Date.now()).getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 18 || hour < 5) return "evening";
  return "welcome";
}

function welcomeKindFor(now: number | undefined): LifestyleKind {
  const hour = new Date(now ?? Date.now()).getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 18 || hour < 5) return "night";
  return "welcome";
}

export function bubbleCadenceForMode(mode: InteractionMode): LifestyleRhythm["bubbleCadence"] {
  if (mode === "quiet" || mode === "sleep") return "quiet";
  if (mode === "lively") return "lively";
  return "normal";
}

function cooldownMultiplierForCadence(cadence: BubbleCadence | undefined): number {
  if (cadence === "quiet") return 1.6;
  if (cadence === "lively") return 0.75;
  return 1;
}

function longSessionPriorityForMode(mode: InteractionMode): number {
  if (mode === "quiet") return 35;
  if (mode === "lively") return 55;
  return 45;
}

function decision(
  event: PetEvent,
  value: Omit<LifestyleDecision, "shouldAct" | "eventType">,
): LifestyleDecision {
  return {
    shouldAct: true,
    eventType: event.type,
    ...value,
  };
}

function skip(event: PetEvent, reason: string): LifestyleDecision {
  return {
    shouldAct: false,
    eventType: event.type,
    priority: 0,
    cooldownMs: 0,
    reason,
  };
}
