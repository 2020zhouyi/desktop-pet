import assert from "node:assert/strict";
import {
  activeVisualInsets,
  boundsCenteredAt,
  boundsWithVisibleCenter,
  clampBoundsToWorkArea,
  centerOfVisibleRect,
  dragBoundsForPointer,
  expandRect,
  fallbackVisualInsetsForMascot,
  pointInRect,
  pointerPassthroughDecision,
  safeVisualInsetsForBounds,
  visibleRectFromInsets,
} from "../electron/window-geometry.mjs";

const bounds = { x: 100, y: 80, width: 340, height: 434 };
const workArea = { x: 0, y: 0, width: 1440, height: 900 };

const fallbackInsets = fallbackVisualInsetsForMascot(bounds, 120, 192 / 208, 12);
assert.deepEqual(fallbackInsets, {
  left: 110,
  right: 110,
  top: 292,
  bottom: 12,
});

assert.deepEqual(
  activeVisualInsets(bounds, { left: 0, top: 0, right: 0, bottom: 0 }, 120, 192 / 208, 12),
  fallbackInsets,
);
assert.deepEqual(
  activeVisualInsets(bounds, { left: 112, top: 155, right: 108, bottom: 149 }, 120, 192 / 208),
  { left: 112, top: 155, right: 108, bottom: 149 },
);

const visibleRect = visibleRectFromInsets(bounds, fallbackInsets);
assert.deepEqual(visibleRect, {
  left: 210,
  top: 372,
  right: 330,
  bottom: 502,
});
assert.equal(pointInRect({ x: 240, y: 400 }, visibleRect), true);
assert.equal(pointInRect({ x: 180, y: 400 }, visibleRect), false);
assert.equal(pointInRect({ x: 202, y: 400 }, expandRect(visibleRect, 8)), true);

assert.equal(
  pointerPassthroughDecision({ bounds, cursor: { x: 120, y: 100 }, isVisible: true }),
  "renderer",
  "every point inside the overlay must defer to renderer alpha-hit testing",
);
assert.equal(
  pointerPassthroughDecision({ bounds, cursor: { x: 99, y: 100 }, isVisible: true }),
  "passthrough",
);
assert.equal(
  pointerPassthroughDecision({ bounds, cursor: { x: 120, y: 100 }, isVisible: false }),
  "passthrough",
);
assert.equal(
  pointerPassthroughDecision({
    bounds,
    cursor: { x: 120, y: 100 },
    isVisible: true,
    isDragging: true,
  }),
  "interactive",
);

assert.deepEqual(
  clampBoundsToWorkArea({ ...bounds, x: -240 }, workArea, fallbackInsets),
  { ...bounds, x: -110 },
);
assert.deepEqual(
  clampBoundsToWorkArea({ ...bounds, x: 1280 }, workArea, fallbackInsets),
  { ...bounds, x: 1210 },
);

const dragInsets = { left: 112, top: 155, right: 108, bottom: 149 };
const grabPoint = { x: 190, y: 248 };
const draggedLeft = dragBoundsForPointer({
  bounds,
  pointer: { x: -240, y: 260 },
  pointerWindowOffset: grabPoint,
  workArea,
  insets: dragInsets,
});
assert.deepEqual(draggedLeft, { ...bounds, x: -112, y: 12 });
assert.equal(visibleRectFromInsets(draggedLeft, dragInsets).left, workArea.x);

const draggedRight = dragBoundsForPointer({
  bounds,
  pointer: { x: 1680, y: 260 },
  pointerWindowOffset: grabPoint,
  workArea,
  insets: dragInsets,
});
assert.deepEqual(draggedRight, { ...bounds, x: 1208, y: 12 });
assert.equal(visibleRectFromInsets(draggedRight, dragInsets).right, workArea.x + workArea.width);

const repeatedLeft = dragBoundsForPointer({
  bounds: draggedRight,
  pointer: { x: -240, y: 260 },
  pointerWindowOffset: grabPoint,
  workArea,
  insets: dragInsets,
});
assert.equal(visibleRectFromInsets(repeatedLeft, dragInsets).left, workArea.x);

const edgeBounds = { ...bounds, x: -dragInsets.left };
assert.equal(visibleRectFromInsets(edgeBounds, dragInsets).left, workArea.x);
const preservedMascotCenter = centerOfVisibleRect(edgeBounds, dragInsets);
const clampedPickerBounds = clampBoundsToWorkArea(
  boundsCenteredAt({ width: 920, height: 760 }, preservedMascotCenter),
  workArea,
  { left: 0, top: 0, right: 0, bottom: 0 },
);
assert.equal(clampedPickerBounds.x, workArea.x);
const closedFromPickerWindowCenter = clampBoundsToWorkArea(
  boundsCenteredAt(bounds, {
    x: clampedPickerBounds.x + clampedPickerBounds.width / 2,
    y: clampedPickerBounds.y + clampedPickerBounds.height / 2,
  }),
  workArea,
  dragInsets,
);
assert.ok(visibleRectFromInsets(closedFromPickerWindowCenter, dragInsets).left > 200);
const closedFromPreservedMascotCenter = clampBoundsToWorkArea(
  boundsWithVisibleCenter(bounds, dragInsets, preservedMascotCenter),
  workArea,
  dragInsets,
);
assert.equal(visibleRectFromInsets(closedFromPreservedMascotCenter, dragInsets).left, workArea.x);

const oversizedInsets = { left: 400, top: 500, right: 400, bottom: 500 };
const safeOversizedInsets = safeVisualInsetsForBounds(bounds, oversizedInsets, 64);
const safeOversizedRect = visibleRectFromInsets(bounds, safeOversizedInsets);
assert.equal(safeOversizedRect.right - safeOversizedRect.left, 64);
assert.equal(safeOversizedRect.bottom - safeOversizedRect.top, 64);

const draggedWithOversizedInsets = dragBoundsForPointer({
  bounds,
  pointer: { x: -2000, y: -2000 },
  pointerWindowOffset: grabPoint,
  workArea,
  insets: oversizedInsets,
  minVisiblePx: 64,
});
const draggedSafeInsets = safeVisualInsetsForBounds(draggedWithOversizedInsets, oversizedInsets, 64);
const draggedSafeRect = visibleRectFromInsets(draggedWithOversizedInsets, draggedSafeInsets);
assert.equal(draggedSafeRect.left, workArea.x);
assert.equal(draggedSafeRect.top, workArea.y);
assert.equal(draggedSafeRect.right - draggedSafeRect.left, 64);
assert.equal(draggedSafeRect.bottom - draggedSafeRect.top, 64);

console.log("window geometry tests passed");
