import { useCallback, useEffect, useRef, useState } from "react";
import {
  directionalDragEvent,
  transitionPetState,
  type PetStateEvent,
} from "./behavior/petStateMachine";
import { ControlSurface } from "./control/ControlSurface";
import { desktopPetApi, localPreviewStatus } from "./desktopPetApi";
import { bubbleTextForPet } from "./petBubbles";
import { actionDurationMs, atlas, backgroundPosition, sequenceFor } from "./petAnimation";
import type {
  PetOption,
  PetState,
  PetStatus,
} from "./types";
import type { BubbleScene } from "./petBubbles";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Frame } from "./petAnimation";
import "./styles.css";
import "./control/PetPicker.css";

const dragThresholdPx = 4;
const mascotWidthStepPx = 12;
const minMascotWidthPx = 84;
const maxMascotWidthPx = 228;
const defaultMascotWidthPx = 120;
const mascotAspectRatio = 192 / 208;
const bubbleDurationMs = 3200;
const waveDurationMs = actionDurationMs("waving");
const jumpDurationMs = actionDurationMs("jumping");

const interactiveHitSelector = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[role='button']",
].join(",");

type DragState = {
  pointerId: number;
  screenX: number;
  screenY: number;
  pointerWindowX: number;
  pointerWindowY: number;
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

type CoreBubbleScene = Extract<BubbleScene, "welcome" | "click" | "drag" | "petSwitch">;

type ActiveBubble = {
  id: number;
  scene: CoreBubbleScene;
  text: string;
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
  const searchParams = new URLSearchParams(window.location.search);
  const surface = searchParams.get("surface") ?? "pet";

  if (surface === "pet") return <PetSurface />;
  if (surface !== "control") {
    return <SurfaceRouteError message={`未知界面：${surface}`} />;
  }

  const panel = searchParams.get("panel");
  if (panel !== "picker") {
    return <SurfaceRouteError message="控制窗口缺少有效的 panel 参数。" />;
  }
  return <ControlSurface />;
}

function SurfaceRouteError({ message }: { message: string }) {
  return (
    <main className="stage">
      <section className="surface-route-error no-drag" role="alert">
        <strong>无法打开界面</strong>
        <p>{message}</p>
      </section>
    </main>
  );
}

function PetSurface() {
  const [status, setStatus] = useState<PetStatus>(localPreviewStatus);
  const [isDragging, setDragging] = useState(false);
  const [isResizing, setResizing] = useState(false);
  const [mascotWidth, setMascotWidth] = useState(defaultMascotWidthPx);
  const [currentBubble, setCurrentBubble] = useState<ActiveBubble | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pendingResizeRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const visualInsetsFrameRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const bubbleIdRef = useRef(0);
  const hasShownWelcomeRef = useRef(false);
  const observedPetIdRef = useRef<string | null>(null);
  const currentFrameRef = useRef<Frame>({ row: 0, column: 0, durationMs: 280 });
  const hitImageRef = useRef<HTMLImageElement | null>(null);
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitFrameDataRef = useRef<HitFrameData>({ key: "", pixels: null });
  const pointerPassthroughRef = useRef<boolean | null>(null);
  const mascotHoverRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const avatarRef = useFrameAnimation(status.state, reducedMotion, currentFrameRef);
  const selected = status.selectedPet;

  const setPointerPassthrough = useCallback((enabled: boolean) => {
    if (pointerPassthroughRef.current === enabled) return;
    pointerPassthroughRef.current = enabled;
    void desktopPetApi.setPointerPassthrough(enabled);
  }, []);

  const clearBubbleTimer = useCallback(() => {
    if (bubbleTimerRef.current === null) return;
    window.clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = null;
  }, []);

  const showBubble = useCallback(
    (
      scene: CoreBubbleScene,
      pet: PetOption | null = selected,
    ) => {
      const id = bubbleIdRef.current + 1;
      bubbleIdRef.current = id;
      clearBubbleTimer();
      setCurrentBubble({
        id,
        scene,
        text: bubbleTextForPet(pet, scene),
      });
      bubbleTimerRef.current = window.setTimeout(() => {
        bubbleTimerRef.current = null;
        setCurrentBubble((bubble) => bubble?.id === id ? null : bubble);
      }, bubbleDurationMs);
    },
    [clearBubbleTimer, selected],
  );

  const requestPetTransition = useCallback(
    (
      event: PetStateEvent,
      durationMs = 0,
      settleActiveAction = false,
    ) => {
      let current = status.state;
      if (settleActiveAction) {
        current = current === "running-left" || current === "running-right"
          ? transitionPetState(current, { type: "drag-end" })
          : transitionPetState(current, { type: "action-complete" });
      }
      const next = transitionPetState(current, event);
      return desktopPetApi.setState(next, durationMs);
    },
    [status.state],
  );

  const playCoreAction = useCallback(
    (
      eventType: "click" | "jump",
      scene: CoreBubbleScene,
      durationMs: number,
      pet: PetOption | null = selected,
    ) => {
      void requestPetTransition({ type: eventType }, durationMs, true);
      showBubble(scene, pet);
    },
    [requestPetTransition, selected, showBubble],
  );

  useEffect(() => {
    void desktopPetApi.getStatus().then(setStatus);
    return desktopPetApi.onStatusChanged(setStatus);
  }, []);

  useEffect(() => {
    if (resizeRef.current) return;
    setMascotWidth(snapMascotWidth(status.mascotWidthPx));
  }, [status.mascotWidthPx]);

  useEffect(() => {
    if (!selected?.id) return;
    if (hasShownWelcomeRef.current) return;
    const timer = window.setTimeout(() => {
      hasShownWelcomeRef.current = true;
      showBubble("welcome");
    }, 260);
    return () => window.clearTimeout(timer);
  }, [selected?.id, showBubble]);

  useEffect(() => {
    if (!selected?.id) return;
    const previousPetId = observedPetIdRef.current;
    observedPetIdRef.current = selected.id;
    if (previousPetId === null || previousPetId === selected.id) return;
    playCoreAction("jump", "petSwitch", jumpDurationMs, selected);
  }, [playCoreAction, selected]);

  useEffect(() => {
    void setPointerPassthrough(true);
    return () => {
      clearBubbleTimer();
      void desktopPetApi.setPointerPassthrough(false);
    };
  }, [clearBubbleTimer, setPointerPassthrough]);

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
    if (image) updateVisualInsets(image);
  }, [mascotWidth]);

  useEffect(() => {
    return () => {
      void desktopPetApi.stopWindowDrag();
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
      if (visualInsetsFrameRef.current !== null) {
        window.cancelAnimationFrame(visualInsetsFrameRef.current);
      }
    };
  }, []);

  const queueResizeMascot = (widthPx: number) => {
    pendingResizeRef.current = widthPx;
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const pending = pendingResizeRef.current;
      pendingResizeRef.current = null;
      if (pending !== null) void desktopPetApi.resizeMascot(pending);
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest(".no-drag")) return;
    if (!isMascotHit(event.clientX, event.clientY)) {
      setPointerPassthrough(true);
      return;
    }

    event.preventDefault();
    void requestPetTransition({ type: "press" });
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
      pointerWindowX: event.clientX,
      pointerWindowY: event.clientY,
      hasMoved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();

    const deltaX = event.screenX - drag.screenX;
    const deltaY = event.screenY - drag.screenY;
    if (Math.abs(deltaX) < dragThresholdPx && Math.abs(deltaY) < dragThresholdPx) return;

    drag.hasMoved = true;
    const dragEvent = directionalDragEvent(deltaX, dragThresholdPx);
    if (dragEvent) void requestPetTransition(dragEvent);
    drag.screenX = event.screenX;
    drag.screenY = event.screenY;
    void desktopPetApi.moveWindowDrag();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>, shouldWave: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    void desktopPetApi.stopWindowDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);

    if (!drag.hasMoved && shouldWave) {
      playCoreAction("click", "click", waveDurationMs);
      return;
    }

    void requestPetTransition({ type: "drag-end" });
    if (drag.hasMoved) showBubble("drag");
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
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
    setMascotWidth(nextWidth);
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
    void desktopPetApi.resizeMascot(resize.currentWidthPx, true);
  };

  const onMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    if (dragRef.current || resizeRef.current) {
      setPointerPassthrough(false);
      return;
    }
    const mascotHit = isMascotHit(event.clientX, event.clientY);
    const elementHit = isInteractiveElementHit(event.target);
    if (mascotHit !== mascotHoverRef.current) {
      mascotHoverRef.current = mascotHit;
      void requestPetTransition(
        { type: mascotHit ? "hover-enter" : "hover-leave" },
        mascotHit ? jumpDurationMs : 0,
        mascotHit,
      );
    }
    setPointerPassthrough(!(mascotHit || elementHit));
  };

  const onMouseLeave = () => {
    if (!dragRef.current && !resizeRef.current) {
      if (mascotHoverRef.current) {
        mascotHoverRef.current = false;
        void requestPetTransition({ type: "hover-leave" });
      }
      setPointerPassthrough(true);
    }
  };

  const onPointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current) {
      setPointerPassthrough(false);
      return;
    }
    const mascotHit = isMascotHit(event.clientX, event.clientY);
    setPointerPassthrough(!(mascotHit || isInteractiveElementHit(event.target)));
  };

  const isInteractiveHit = (
    event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
  ) => {
    if (isMascotHit(event.clientX, event.clientY)) return true;
    return isInteractiveElementHit(event.target);
  };

  const isInteractiveElementHit = (target: EventTarget | null) => {
    return target instanceof Element && Boolean(target.closest(interactiveHitSelector));
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
        className={`pet-shell ${isDragging ? "is-dragging" : ""} ${isResizing ? "is-resizing" : ""}`}
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
        onPointerEnter={onPointerEnter}
        onLostPointerCapture={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishDrag(event, true)}
        style={
          {
            "--mascot-width": `${mascotWidth}px`,
            "--mascot-height": `${mascotWidth / mascotAspectRatio}px`,
            "--pet-opacity": 1,
          } as CSSProperties
        }
      >
        {currentBubble ? (
          <div
            key={currentBubble.id}
            className="speech-bubble"
            data-scene={currentBubble.scene}
            aria-live="polite"
            style={
              {
                "--bubble-duration": `${bubbleDurationMs}ms`,
              } as CSSProperties
            }
          >
            {currentBubble.text}
          </div>
        ) : null}

        <div
          className="pet-hit-area"
          data-avatar-overlay-hit-region="mascot"
          data-avatar-mascot="true"
          title="拖拽桌宠"
          aria-label="拖拽桌宠"
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
            aria-label="调整桌宠大小"
            title="拖拽调整桌宠大小"
            onPointerCancel={finishResize}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={finishResize}
          />
        </div>

      </section>
    </main>
  );
}

function snapMascotWidth(value: number): number {
  return Math.min(
    maxMascotWidthPx,
    Math.max(minMascotWidthPx, Math.round(Number(value) / mascotWidthStepPx) * mascotWidthStepPx),
  );
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
