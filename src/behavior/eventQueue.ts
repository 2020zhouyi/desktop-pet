import type { LifestyleDecision, PetEvent } from "./lifestyle";

export type QueuedBehaviorEvent = {
  decision: LifestyleDecision;
  activeMs?: number;
};

export type BehaviorQueueAction = "play" | "queued" | "merged" | "dropped";

export type BehaviorQueueResult<T extends QueuedBehaviorEvent> = {
  action: BehaviorQueueAction;
  item?: T;
  interrupted?: T;
  reason?: string;
};

const mergeableEventTypes = new Set<PetEvent["type"]>([
  "idle-timeout",
  "idle-long",
  "welcome",
  "comfort",
]);
const proactiveEventTypes = new Set<PetEvent["type"]>([
  "welcome",
  "idle-timeout",
  "idle-long",
  "long-session",
  "comfort",
]);
const importantFeedbackPriority = 70;

export class BehaviorEventQueue<T extends QueuedBehaviorEvent = QueuedBehaviorEvent> {
  #active: T | null = null;
  #pending: T[] = [];

  get active(): T | null {
    return this.#active;
  }

  get pending(): T[] {
    return [...this.#pending];
  }

  enqueue(item: T): BehaviorQueueResult<T> {
    if (!item.decision.shouldAct) {
      return { action: "dropped", item, reason: item.decision.reason ?? "skip-decision" };
    }

    if (this.isMergeableDuplicate(item)) {
      this.mergePending(item);
      return { action: "merged", item };
    }

    if (!this.#active) return this.playNow(item);

    if (item.decision.priority > this.#active.decision.priority) {
      const interrupted = this.#active;
      return {
        ...this.playNow(item),
        interrupted,
      };
    }

    if (this.shouldQueueBehindActive(item)) {
      this.insertPending(item);
      return { action: "queued", item };
    }

    return {
      action: "dropped",
      item,
      reason: "lower-priority-active",
    };
  }

  completeActive(): BehaviorQueueResult<T> {
    this.#active = null;
    const next = this.#pending.shift();
    if (!next) return { action: "dropped", reason: "empty" };
    return this.playNow(next);
  }

  clear() {
    this.#active = null;
    this.#pending = [];
  }

  private playNow(item: T): BehaviorQueueResult<T> {
    this.#active = activeMsForItem(item) > 0 ? item : null;
    return { action: "play", item };
  }

  private shouldQueueBehindActive(item: T): boolean {
    if (item.decision.priority >= importantFeedbackPriority) return true;
    return isProactiveEventType(item.decision.eventType);
  }

  private isMergeableDuplicate(item: T): boolean {
    if (!mergeableEventTypes.has(item.decision.eventType)) return false;
    if (this.#active?.decision.eventType === item.decision.eventType) return true;
    return this.#pending.some(
      (queued) => queued.decision.eventType === item.decision.eventType,
    );
  }

  private mergePending(item: T) {
    if (this.#active?.decision.eventType === item.decision.eventType) return;
    this.#pending = [
      ...this.#pending.filter(
        (queued) => queued.decision.eventType !== item.decision.eventType,
      ),
      item,
    ].sort(compareQueuedEvents);
  }

  private insertPending(item: T) {
    const pending = mergeableEventTypes.has(item.decision.eventType)
      ? this.#pending.filter(
        (queued) => queued.decision.eventType !== item.decision.eventType,
      )
      : this.#pending;
    this.#pending = [...pending, item].sort(compareQueuedEvents).slice(0, 4);
  }
}

export function activeHoldMsForDecision(
  decision: Pick<LifestyleDecision, "durationMs" | "bubbleScene">,
  options: { bubbleDurationMs: number; speechBubblesEnabled: boolean },
): number {
  return Math.max(
    decision.durationMs ?? 0,
    options.speechBubblesEnabled && decision.bubbleScene ? options.bubbleDurationMs : 0,
  );
}

export function isProactiveEventType(eventType: PetEvent["type"]): boolean {
  return proactiveEventTypes.has(eventType);
}

function activeMsForItem(item: QueuedBehaviorEvent): number {
  return item.activeMs ?? 0;
}

function compareQueuedEvents(a: QueuedBehaviorEvent, b: QueuedBehaviorEvent): number {
  return b.decision.priority - a.decision.priority;
}
