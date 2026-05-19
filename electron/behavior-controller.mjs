const actionDurations = {
  waving: 1600,
  jumping: 1300,
  failed: 1800,
};

const loopingStates = new Set([
  "idle",
  "running",
  "running-left",
  "running-right",
  "waiting",
  "review",
]);

const statePriorities = {
  idle: 0,
  waving: 30,
  jumping: 35,
  running: 45,
  waiting: 55,
  review: 60,
  failed: 80,
  "running-left": 100,
  "running-right": 100,
};

export class BehaviorController {
  constructor({ initialState = "idle", isValidState, onStateChange }) {
    this.state = initialState;
    this.isValidState = isValidState;
    this.onStateChange = onStateChange;
    this.queue = [];
    this.timer = null;
    this.lastPlayedAt = new Map();
    this.current = this.createRequest(initialState, { durationMs: 0, source: "boot" });
  }

  requestState(state, options = {}) {
    const request = this.createRequest(state, options);
    this.assertValid(request.state);

    if (request.state === "idle" || options.clearQueue) {
      this.queue = [];
    }

    if (request.state === "idle") {
      this.transitionTo(request);
      return this.state;
    }

    if (this.isCoolingDown(request)) {
      return this.state;
    }

    if (this.canInterrupt(request)) {
      this.transitionTo(request);
      return this.state;
    }

    if (request.durationMs > 0 && this.current.durationMs > 0 && options.queue !== false) {
      this.enqueue(request);
    }

    return this.state;
  }

  dispose() {
    this.clearTimer();
    this.queue = [];
  }

  createRequest(state, options = {}) {
    const durationMs = normalizeDuration(state, options.durationMs);
    return {
      state,
      durationMs,
      priority: priorityFor(state, options.priority),
      source: options.source ?? "manual",
      cooldownMs: normalizeCooldown(options.cooldownMs),
      requestedAt: Date.now(),
    };
  }

  assertValid(state) {
    if (!this.isValidState(state)) {
      throw new Error(`Unsupported pet state: ${state}`);
    }
  }

  isCoolingDown(request) {
    if (request.cooldownMs <= 0 || request.durationMs <= 0) return false;
    const lastPlayedAt = this.lastPlayedAt.get(request.state);
    return lastPlayedAt !== undefined && request.requestedAt - lastPlayedAt < request.cooldownMs;
  }

  canInterrupt(request) {
    if (request.priority >= this.current.priority) return true;
    if (this.current.state === "idle") return true;
    if (this.current.durationMs <= 0) return false;
    return false;
  }

  enqueue(request) {
    this.queue = [
      ...this.queue.filter((queued) => queued.state !== request.state),
      request,
    ]
      .sort((a, b) => b.priority - a.priority || a.requestedAt - b.requestedAt)
      .slice(0, 4);
  }

  transitionTo(request) {
    this.clearTimer();
    this.current = request;
    this.state = request.state;

    if (request.durationMs > 0) {
      this.lastPlayedAt.set(request.state, Date.now());
    }

    this.onStateChange(request.state);

    if (request.durationMs > 0) {
      this.timer = setTimeout(() => this.completeCurrent(), request.durationMs);
    }
  }

  completeCurrent() {
    const next = this.queue.shift();
    if (next) {
      this.transitionTo(next);
      return;
    }

    this.transitionTo(this.createRequest("idle", { durationMs: 0, source: "behavior" }));
  }

  clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

function normalizeDuration(state, value) {
  if (state === "idle") return 0;
  const number = Number(value);
  if (value !== undefined && value !== null && Number.isFinite(number)) {
    return clamp(Math.round(number), 0, 30_000);
  }
  if (loopingStates.has(state)) return 0;
  return actionDurations[state] ?? 1600;
}

function priorityFor(state, value) {
  const number = Number(value);
  if (value !== undefined && value !== null && Number.isFinite(number)) return number;
  return statePriorities[state] ?? 20;
}

function normalizeCooldown(value) {
  const number = Number(value);
  if (value === undefined || value === null || !Number.isFinite(number)) return 260;
  return clamp(Math.round(number), 0, 10_000);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
