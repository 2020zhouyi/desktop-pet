import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bubbleCooldownForDecision,
  canScheduleProactiveEvents,
  clickComboThreshold,
  clickComboWindowMs,
  decideLifestyleEvent,
  dragLongThresholdMsForMode,
  idleDelayMsForMode,
  idleLongDelayMsForMode,
  defaultInteractionMode,
  interactionModeLabels,
  longSessionDelayMsForMode,
  msUntilNextNightComfort,
  nightComfortDelayMsForMode,
  rareChanceForTrigger,
  rareClickComboThreshold,
  speechBubbleSceneForDecision,
} from "./behavior/lifestyle";
import {
  activeHoldMsForDecision,
  BehaviorEventQueue,
  type QueuedBehaviorEvent,
} from "./behavior/eventQueue";
import { desktopPetApi, localPreviewStatus } from "./desktopPetApi";
import { bubbleTextForPet } from "./petBubbles";
import { atlas, backgroundPosition, sequenceFor } from "./petAnimation";
import type {
  CodexPetImportCandidate,
  DesktopPetSettings,
  LocalPetManagementItem,
  PetOption,
  PetState,
  PetStatus,
} from "./types";
import type {
  InteractionMode,
  LifestyleDecision,
  PetEvent,
  RareTrigger,
} from "./behavior/lifestyle";
import type { BubbleCadence, BubbleScene } from "./petBubbles";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Frame } from "./petAnimation";
import "./styles.css";

const dragThresholdPx = 4;
const mascotWidthStepPx = 12;
const minMascotWidthPx = 84;
const maxMascotWidthPx = 228;
const defaultMascotWidthPx = 120;
const mascotAspectRatio = 192 / 208;
const bubbleDurationMs = 3200;
const minuteMs = 60 * 1000;
const bubbleCooldownMs: Record<BubbleScene, number> = {
  welcome: 30 * minuteMs,
  idle: 4 * 60 * 1000,
  click: 25 * 1000,
  drag: 30 * 1000,
  clickCombo: 8 * 1000,
  idleLong: 10 * 60 * 1000,
  dragLong: 14 * 1000,
  rare: 24 * 60 * 60 * 1000,
  comfort: 60 * 60 * 1000,
  morning: 30 * minuteMs,
  evening: 30 * minuteMs,
  longSession: 45 * minuteMs,
  petSwitch: 0,
  importSuccess: 0,
  importFail: 0,
  sleep: 0,
  wake: 0,
};
const defaultDesktopPetSettings: DesktopPetSettings = {
  interactionMode: defaultInteractionMode,
  mascotWidthPx: defaultMascotWidthPx,
  opacity: 1,
  alwaysOnTopEnabled: true,
  launchAtLoginEnabled: false,
  speechBubblesEnabled: true,
  proactiveEventsEnabled: true,
};

const interactiveHitSelector = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[role='button']",
  ".pet-card:not(.pet-card-empty)",
  ".settings-panel",
].join(",");

function initialSearchParam(name: string): boolean {
  return new URLSearchParams(window.location.search).has(name);
}

type DragState = {
  pointerId: number;
  screenX: number;
  screenY: number;
  startedAt: number;
  hasMoved: boolean;
};

type ResizeState = {
  pointerId: number;
  startScreenX: number;
  startWidthPx: number;
  currentWidthPx: number;
};

type HitFrameData = {
  key: string;
  pixels: Uint8ClampedArray | null;
};

type AlphaBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ActiveBubble = {
  id: number;
  scene: BubbleScene;
  text: string;
};

type QueuedLifestyleEvent = QueuedBehaviorEvent & {
  forceBubble?: boolean;
  pet?: PetOption | null;
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (!("matchMedia" in window)) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (!("matchMedia" in window)) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    if ("addEventListener" in media) {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    const legacyMedia = media as MediaQueryList & {
      addListener(listener: () => void): void;
      removeListener(listener: () => void): void;
    };
    legacyMedia.addListener(onChange);
    return () => legacyMedia.removeListener(onChange);
  }, []);

  return reduced;
}

function useFrameAnimation(
  state: PetState,
  reducedMotion: boolean,
  currentFrameRef: MutableRefObject<Frame>,
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const sequence = sequenceFor(state, reducedMotion);
    let frameIndex = 0;
    let timer: number | null = null;

    const render = () => {
      const frame = sequence.frames[frameIndex];
      currentFrameRef.current = frame;
      element.style.backgroundPosition = backgroundPosition(frame);

      if (sequence.frames.length <= 1) return;
      timer = window.setTimeout(() => {
        const next = frameIndex + 1;
        if (next >= sequence.frames.length) {
          if (sequence.loopStartIndex === null) return;
          frameIndex = sequence.loopStartIndex;
        } else {
          frameIndex = next;
        }
        render();
      }, frame.durationMs);
    };

    render();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [state, reducedMotion, currentFrameRef]);

  return ref;
}

export default function App() {
  const [status, setStatus] = useState<PetStatus>(localPreviewStatus);
  const [isPickerOpen, setPickerOpen] = useState(() => initialSearchParam("picker"));
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const [isResizing, setResizing] = useState(false);
  const [mascotWidth, setMascotWidth] = useState(defaultMascotWidthPx);
  const [petPreviews, setPetPreviews] = useState<Record<string, string | null>>({});
  const [switchingPetId, setSwitchingPetId] = useState<string | null>(null);
  const [codexPetImports, setCodexPetImports] = useState<CodexPetImportCandidate[]>([]);
  const [isLoadingCodexImports, setLoadingCodexImports] = useState(false);
  const [importingCodexFolder, setImportingCodexFolder] = useState<string | null>(null);
  const [codexImportMessage, setCodexImportMessage] = useState<string | null>(null);
  const [localPetManagement, setLocalPetManagement] = useState<LocalPetManagementItem[]>([]);
  const [isLoadingLocalPetManagement, setLoadingLocalPetManagement] = useState(false);
  const [deletingLocalPetFolder, setDeletingLocalPetFolder] = useState<string | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null);
  const [petManagementMessage, setPetManagementMessage] = useState<string | null>(null);
  const [currentBubble, setCurrentBubble] = useState<ActiveBubble | null>(null);
  const [settings, setSettings] = useState<DesktopPetSettings>(defaultDesktopPetSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(() => initialSearchParam("settings"));
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pendingResizeRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pickerCloseTimerRef = useRef<number | null>(null);
  const visualInsetsFrameRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const behaviorQueueTimerRef = useRef<number | null>(null);
  const behaviorQueueRef = useRef(new BehaviorEventQueue<QueuedLifestyleEvent>());
  const bubbleIdRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const idleLongTimerRef = useRef<number | null>(null);
  const longSessionTimerRef = useRef<number | null>(null);
  const nightComfortTimerRef = useRef<number | null>(null);
  const dragLongTimerRef = useRef<number | null>(null);
  const clickTimesRef = useRef<number[]>([]);
  const sessionStartedAtRef = useRef(Date.now());
  const lastBubbleAtRef = useRef<Partial<Record<BubbleScene, number>>>({});
  const lastSelectedPetIdRef = useRef<string | null>(null);
  const hasManualSettingsRef = useRef(false);
  const currentFrameRef = useRef<Frame>({ row: 0, column: 0, durationMs: 280 });
  const hitImageRef = useRef<HTMLImageElement | null>(null);
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitFrameDataRef = useRef<HitFrameData>({ key: "", pixels: null });
  const pointerPassthroughRef = useRef<boolean | null>(null);
  const reducedMotion = useReducedMotion();
  const avatarRef = useFrameAnimation(status.state, reducedMotion, currentFrameRef);
  const selected = status.selectedPet;
  const interactionMode = settings.interactionMode;
  const isOverlayOpen = isPickerOpen || isSettingsOpen;

  const setPointerPassthrough = (enabled: boolean) => {
    if (pointerPassthroughRef.current === enabled) return;
    pointerPassthroughRef.current = enabled;
    void desktopPetApi.setPointerPassthrough(enabled);
  };

  const clearBubbleTimer = () => {
    if (bubbleTimerRef.current === null) return;
    window.clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = null;
  };

  const clearIdleTimer = () => {
    if (idleTimerRef.current === null) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  };

  const clearIdleLongTimer = () => {
    if (idleLongTimerRef.current === null) return;
    window.clearTimeout(idleLongTimerRef.current);
    idleLongTimerRef.current = null;
  };

  const clearLongSessionTimer = () => {
    if (longSessionTimerRef.current === null) return;
    window.clearTimeout(longSessionTimerRef.current);
    longSessionTimerRef.current = null;
  };

  const clearNightComfortTimer = () => {
    if (nightComfortTimerRef.current === null) return;
    window.clearTimeout(nightComfortTimerRef.current);
    nightComfortTimerRef.current = null;
  };

  const clearDragLongTimer = () => {
    if (dragLongTimerRef.current === null) return;
    window.clearTimeout(dragLongTimerRef.current);
    dragLongTimerRef.current = null;
  };

  const clearBehaviorQueueTimer = () => {
    if (behaviorQueueTimerRef.current === null) return;
    window.clearTimeout(behaviorQueueTimerRef.current);
    behaviorQueueTimerRef.current = null;
  };

  const clearBehaviorQueue = () => {
    clearBehaviorQueueTimer();
    behaviorQueueRef.current.clear();
  };

  const clearBubbleAndQueue = () => {
    clearBubbleTimer();
    clearBehaviorQueue();
    setCurrentBubble(null);
  };

  const enterSleepMode = () => {
    clearIdleTimer();
    clearIdleLongTimer();
    clearLongSessionTimer();
    clearNightComfortTimer();
    clearDragLongTimer();
    clearBubbleAndQueue();
    void desktopPetApi.setState("idle");
  };

  const showBubble = useCallback(
    (
      scene: BubbleScene,
      options: {
        force?: boolean;
        cooldownMs?: number;
        pet?: PetOption | null;
        cadence?: BubbleCadence;
      } = {},
    ) => {
      if (!settings.speechBubblesEnabled) return false;
      if (isOverlayOpen && !options.force) return false;

      const now = Date.now();
      const cooldownMs = options.force ? 0 : options.cooldownMs ?? bubbleCooldownMs[scene];
      const lastAt = lastBubbleAtRef.current[scene] ?? 0;
      if (now - lastAt < cooldownMs) return false;

      const id = bubbleIdRef.current + 1;
      bubbleIdRef.current = id;
      lastBubbleAtRef.current = {
        ...lastBubbleAtRef.current,
        [scene]: now,
      };
      clearBubbleTimer();
      setCurrentBubble({
        id,
        scene,
        text: bubbleTextForPet(options.pet ?? selected, scene, {
          cadence: options.cadence,
        }),
      });
      bubbleTimerRef.current = window.setTimeout(() => {
        bubbleTimerRef.current = null;
        setCurrentBubble((bubble) => bubble?.id === id ? null : bubble);
      }, bubbleDurationMs);
      return true;
    },
    [isOverlayOpen, selected, settings.speechBubblesEnabled],
  );

  const applyLifestyleDecision = useCallback(
    (
      decision: LifestyleDecision,
      options: { forceBubble?: boolean; pet?: PetOption | null } = {},
    ) => {
      if (!decision.shouldAct) return false;

      let didAct = false;
      const bubbleScene = speechBubbleSceneForDecision(decision, settings);
      if (bubbleScene) {
        didAct = showBubble(bubbleScene, {
          force: options.forceBubble,
          cooldownMs: bubbleCooldownForDecision(decision),
          pet: options.pet,
          cadence: decision.bubbleCadence,
        }) || didAct;
      }

      if (decision.state) {
        didAct = true;
        void desktopPetApi.setState(decision.state, decision.durationMs);
      }

      return didAct;
    },
    [settings, showBubble],
  );

  const playQueuedLifestyleItem = useCallback(
    (item: QueuedLifestyleEvent): boolean => {
      clearBehaviorQueueTimer();
      const didAct = applyLifestyleDecision(item.decision, {
        forceBubble: item.forceBubble,
        pet: item.pet,
      });

      const activeMs = item.activeMs ?? 0;
      if (!didAct || activeMs <= 0) {
        const next = behaviorQueueRef.current.completeActive();
        if (next.action === "play" && next.item) {
          return playQueuedLifestyleItem(next.item);
        }
        return didAct;
      }

      behaviorQueueTimerRef.current = window.setTimeout(() => {
        behaviorQueueTimerRef.current = null;
        const next = behaviorQueueRef.current.completeActive();
        if (next.action === "play" && next.item) {
          playQueuedLifestyleItem(next.item);
        }
      }, activeMs);

      return true;
    },
    [applyLifestyleDecision],
  );

  const playLifestyleEvent = useCallback(
    (
      event: PetEvent,
      options: {
        forceBubble?: boolean;
        interactionMode?: InteractionMode;
        pet?: PetOption | null;
      } = {},
    ) => {
      const pet = options.pet ?? selected;
      const decision = decideLifestyleEvent(event, {
        interactionMode: options.interactionMode ?? interactionMode,
        proactiveEventsEnabled: settings.proactiveEventsEnabled,
        pet,
      });
      const result = behaviorQueueRef.current.enqueue({
        decision,
        activeMs: activeHoldMsForDecision(decision, {
          bubbleDurationMs,
          speechBubblesEnabled: settings.speechBubblesEnabled,
        }),
        forceBubble: options.forceBubble,
        pet,
      });
      if (result.action !== "play" || !result.item) return false;
      return playQueuedLifestyleItem(result.item);
    },
    [
      interactionMode,
      playQueuedLifestyleItem,
      selected,
      settings.proactiveEventsEnabled,
      settings.speechBubblesEnabled,
    ],
  );

  const maybePlayRareEvent = useCallback(
    (reason: RareTrigger) => {
      if (Math.random() >= rareChanceForTrigger(reason)) return false;
      return playLifestyleEvent({ type: "rare", reason });
    },
    [playLifestyleEvent],
  );

  const scheduleIdleBubble = useCallback(() => {
    clearIdleTimer();
    if (!settingsLoaded) return;
    if (!canScheduleProactiveEvents(settings)) return;
    const delayMs = idleDelayMsForMode(interactionMode);
    if (delayMs === null) return;
    if (isOverlayOpen || dragRef.current || resizeRef.current) return;

    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (isOverlayOpen || dragRef.current || resizeRef.current) return;
      playLifestyleEvent({ type: "idle-timeout" });
      scheduleIdleBubble();
    }, delayMs);
  }, [interactionMode, isOverlayOpen, playLifestyleEvent, settings, settingsLoaded]);

  const scheduleIdleLongBubble = useCallback(() => {
    clearIdleLongTimer();
    if (!settingsLoaded) return;
    if (!canScheduleProactiveEvents(settings)) return;
    const delayMs = idleLongDelayMsForMode(interactionMode);
    if (delayMs === null) return;
    if (isOverlayOpen || dragRef.current || resizeRef.current) return;

    idleLongTimerRef.current = window.setTimeout(() => {
      idleLongTimerRef.current = null;
      if (!isOverlayOpen && !dragRef.current && !resizeRef.current) {
        playLifestyleEvent({ type: "idle-long" });
        maybePlayRareEvent("idle-long");
      }
      scheduleIdleLongBubble();
    }, delayMs);
  }, [
    interactionMode,
    isOverlayOpen,
    maybePlayRareEvent,
    playLifestyleEvent,
    settings,
    settingsLoaded,
  ]);

  const scheduleLongSessionReminder = useCallback(() => {
    clearLongSessionTimer();
    if (!settingsLoaded) return;
    if (!canScheduleProactiveEvents(settings)) return;
    const delayMs = longSessionDelayMsForMode(interactionMode);
    if (delayMs === null || isOverlayOpen) return;

    longSessionTimerRef.current = window.setTimeout(() => {
      longSessionTimerRef.current = null;
      if (!isOverlayOpen && !dragRef.current && !resizeRef.current) {
        const sessionMinutes = Math.max(
          1,
          Math.round((Date.now() - sessionStartedAtRef.current) / minuteMs),
        );
        playLifestyleEvent({ type: "long-session", sessionMinutes });
      }
      scheduleLongSessionReminder();
    }, delayMs);
  }, [interactionMode, isOverlayOpen, playLifestyleEvent, settings, settingsLoaded]);

  const scheduleNightComfortReminder = useCallback(() => {
    clearNightComfortTimer();
    if (!settingsLoaded) return;
    if (!canScheduleProactiveEvents(settings)) return;
    const intervalMs = nightComfortDelayMsForMode(interactionMode);
    if (intervalMs === null || isOverlayOpen) return;

    nightComfortTimerRef.current = window.setTimeout(() => {
      nightComfortTimerRef.current = null;
      if (!isOverlayOpen && !dragRef.current && !resizeRef.current) {
        playLifestyleEvent({ type: "comfort", reason: "night" });
        maybePlayRareEvent("night");
      }
      scheduleNightComfortReminder();
    }, msUntilNextNightComfort(Date.now(), intervalMs));
  }, [
    interactionMode,
    isOverlayOpen,
    maybePlayRareEvent,
    playLifestyleEvent,
    settings,
    settingsLoaded,
  ]);

  const resetIdleBubbleTimer = useCallback(() => {
    scheduleIdleBubble();
    scheduleIdleLongBubble();
  }, [scheduleIdleBubble, scheduleIdleLongBubble]);

  useEffect(() => {
    void desktopPetApi.getStatus().then(setStatus);
    return desktopPetApi.onStatusChanged(setStatus);
  }, []);

  useEffect(() => {
    let disposed = false;
    void desktopPetApi.getSettings()
      .then((savedSettings) => {
        if (!disposed && !hasManualSettingsRef.current) {
          setSettings(savedSettings);
        }
        if (!disposed) setSettingsLoaded(true);
      })
      .catch(() => {
        if (!disposed) setSettingsLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() =>
    desktopPetApi.onOpenPetPicker(() => {
      setSettingsOpen(false);
      setPickerOpen(true);
    }), []);

  useEffect(() =>
    desktopPetApi.onOpenPetSettings(() => {
      setPickerOpen(false);
      setSettingsOpen(true);
    }), []);

  useEffect(() => {
    if (settings.speechBubblesEnabled) return;
    clearBubbleAndQueue();
  }, [settings.speechBubblesEnabled]);

  useEffect(() => {
    if (interactionMode !== "sleep") return;
    enterSleepMode();
  }, [interactionMode]);

  useEffect(() => {
    let disposed = false;

    if (isOverlayOpen) setPointerPassthrough(true);
    if (isOverlayOpen) {
      clearIdleTimer();
      clearIdleLongTimer();
      clearLongSessionTimer();
      clearNightComfortTimer();
      clearBubbleTimer();
      clearBehaviorQueue();
      setCurrentBubble(null);
      if (!isPickerOpen) setPickerVisible(false);
      void desktopPetApi.setPickerOpen(true).then(() => {
        if (!isPickerOpen) return;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (!disposed) setPickerVisible(true);
          });
        });
      });
    } else {
      setPickerVisible(false);
      void desktopPetApi.setPickerOpen(false);
      scheduleIdleBubble();
      scheduleIdleLongBubble();
      scheduleLongSessionReminder();
      scheduleNightComfortReminder();
    }
    return () => {
      disposed = true;
    };
  }, [
    isOverlayOpen,
    isPickerOpen,
    scheduleIdleBubble,
    scheduleIdleLongBubble,
    scheduleLongSessionReminder,
    scheduleNightComfortReminder,
  ]);

  useEffect(() => {
    if (!selected?.id || isOverlayOpen) return;
    if (!settingsLoaded) return;
    if (!canScheduleProactiveEvents(settings)) return;
    if (lastSelectedPetIdRef.current === selected.id) return;
    lastSelectedPetIdRef.current = selected.id;

    const timer = window.setTimeout(() => {
      void playLifestyleEvent({ type: "welcome" }, { forceBubble: true });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [isOverlayOpen, selected?.id, playLifestyleEvent, settings, settingsLoaded]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isPickerOpen) return;
    let disposed = false;

    for (const pet of status.pets) {
      if (Object.prototype.hasOwnProperty.call(petPreviews, pet.id)) continue;
      void desktopPetApi.getPetPreview(pet.id).then((previewUrl) => {
        if (disposed) return;
        setPetPreviews((current) =>
          Object.prototype.hasOwnProperty.call(current, pet.id)
            ? current
            : { ...current, [pet.id]: previewUrl },
        );
      });
    }

    return () => {
      disposed = true;
    };
  }, [isPickerOpen, petPreviews, status.pets]);

  useEffect(() => {
    if (!isPickerOpen) return;
    let disposed = false;
    setLoadingCodexImports(true);
    void desktopPetApi.listCodexPetImports()
      .then((candidates) => {
        if (!disposed) setCodexPetImports(candidates);
      })
      .catch(() => {
        if (!disposed) setCodexPetImports([]);
      })
      .finally(() => {
        if (!disposed) setLoadingCodexImports(false);
      });
    return () => {
      disposed = true;
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isPickerOpen) return;
    let disposed = false;
    setLoadingLocalPetManagement(true);
    void desktopPetApi.listLocalPetManagement()
      .then((pets) => {
        if (!disposed) setLocalPetManagement(pets);
      })
      .catch(() => {
        if (!disposed) setLocalPetManagement([]);
      })
      .finally(() => {
        if (!disposed) setLoadingLocalPetManagement(false);
      });
    return () => {
      disposed = true;
    };
  }, [isPickerOpen]);

  useEffect(() => {
    setPendingDeleteFolder(null);
  }, [selected?.id]);

  useEffect(() => {
    const livePetIds = new Set(status.pets.map((pet) => pet.id));
    setPetPreviews((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([petId]) => livePetIds.has(petId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    if (switchingPetId && !livePetIds.has(switchingPetId)) setSwitchingPetId(null);
  }, [status.pets, switchingPetId]);

  useEffect(() => {
    void setPointerPassthrough(true);
    return () => {
      clearIdleTimer();
      clearIdleLongTimer();
      clearLongSessionTimer();
      clearNightComfortTimer();
      clearDragLongTimer();
      clearBubbleTimer();
      clearBehaviorQueue();
      void desktopPetApi.setPointerPassthrough(false);
    };
  }, []);

  useEffect(() => {
    scheduleIdleBubble();
    return clearIdleTimer;
  }, [scheduleIdleBubble]);

  useEffect(() => {
    scheduleIdleLongBubble();
    return clearIdleLongTimer;
  }, [scheduleIdleLongBubble]);

  useEffect(() => {
    scheduleLongSessionReminder();
    return clearLongSessionTimer;
  }, [scheduleLongSessionReminder]);

  useEffect(() => {
    scheduleNightComfortReminder();
    return clearNightComfortTimer;
  }, [scheduleNightComfortReminder]);

  useEffect(() => {
    hitFrameDataRef.current = { key: "", pixels: null };
    hitImageRef.current = null;

    if (!selected?.spritesheetUrl) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      hitImageRef.current = image;
      hitFrameDataRef.current = { key: "", pixels: null };
      updateVisualInsets(image);
    };
    image.src = selected.spritesheetUrl;
  }, [selected?.spritesheetUrl]);

  useEffect(() => {
    const image = hitImageRef.current;
    if (!image) return;
    updateVisualInsets(image);
  }, [mascotWidth]);

  useEffect(() => {
    if (isOverlayOpen) return;
    const image = hitImageRef.current;
    if (!image) return;
    updateVisualInsets(image);
  }, [isOverlayOpen]);

  useEffect(() => {
    return () => {
      void desktopPetApi.stopWindowDrag();
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
      if (pickerCloseTimerRef.current !== null) window.clearTimeout(pickerCloseTimerRef.current);
      if (visualInsetsFrameRef.current !== null) {
        window.cancelAnimationFrame(visualInsetsFrameRef.current);
      }
      clearBehaviorQueue();
    };
  }, []);

  const setLocalState = (state: PetState) => {
    setStatus((current) => current.state === state ? current : { ...current, state });
  };

  const closePetPicker = () => {
    setPickerOpen(false);
  };

  const registerPetClick = (now = Date.now()) => {
    const recentClicks = clickTimesRef.current.filter((clickedAt) =>
      now - clickedAt <= clickComboWindowMs
    );
    recentClicks.push(now);
    clickTimesRef.current = recentClicks;
    return recentClicks.length;
  };

  const scheduleDragLongFeedback = () => {
    clearDragLongTimer();
    const thresholdMs = dragLongThresholdMsForMode(interactionMode);
    dragLongTimerRef.current = window.setTimeout(() => {
      dragLongTimerRef.current = null;
      const drag = dragRef.current;
      if (!drag?.hasMoved) return;
      void playLifestyleEvent({
        type: "drag-long",
        dragMs: Date.now() - drag.startedAt,
      }, { forceBubble: true });
    }, thresholdMs);
  };

  const selectPet = async (id: string) => {
    setSwitchingPetId(id);
    const pet = await desktopPetApi.selectPet(id);
    if (pet) {
      setStatus((current) => ({
        ...current,
        selectedPet: pet,
      }));
      clearBehaviorQueue();
      void playLifestyleEvent({ type: "pet-switched" }, { forceBubble: true, pet });
      lastSelectedPetIdRef.current = pet.id;
    } else {
      void desktopPetApi.setState("failed", 1800);
    }
    if (pickerCloseTimerRef.current !== null) window.clearTimeout(pickerCloseTimerRef.current);
    pickerCloseTimerRef.current = window.setTimeout(() => {
      pickerCloseTimerRef.current = null;
      setSwitchingPetId(null);
      closePetPicker();
    }, 320);
  };

  const refreshCodexPetImports = () => {
    setLoadingCodexImports(true);
    void desktopPetApi.listCodexPetImports()
      .then(setCodexPetImports)
      .catch(() => setCodexPetImports([]))
      .finally(() => setLoadingCodexImports(false));
  };

  const refreshLocalPetManagement = () => {
    setLoadingLocalPetManagement(true);
    void desktopPetApi.listLocalPetManagement()
      .then(setLocalPetManagement)
      .catch(() => setLocalPetManagement([]))
      .finally(() => setLoadingLocalPetManagement(false));
  };

  const importCodexPet = async (folderName: string) => {
    setImportingCodexFolder(folderName);
    setCodexImportMessage(null);
    try {
      const result = await desktopPetApi.importCodexPet(folderName);
      setCodexImportMessage(result.message);

      if (result.ok) {
        const nextStatus = result.statusSnapshot ?? await desktopPetApi.getStatus();
        setStatus(nextStatus);
        const importedPet = result.selectedPet ?? nextStatus.selectedPet;
        if (importedPet?.id) lastSelectedPetIdRef.current = importedPet.id;
        clearBehaviorQueue();
        void playLifestyleEvent(
          { type: "import-finished", ok: true },
          { forceBubble: true, pet: importedPet },
        );
        if (result.management) setLocalPetManagement(result.management);
        else refreshLocalPetManagement();
        refreshCodexPetImports();
        return;
      }

      clearBehaviorQueue();
      void playLifestyleEvent({ type: "import-finished", ok: false }, { forceBubble: true });
      refreshCodexPetImports();
    } finally {
      setImportingCodexFolder(null);
    }
  };

  const deleteLocalPet = async (folderName: string) => {
    if (pendingDeleteFolder !== folderName) {
      setPendingDeleteFolder(folderName);
      setPetManagementMessage("再点一次确认删除本地导入宠物。");
      return;
    }

    setDeletingLocalPetFolder(folderName);
    setPetManagementMessage(null);
    try {
      const result = await desktopPetApi.deleteLocalPet(folderName);
      setPetManagementMessage(result.message);
      setPendingDeleteFolder(null);

      if (result.management) setLocalPetManagement(result.management);
      else refreshLocalPetManagement();

      if (result.statusSnapshot) setStatus(result.statusSnapshot);
      if (result.ok && result.petId) {
        const deletedPetId = result.petId;
        setPetPreviews((current) => {
          const { [deletedPetId]: _deletedPreview, ...rest } = current;
          return rest;
        });
        refreshCodexPetImports();
      }
    } finally {
      setDeletingLocalPetFolder(null);
    }
  };

  const queueResizeMascot = (widthPx: number) => {
    pendingResizeRef.current = widthPx;
    if (resizeFrameRef.current !== null) return;

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const pending = pendingResizeRef.current;
      pendingResizeRef.current = null;
      if (pending != null) void desktopPetApi.resizeMascot(pending);
    });
  };

  useEffect(() => {
    if (!settingsLoaded || resizeRef.current) return;
    const nextWidth = snapMascotWidth(settings.mascotWidthPx);
    setMascotWidth((current) => current === nextWidth ? current : nextWidth);
    queueResizeMascot(nextWidth);
  }, [settingsLoaded, settings.mascotWidthPx]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    resetIdleBubbleTimer();
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest(".no-drag")) return;
    if (!isMascotHit(event.clientX, event.clientY)) {
      setPointerPassthrough(true);
      return;
    }

    event.preventDefault();
    setPointerPassthrough(false);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void desktopPetApi.startWindowDrag({
      pointerWindowX: event.clientX,
      pointerWindowY: event.clientY,
    });
    dragRef.current = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
      startedAt: Date.now(),
      hasMoved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.screenX - drag.screenX;
    const deltaY = event.screenY - drag.screenY;
    if (Math.abs(deltaX) < dragThresholdPx && Math.abs(deltaY) < dragThresholdPx) return;

    if (!drag.hasMoved) {
      void playLifestyleEvent({ type: "pet-dragged" });
      scheduleDragLongFeedback();
    }
    drag.hasMoved = true;
    drag.screenX = event.screenX;
    drag.screenY = event.screenY;
    setLocalState(deltaX >= 0 ? "running-right" : "running-left");
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>, shouldWave: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    clearDragLongTimer();
    void desktopPetApi.stopWindowDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);

    if (!drag.hasMoved && shouldWave) {
      const clickCount = registerPetClick();
      const clickEvent: PetEvent = clickCount >= clickComboThreshold
        ? { type: "click-combo", clickCount }
        : { type: "pet-clicked" };
      void playLifestyleEvent(clickEvent);
      if (clickCount >= rareClickComboThreshold) maybePlayRareEvent("click-combo");
      resetIdleBubbleTimer();
      return;
    }
    clickTimesRef.current = [];
    void playLifestyleEvent({ type: "pet-dragged" });
    void desktopPetApi.setState("idle");
    resetIdleBubbleTimer();
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    resetIdleBubbleTimer();
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    clearBehaviorQueue();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startWidthPx: mascotWidth,
      currentWidthPx: mascotWidth,
    };
    setPointerPassthrough(false);
    setResizing(true);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const nextWidth = snapMascotWidth(
      resize.startWidthPx + event.screenX - resize.startScreenX,
    );
    resize.currentWidthPx = nextWidth;
    setMascotWidth((current) => current === nextWidth ? current : nextWidth);
    queueResizeMascot(nextWidth);
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setResizing(false);
    updatePetSettings({ mascotWidthPx: resize.currentWidthPx });
  };

  const onMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    resetIdleBubbleTimer();
    if (dragRef.current || resizeRef.current) {
      setPointerPassthrough(false);
      return;
    }
    setPointerPassthrough(!isInteractiveHit(event));
  };

  const onMouseLeave = () => {
    if (!dragRef.current && !resizeRef.current) setPointerPassthrough(true);
  };

  const isInteractiveHit = (event: ReactMouseEvent<HTMLElement>) => {
    if (isMascotHit(event.clientX, event.clientY)) return true;
    return event.target instanceof Element && Boolean(event.target.closest(interactiveHitSelector));
  };

  const isMascotHit = (clientX: number, clientY: number) => {
    const mascot = avatarRef.current?.parentElement;
    if (!mascot) return false;

    const rect = mascot.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const x = Math.floor(((clientX - rect.left) / rect.width) * atlas.cellWidth);
    const y = Math.floor(((clientY - rect.top) / rect.height) * atlas.cellHeight);
    const pixels = currentHitFramePixels();
    if (!pixels) return fallbackMascotHit(x, y);

    const index = (y * atlas.cellWidth + x) * 4 + 3;
    return pixels[index] > 24;
  };

  const currentHitFramePixels = () => {
    const image = hitImageRef.current;
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return null;

    const frame = currentFrameRef.current;
    const key = `${selected?.id ?? ""}:${frame.row}:${frame.column}`;
    if (hitFrameDataRef.current.key === key) return hitFrameDataRef.current.pixels;

    try {
      const canvas = hitCanvasRef.current ?? document.createElement("canvas");
      canvas.width = atlas.cellWidth;
      canvas.height = atlas.cellHeight;
      hitCanvasRef.current = canvas;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        frame.column * atlas.cellWidth,
        frame.row * atlas.cellHeight,
        atlas.cellWidth,
        atlas.cellHeight,
        0,
        0,
        atlas.cellWidth,
        atlas.cellHeight,
      );
      const pixels = context.getImageData(0, 0, atlas.cellWidth, atlas.cellHeight).data;
      hitFrameDataRef.current = { key, pixels };
      return pixels;
    } catch {
      hitFrameDataRef.current = { key, pixels: null };
      return null;
    }
  };

  const updatePetSettings = (patch: Partial<DesktopPetSettings>) => {
    hasManualSettingsRef.current = true;
    setSettingsLoaded(true);
    setSettings((current) => ({ ...current, ...patch }));
    void desktopPetApi.updateSettings(patch)
      .then((savedSettings) => setSettings(savedSettings))
      .catch(() => undefined);
  };

  const updateSpeechBubblesEnabled = (enabled: boolean) => {
    updatePetSettings({ speechBubblesEnabled: enabled });
    if (!enabled) {
      clearBubbleTimer();
      setCurrentBubble(null);
    }
  };

  const updateProactiveEventsEnabled = (enabled: boolean) => {
    updatePetSettings({ proactiveEventsEnabled: enabled });
    if (!enabled) {
      clearIdleTimer();
      clearIdleLongTimer();
      clearLongSessionTimer();
      clearNightComfortTimer();
      clearBehaviorQueue();
    }
  };

  const updateMascotWidthSetting = (widthPx: number) => {
    const nextWidth = snapMascotWidth(widthPx);
    setMascotWidth((current) => current === nextWidth ? current : nextWidth);
    queueResizeMascot(nextWidth);
    updatePetSettings({ mascotWidthPx: nextWidth });
  };

  const updateOpacitySetting = (opacity: number) => {
    if (!Number.isFinite(opacity)) return;
    const nextOpacity = clamp(Math.round(opacity * 100) / 100, 0.35, 1);
    updatePetSettings({ opacity: nextOpacity });
  };

  const updateInteractionMode = (next: InteractionMode) => {
    const previous = interactionMode;
    updatePetSettings({ interactionMode: next });

    if (next === "sleep") {
      enterSleepMode();
      return;
    }

    if (previous === "sleep") {
      clearBehaviorQueue();
      void playLifestyleEvent(
        { type: "wake" },
        { interactionMode: next, forceBubble: true },
      );
    }
  };

  const toggleSleepMode = () => {
    const next = interactionMode === "sleep" ? defaultInteractionMode : "sleep";
    updateInteractionMode(next);
  };

  const updateVisualInsets = (image: HTMLImageElement) => {
    if (visualInsetsFrameRef.current !== null) {
      window.cancelAnimationFrame(visualInsetsFrameRef.current);
    }
    visualInsetsFrameRef.current = window.requestAnimationFrame(() => {
      visualInsetsFrameRef.current = null;
      const mascot = avatarRef.current?.parentElement;
      if (!mascot) return;

      const bounds = alphaBoundsForAtlas(image);
      if (!bounds) return;

      const rect = mascot.getBoundingClientRect();
      const scaleX = rect.width / atlas.cellWidth;
      const scaleY = rect.height / atlas.cellHeight;
      void desktopPetApi.setVisualInsets({
        left: rect.left + bounds.minX * scaleX,
        top: rect.top + bounds.minY * scaleY,
        right: window.innerWidth - (rect.left + (bounds.maxX + 1) * scaleX),
        bottom: window.innerHeight - (rect.top + (bounds.maxY + 1) * scaleY),
      });
    });
  };

  return (
    <main className="stage">
      <section
        className={`pet-shell ${isDragging ? "is-dragging" : ""} ${isResizing ? "is-resizing" : ""} ${isOverlayOpen ? "is-picker-open is-overlay-open" : ""}`}
        data-avatar-overlay-content-frame="true"
        onContextMenu={(event) => {
          event.preventDefault();
          if (!isInteractiveHit(event)) {
            setPointerPassthrough(true);
            return;
          }
          void desktopPetApi.showContextMenu();
        }}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        onLostPointerCapture={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishDrag(event, true)}
        style={
          {
            "--mascot-width": `${mascotWidth}px`,
            "--mascot-height": `${mascotWidth / mascotAspectRatio}px`,
            "--pet-opacity": settings.opacity,
          } as CSSProperties
        }
      >
        {settings.speechBubblesEnabled && currentBubble && !isOverlayOpen ? (
          <div
            key={currentBubble.id}
            className="speech-bubble"
            data-scene={currentBubble.scene}
            aria-live="polite"
          >
            {currentBubble.text}
          </div>
        ) : null}

        <div
          className="pet-hit-area"
          data-avatar-overlay-hit-region="mascot"
          data-avatar-mascot="true"
          title="Drag pet"
          aria-label="Drag pet"
        >
          {selected?.spritesheetUrl ? (
            <div
              ref={avatarRef}
              className="pet"
              style={{ backgroundImage: `url("${selected.spritesheetUrl}")` }}
              data-state={status.state}
            />
          ) : (
            <div className="empty-pet">?</div>
          )}
          <button
            className="resize-handle no-drag"
            type="button"
            aria-label="Resize pet"
            title="Resize pet"
            onPointerCancel={finishResize}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={finishResize}
          />
        </div>

        {isSettingsOpen ? (
          <PetSettingsPanel
            interactionMode={interactionMode}
            mascotWidth={mascotWidth}
            settings={settings}
            onAlwaysOnTopChange={(enabled) => updatePetSettings({ alwaysOnTopEnabled: enabled })}
            onClose={() => setSettingsOpen(false)}
            onInteractionModeChange={updateInteractionMode}
            onLaunchAtLoginChange={(enabled) => updatePetSettings({ launchAtLoginEnabled: enabled })}
            onMascotWidthChange={updateMascotWidthSetting}
            onOpacityChange={updateOpacitySetting}
            onProactiveEventsChange={updateProactiveEventsEnabled}
            onSpeechBubblesChange={updateSpeechBubblesEnabled}
            onToggleSleepMode={toggleSleepMode}
          />
        ) : null}

        {isPickerVisible ? (
          <PetPicker
            pets={status.pets}
            selected={selected}
            previews={petPreviews}
            switchingPetId={switchingPetId}
            codexImports={codexPetImports}
            isLoadingCodexImports={isLoadingCodexImports}
            importingCodexFolder={importingCodexFolder}
            codexImportMessage={codexImportMessage}
            localPetManagement={localPetManagement}
            isLoadingLocalPetManagement={isLoadingLocalPetManagement}
            deletingLocalPetFolder={deletingLocalPetFolder}
            pendingDeleteFolder={pendingDeleteFolder}
            petManagementMessage={petManagementMessage}
            onClose={closePetPicker}
            onRefreshCodexImports={refreshCodexPetImports}
            onImportCodexPet={(folderName) => void importCodexPet(folderName)}
            onRefreshLocalPetManagement={refreshLocalPetManagement}
            onDeleteLocalPet={(folderName) => void deleteLocalPet(folderName)}
            onSelect={(id) => void selectPet(id)}
          />
        ) : null}
      </section>
    </main>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapMascotWidth(widthPx: number): number {
  const snapped = Math.round(widthPx / mascotWidthStepPx) * mascotWidthStepPx;
  return clamp(snapped, minMascotWidthPx, maxMascotWidthPx);
}

function fallbackMascotHit(x: number, y: number): boolean {
  const dx = (x - atlas.cellWidth / 2) / (atlas.cellWidth * 0.36);
  const dy = (y - atlas.cellHeight * 0.55) / (atlas.cellHeight * 0.42);
  return dx * dx + dy * dy <= 1;
}

function alphaBoundsForAtlas(image: HTMLImageElement): AlphaBounds | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = atlas.columns * atlas.cellWidth;
    canvas.height = atlas.rows * atlas.cellHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bounds: AlphaBounds = {
      minX: atlas.cellWidth,
      minY: atlas.cellHeight,
      maxX: 0,
      maxY: 0,
    };

    for (let y = 0; y < canvas.height; y += 1) {
      const cellY = y % atlas.cellHeight;
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha <= 24) continue;
        const cellX = x % atlas.cellWidth;
        bounds.minX = Math.min(bounds.minX, cellX);
        bounds.minY = Math.min(bounds.minY, cellY);
        bounds.maxX = Math.max(bounds.maxX, cellX);
        bounds.maxY = Math.max(bounds.maxY, cellY);
      }
    }

    if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) return null;
    return bounds;
  } catch {
    return null;
  }
}

function PetSettingsPanel({
  interactionMode,
  mascotWidth,
  settings,
  onAlwaysOnTopChange,
  onClose,
  onInteractionModeChange,
  onLaunchAtLoginChange,
  onMascotWidthChange,
  onOpacityChange,
  onProactiveEventsChange,
  onSpeechBubblesChange,
  onToggleSleepMode,
}: {
  interactionMode: InteractionMode;
  mascotWidth: number;
  settings: DesktopPetSettings;
  onAlwaysOnTopChange: (enabled: boolean) => void;
  onClose: () => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onMascotWidthChange: (widthPx: number) => void;
  onOpacityChange: (opacity: number) => void;
  onProactiveEventsChange: (enabled: boolean) => void;
  onSpeechBubblesChange: (enabled: boolean) => void;
  onToggleSleepMode: () => void;
}) {
  return (
    <aside
      className="settings-panel no-drag"
      id="pet-settings-panel"
      role="group"
      aria-label="桌宠设置"
    >
      <header className="settings-panel-header">
        <strong>设置</strong>
        <button className="icon-button" type="button" aria-label="关闭设置" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="settings-grid">
        <label className="setting-field">
          <span>
            大小
            <output>{mascotWidth}px</output>
          </span>
          <input
            type="range"
            min={minMascotWidthPx}
            max={maxMascotWidthPx}
            step={mascotWidthStepPx}
            value={mascotWidth}
            onChange={(event) => onMascotWidthChange(Number(event.currentTarget.value))}
          />
        </label>
        <label className="setting-field">
          <span>
            透明
            <output>{Math.round(settings.opacity * 100)}%</output>
          </span>
          <input
            type="range"
            min="0.35"
            max="1"
            step="0.05"
            value={settings.opacity}
            onChange={(event) => onOpacityChange(Number(event.currentTarget.value))}
          />
        </label>
        <label className="setting-field setting-field-wide">
          <span>互动</span>
          <select
            value={interactionMode}
            onChange={(event) =>
              onInteractionModeChange(event.currentTarget.value as InteractionMode)}
          >
            {(["quiet", "standard", "lively", "sleep"] as InteractionMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {interactionModeLabels[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="setting-toggles">
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={settings.alwaysOnTopEnabled}
            onChange={(event) => onAlwaysOnTopChange(event.currentTarget.checked)}
          />
          <span>置顶</span>
        </label>
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={settings.launchAtLoginEnabled}
            onChange={(event) => onLaunchAtLoginChange(event.currentTarget.checked)}
          />
          <span>自启</span>
        </label>
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={settings.speechBubblesEnabled}
            onChange={(event) => onSpeechBubblesChange(event.currentTarget.checked)}
          />
          <span>气泡</span>
        </label>
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={settings.proactiveEventsEnabled}
            onChange={(event) => onProactiveEventsChange(event.currentTarget.checked)}
          />
          <span>主动提醒</span>
        </label>
      </div>

      <button className="sleep-toggle" type="button" onClick={onToggleSleepMode}>
        {interactionMode === "sleep" ? "唤醒" : "睡觉"}
      </button>
    </aside>
  );
}

function PetPicker({
  pets,
  selected,
  previews,
  switchingPetId,
  codexImports,
  isLoadingCodexImports,
  importingCodexFolder,
  codexImportMessage,
  localPetManagement,
  isLoadingLocalPetManagement,
  deletingLocalPetFolder,
  pendingDeleteFolder,
  petManagementMessage,
  onClose,
  onSelect,
  onRefreshCodexImports,
  onImportCodexPet,
  onRefreshLocalPetManagement,
  onDeleteLocalPet,
}: {
  pets: PetOption[];
  selected: PetOption | null;
  previews: Record<string, string | null>;
  switchingPetId: string | null;
  codexImports: CodexPetImportCandidate[];
  isLoadingCodexImports: boolean;
  importingCodexFolder: string | null;
  codexImportMessage: string | null;
  localPetManagement: LocalPetManagementItem[];
  isLoadingLocalPetManagement: boolean;
  deletingLocalPetFolder: string | null;
  pendingDeleteFolder: string | null;
  petManagementMessage: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRefreshCodexImports: () => void;
  onImportCodexPet: (folderName: string) => void;
  onRefreshLocalPetManagement: () => void;
  onDeleteLocalPet: (folderName: string) => void;
}) {
  const pageSize = 5;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageDirection, setPageDirection] = useState<"next" | "previous">("next");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "builtin" | "imported">("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const factionOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const pet of pets) {
      const label = factionLabelForPet(pet);
      if (label) labels.add(label);
    }
    return [...labels].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }, [pets]);
  const filteredPets = useMemo(
    () =>
      pets.filter((pet) =>
        petMatchesSearch(pet, searchQuery) &&
        (sourceFilter === "all" || petKindForPicker(pet) === sourceFilter) &&
        (factionFilter === "all" || factionLabelForPet(pet) === factionFilter),
      ),
    [factionFilter, pets, searchQuery, sourceFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredPets.length / pageSize));
  const visibleStart =
    pageIndex === pageCount - 1 && filteredPets.length > pageSize
      ? Math.max(0, filteredPets.length - pageSize)
      : pageIndex * pageSize;
  const visiblePets = filteredPets.slice(visibleStart, visibleStart + pageSize);
  const visibleSlots = Array.from({ length: pageSize }, (_, index) => visiblePets[index] ?? null);
  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex < pageCount - 1;
  const selectedManagement = selected
    ? localPetManagement.find((pet) => pet.petId === selected.id) ?? null
    : null;
  const selectedKind = selectedManagement?.kind ?? selected?.localKind ?? "builtin";
  const selectedFolderName = selectedManagement?.folderName ?? null;
  const canDeleteSelected = Boolean(selectedManagement?.canDelete && selectedFolderName);
  const isDeletePending = selectedFolderName !== null && pendingDeleteFolder === selectedFolderName;
  const isDeletingSelected =
    selectedFolderName !== null && deletingLocalPetFolder === selectedFolderName;
  const selectedResourceHealth = selected ? manifestResourceHealthLabel(selected) : null;

  useEffect(() => {
    const selectedIndex = filteredPets.findIndex((pet) => pet.id === selected?.id);
    if (selectedIndex >= 0) {
      setPageIndex(Math.floor(selectedIndex / pageSize));
      return;
    }
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [filteredPets, pageCount, selected?.id]);

  useEffect(() => {
    setPageDirection("next");
    setPageIndex(0);
  }, [factionFilter, searchQuery, sourceFilter]);

  const goBack = () => {
    setPageDirection("previous");
    setPageIndex((current) => Math.max(0, current - 1));
  };
  const goForward = () => {
    setPageDirection("next");
    setPageIndex((current) => Math.min(pageCount - 1, current + 1));
  };

  return (
    <aside className="picker no-drag" aria-label="Choose pet">
      <header className="picker-header">
        <button className="icon-button" type="button" aria-label="Close picker" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="pet-carousel">
        <button
          className="carousel-button"
          type="button"
          aria-label="Previous pet page"
          disabled={!canGoBack}
          onClick={goBack}
        >
          &lt;
        </button>

        <div
          className="pet-row"
          key={pageIndex}
          data-direction={pageDirection}
          data-hover-index={hoveredIndex ?? undefined}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          {visibleSlots.map((pet, index) => {
            const slotStyle = {
              "--arc-y": `${arcOffset(index, pageSize)}px`,
              "--card-index": index,
              "--card-z": cardDepth(index),
            } as CSSProperties;

            if (!pet) {
              return (
                <span
                  key={`empty-slot:${pageIndex}:${index}`}
                  className="pet-card pet-card-empty"
                  style={slotStyle}
                  aria-hidden="true"
                  onPointerEnter={() => setHoveredIndex(null)}
                />
              );
            }

            const isSelected = pet.id === selected?.id;
            const isSwitching = pet.id === switchingPetId;
            const previewUrl = previews[pet.id];
            const displayName = compactPetName(pet.displayName);
            return (
              <button
                key={`${pet.source}:${pet.id}`}
                type="button"
                className={`pet-card ${isSelected ? "active" : ""} ${isSwitching ? "is-switching" : ""} ${hoveredIndex === index ? "is-hovered" : ""}`}
                style={slotStyle}
                title={pet.displayName}
                onPointerEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
                onClick={() => onSelect(pet.id)}
              >
                <span className="pet-card-preview" aria-hidden="true">
                  {previewUrl ? (
                    <span
                      className="pet-card-sprite"
                      style={{ backgroundImage: `url("${previewUrl}")` }}
                    />
                  ) : (
                    <span className="pet-card-initials">{initialsFor(pet.displayName)}</span>
                  )}
                </span>
                <span className="pet-card-copy">
                  <span className="pet-card-name">{displayName}</span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          className="carousel-button"
          type="button"
          aria-label="Next pet page"
          disabled={!canGoForward}
          onClick={goForward}
        >
          &gt;
        </button>
      </div>

      <div className="picker-filters">
        <input
          type="search"
          aria-label="搜索宠物"
          placeholder="搜索"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
        <select
          aria-label="来源筛选"
          value={sourceFilter}
          onChange={(event) =>
            setSourceFilter(event.currentTarget.value as "all" | "builtin" | "imported")}
        >
          <option value="all">全部来源</option>
          <option value="builtin">内置</option>
          <option value="imported">导入</option>
        </select>
        <select
          aria-label="门派筛选"
          value={factionFilter}
          onChange={(event) => setFactionFilter(event.currentTarget.value)}
        >
          <option value="all">全部门派</option>
          {factionOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {filteredPets.length === 0 ? <p className="empty-picker">没有匹配宠物。</p> : null}

      {selected ? (
        <div className="picker-meta" aria-label="Selected pet manifest metadata">
          {selected.accentColor ? (
            <span
              className="accent-swatch"
              aria-hidden="true"
              style={{ backgroundColor: selected.accentColor }}
            />
          ) : null}
          <span>{selectedKind === "imported" ? "导入" : "内置"}</span>
          {factionLabelForPet(selected) ? <span>{factionLabelForPet(selected)}</span> : null}
          {selected.version ? <span>v{selected.version}</span> : null}
          {selected.author ? <span>{selected.author}</span> : null}
          {selected.recommendedScale ? (
            <span>{formatRecommendedScale(selected.recommendedScale)}</span>
          ) : null}
          {selectedResourceHealth ? <span>{selectedResourceHealth}</span> : null}
          {selected.tags?.slice(0, 2).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}

      <section className="local-management" aria-label="Local pet management">
        <header className="local-management-header">
          <strong>本地管理</strong>
          <button
            type="button"
            onClick={onRefreshLocalPetManagement}
            disabled={isLoadingLocalPetManagement}
          >
            刷新
          </button>
        </header>
        <div className="local-management-current">
          <span>{selected ? compactPetName(selected.displayName) : "未选择宠物"}</span>
          <small>{selectedKind === "imported" ? "导入" : "内置"}</small>
          {canDeleteSelected && selectedFolderName ? (
            <button
              type="button"
              className={isDeletePending ? "danger-confirm" : ""}
              disabled={isDeletingSelected}
              onClick={() => onDeleteLocalPet(selectedFolderName)}
            >
              {isDeletingSelected ? "删除中" : isDeletePending ? "确认删除" : "删除"}
            </button>
          ) : null}
        </div>
        {petManagementMessage ? (
          <p className="local-management-message">{petManagementMessage}</p>
        ) : null}
      </section>

      <section className="codex-import" aria-label="Codex pet import">
        <header className="codex-import-header">
          <strong>Codex 宠物</strong>
          <button type="button" onClick={onRefreshCodexImports} disabled={isLoadingCodexImports}>
            刷新
          </button>
        </header>
        <div className="codex-import-list">
          {codexImports.length === 0 ? (
            <p>{isLoadingCodexImports ? "扫描中..." : "没有可显示的 Codex 宠物。"}</p>
          ) : (
            codexImports.map((candidate) => {
              const disabled =
                candidate.status !== "importable" ||
                importingCodexFolder === candidate.folderName;
              return (
                <button
                  key={candidate.folderName}
                  type="button"
                  disabled={disabled}
                  title={candidate.message ?? candidate.description ?? candidate.displayName}
                  onClick={() => onImportCodexPet(candidate.folderName)}
                >
                  <span>{compactPetName(candidate.displayName)}</span>
                  <small>{importStatusLabel(candidate, importingCodexFolder)}</small>
                </button>
              );
            })
          )}
        </div>
        {codexImportMessage ? <p className="codex-import-message">{codexImportMessage}</p> : null}
      </section>
    </aside>
  );
}

function importStatusLabel(
  candidate: CodexPetImportCandidate,
  importingFolder: string | null,
): string {
  if (importingFolder === candidate.folderName) return "导入中";
  if (candidate.status === "importable") return "可导入";
  if (candidate.reason === "manifest_exists") return "已有ID";
  if (candidate.status === "installed") return "已有";
  if (candidate.reason === "missing_manifest") return "缺 manifest";
  if (candidate.reason === "spritesheet_missing") return "缺图";
  return "不可用";
}

function petKindForPicker(pet: PetOption): "builtin" | "imported" {
  return pet.localKind === "imported" ? "imported" : "builtin";
}

function petMatchesSearch(pet: PetOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [
    pet.displayName,
    pet.id,
    pet.description,
    pet.author,
    pet.version,
    pet.faction,
    pet.behaviorProfile,
    ...(pet.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function factionLabelForPet(pet: Pick<PetOption, "id" | "displayName" | "faction">): string | null {
  if (pet.faction?.trim()) return pet.faction.trim();
  const haystack = `${pet.displayName} ${pet.id}`.toLowerCase();
  const match = pickerFactionAliases.find((item) =>
    item.aliases.some((alias) => haystack.includes(alias.toLowerCase())),
  );
  return match?.label ?? null;
}

function manifestResourceHealthLabel(pet: PetOption): string {
  const hasRequiredFields =
    hasManifestText(pet.id) &&
    hasManifestText(pet.displayName) &&
    hasManifestText(pet.spritesheetPath);
  return hasRequiredFields ? "资源正常" : "资源待检查";
}

function hasManifestText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatRecommendedScale(scale: number): string {
  return `建议 ${Math.round(scale * 100)}%`;
}

const pickerFactionAliases = [
  { label: "七秀", aliases: ["七秀", "u4e03-u79c0", "xiutai"] },
  { label: "万花", aliases: ["万花", "u4e07-u82b1", "wanhua"] },
  { label: "纯阳", aliases: ["纯阳", "u7eaf-u9633", "chunyang"] },
  { label: "五毒", aliases: ["五毒", "u4e94-u6bd2", "duling", "wudu"] },
  { label: "丐帮", aliases: ["丐帮", "u4e10-u5e2e", "gaibang"] },
  { label: "凌雪阁", aliases: ["凌雪阁", "u51cc-u96ea-u9601", "lingxue"] },
  { label: "北天药宗", aliases: ["北天药宗", "u5317-u5929-u836f-u5b97", "yaozong"] },
  { label: "万灵山庄", aliases: ["万灵山庄", "u4e07-u7075-u5c71-u5e84", "wanling"] },
  { label: "唐门", aliases: ["唐门", "u5510-u95e8", "tangmen"] },
  { label: "少林", aliases: ["少林", "u5c11-u6797", "shaolin"] },
  { label: "苍云", aliases: ["苍云", "u82cd-u4e91", "cangyun"] },
  { label: "蓬莱", aliases: ["蓬莱", "u84ec-u83b1", "snowfeather", "penglai"] },
  { label: "段氏", aliases: ["段氏", "u6bb5-u6c0f", "duanshi"] },
  { label: "刀宗", aliases: ["刀宗", "u5200-u5b97", "daozong"] },
  { label: "衍天宗", aliases: ["衍天宗", "u884d-u5929-u5b97", "yantian"] },
  { label: "霸刀", aliases: ["霸刀", "u9738-u5200", "badao"] },
  { label: "长歌", aliases: ["长歌", "u957f-u6b4c", "changge"] },
  { label: "明教", aliases: ["明教", "u660e-u6559", "mingjiao", "mingyue"] },
  { label: "藏剑", aliases: ["藏剑", "u85cf-u5251", "cangjian"] },
  { label: "天策", aliases: ["天策", "u5929-u7b56", "tiance"] },
];

function compactPetName(name: string): string {
  const normalized = name
    .replace(/\s+Codex Pet\s+/i, " #")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(normalized);
  if (chars.length <= 10) return normalized;
  return `${chars.slice(0, 8).join("")}...`;
}

function arcOffset(index: number, count: number): number {
  const center = (count - 1) / 2;
  const distance = Math.abs(index - center);
  return Math.round(distance * distance * 5 - 14);
}

function cardDepth(index: number): number {
  return 10 - Math.abs(index - 2);
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
