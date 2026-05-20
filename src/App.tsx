import { useEffect, useMemo, useRef, useState } from "react";
import { desktopPetApi, localPreviewStatus } from "./desktopPetApi";
import { atlas, backgroundPosition, sequenceFor } from "./petAnimation";
import type { PetOption, PetState, PetStatus } from "./types";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Frame } from "./petAnimation";
import "./styles.css";

const dragThresholdPx = 4;
const minMascotWidthPx = 80;
const maxMascotWidthPx = 224;
const defaultMascotWidthPx = 112;
const mascotAspectRatio = 192 / 208;

type DragState = {
  pointerId: number;
  screenX: number;
  screenY: number;
  hasMoved: boolean;
};

type ResizeState = {
  pointerId: number;
  startScreenX: number;
  startWidthPx: number;
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
  const [isPickerOpen, setPickerOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("picker"),
  );
  const [isDragging, setDragging] = useState(false);
  const [isResizing, setResizing] = useState(false);
  const [mascotWidth, setMascotWidth] = useState(defaultMascotWidthPx);
  const [petPreviews, setPetPreviews] = useState<Record<string, string | null>>({});
  const [switchingPetId, setSwitchingPetId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pendingResizeRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const currentFrameRef = useRef<Frame>({ row: 0, column: 0, durationMs: 280 });
  const hitImageRef = useRef<HTMLImageElement | null>(null);
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitFrameDataRef = useRef<HitFrameData>({ key: "", pixels: null });
  const pointerPassthroughRef = useRef<boolean | null>(null);
  const reducedMotion = useReducedMotion();
  const avatarRef = useFrameAnimation(status.state, reducedMotion, currentFrameRef);
  const selected = status.selectedPet;

  const setPointerPassthrough = (enabled: boolean) => {
    if (pointerPassthroughRef.current === enabled) return;
    pointerPassthroughRef.current = enabled;
    void desktopPetApi.setPointerPassthrough(enabled);
  };

  useEffect(() => {
    void desktopPetApi.getStatus().then(setStatus);
    return desktopPetApi.onStatusChanged(setStatus);
  }, []);

  useEffect(() => desktopPetApi.onOpenPetPicker(() => setPickerOpen(true)), []);

  useEffect(() => {
    void desktopPetApi.setPickerOpen(isPickerOpen);
    if (isPickerOpen) setPointerPassthrough(false);
  }, [isPickerOpen]);

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
    void setPointerPassthrough(true);
    return () => {
      void desktopPetApi.setPointerPassthrough(false);
    };
  }, []);

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
    if (isPickerOpen) return;
    const image = hitImageRef.current;
    if (!image) return;
    updateVisualInsets(image);
  }, [isPickerOpen]);

  const sourceLabel = useMemo(() => {
    if (!selected) return "No pet";
    if (selected.source === "codex") return "Codex folder";
    if (selected.source === "sample") return "Sample";
    return "App folder";
  }, [selected]);

  useEffect(() => {
    return () => {
      void desktopPetApi.stopWindowDrag();
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
    };
  }, []);

  const setLocalState = (state: PetState) => {
    setStatus((current) => current.state === state ? current : { ...current, state });
  };

  const closePetPicker = () => {
    setPickerOpen(false);
  };

  const selectPet = async (id: string) => {
    setSwitchingPetId(id);
    const pet = await desktopPetApi.selectPet(id);
    if (pet) {
      setStatus((current) => ({
        ...current,
        selectedPet: pet,
        state: "jumping",
      }));
      void desktopPetApi.setState("jumping", 1300);
    } else {
      void desktopPetApi.setState("failed", 1800);
    }
    window.setTimeout(() => {
      setSwitchingPetId(null);
      closePetPicker();
    }, 180);
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

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
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
      hasMoved: false,
    };
    setDragging(true);
    closePetPicker();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.screenX - drag.screenX;
    const deltaY = event.screenY - drag.screenY;
    if (Math.abs(deltaX) < dragThresholdPx && Math.abs(deltaY) < dragThresholdPx) return;

    drag.hasMoved = true;
    drag.screenX = event.screenX;
    drag.screenY = event.screenY;
    setLocalState(deltaX >= 0 ? "running-right" : "running-left");
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>, shouldWave: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    void desktopPetApi.stopWindowDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);

    if (!drag.hasMoved && shouldWave) {
      void desktopPetApi.setState("waving", 1600);
      return;
    }
    void desktopPetApi.setState("idle");
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
    };
    setPointerPassthrough(false);
    setResizing(true);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const nextWidth = clamp(
      resize.startWidthPx + event.screenX - resize.startScreenX,
      minMascotWidthPx,
      maxMascotWidthPx,
    );
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
  };

  const onMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    if (isPickerOpen) {
      setPointerPassthrough(false);
      return;
    }
    if (dragRef.current || resizeRef.current) {
      setPointerPassthrough(false);
      return;
    }
    setPointerPassthrough(!isInteractiveHit(event));
  };

  const onMouseLeave = () => {
    if (isPickerOpen) {
      setPointerPassthrough(false);
      return;
    }
    if (!dragRef.current && !resizeRef.current) setPointerPassthrough(true);
  };

  const isInteractiveHit = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest(".no-drag")) return true;
    return isMascotHit(event.clientX, event.clientY);
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
    window.requestAnimationFrame(() => {
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
        className={`pet-shell ${isDragging ? "is-dragging" : ""} ${isResizing ? "is-resizing" : ""} ${isPickerOpen ? "is-picker-open" : ""}`}
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
          } as CSSProperties
        }
      >
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

        <div className="bubble no-drag">
          <div>
            <strong>{selected?.displayName ?? "Desktop Pet"}</strong>
            <span>{sourceLabel} · {status.state}</span>
          </div>
          <div className="actions">
            <button type="button" onClick={() => desktopPetApi.setState("waving", 1800)}>
              Wave
            </button>
            <button type="button" onClick={() => desktopPetApi.setState("running", 1600)}>
              Run
            </button>
            <button type="button" onClick={() => setPickerOpen((value) => !value)}>
              Pets
            </button>
          </div>
        </div>

        {isPickerOpen ? (
          <PetPicker
            pets={status.pets}
            selected={selected}
            previews={petPreviews}
            switchingPetId={switchingPetId}
            onClose={closePetPicker}
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

function PetPicker({
  pets,
  selected,
  previews,
  switchingPetId,
  onClose,
  onSelect,
}: {
  pets: PetOption[];
  selected: PetOption | null;
  previews: Record<string, string | null>;
  switchingPetId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const pageSize = 5;
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(pets.length / pageSize));
  const visiblePets = pets.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex < pageCount - 1;

  useEffect(() => {
    const selectedIndex = pets.findIndex((pet) => pet.id === selected?.id);
    if (selectedIndex >= 0) {
      setPageIndex(Math.floor(selectedIndex / pageSize));
    }
  }, [pets.length, selected?.id]);

  const goBack = () => setPageIndex((current) => Math.max(0, current - 1));
  const goForward = () => setPageIndex((current) => Math.min(pageCount - 1, current + 1));

  return (
    <aside className="picker no-drag" aria-label="Choose pet">
      <header className="picker-header">
        <div>
          <strong>Choose Pet</strong>
          <span>
            {pageIndex + 1}/{pageCount} · {pets.length} models
          </span>
        </div>
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

        <div className="pet-row">
          {visiblePets.map((pet) => {
            const isSelected = pet.id === selected?.id;
            const isSwitching = pet.id === switchingPetId;
            const previewUrl = previews[pet.id];
            return (
              <button
                key={`${pet.source}:${pet.id}`}
                type="button"
                className={`pet-card ${isSelected ? "active" : ""} ${isSwitching ? "is-switching" : ""}`}
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
                  <span className="pet-card-name">{pet.displayName}</span>
                  <span className="pet-card-source">{sourceName(pet.source)}</span>
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

      {pets.length === 0 ? <p className="empty-picker">No pets found.</p> : null}
    </aside>
  );
}

function sourceName(source: PetOption["source"]): string {
  if (source === "codex") return "Codex";
  if (source === "sample") return "Sample";
  return "Local";
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
