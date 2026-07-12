export function normalizeVisualInsets(insets) {
  return {
    left: finiteNonNegative(insets?.left),
    top: finiteNonNegative(insets?.top),
    right: finiteNonNegative(insets?.right),
    bottom: finiteNonNegative(insets?.bottom),
  };
}

export function fallbackVisualInsetsForMascot(
  bounds,
  mascotWidth,
  mascotAspectRatio,
  bottomInset = 0,
) {
  const width = finitePositive(mascotWidth);
  const aspectRatio = finitePositive(mascotAspectRatio);
  if (width === null || aspectRatio === null) return normalizeVisualInsets(null);

  const mascotHeight = width / aspectRatio;
  const safeBottomInset = Math.min(
    finiteNonNegative(bottomInset),
    Math.max(0, Number(bounds?.height) - mascotHeight),
  );
  return normalizeVisualInsets({
    left: (Number(bounds?.width) - width) / 2,
    right: (Number(bounds?.width) - width) / 2,
    top: Number(bounds?.height) - mascotHeight - safeBottomInset,
    bottom: safeBottomInset,
  });
}

export function activeVisualInsets(
  bounds,
  visualInsets,
  mascotWidth,
  mascotAspectRatio,
  fallbackBottomInset = 0,
) {
  const normalizedInsets = normalizeVisualInsets(visualInsets);
  const hasRendererInsets = Object.values(normalizedInsets).some((value) => value > 0);
  return hasRendererInsets
    ? safeVisualInsetsForBounds(bounds, normalizedInsets)
    : fallbackVisualInsetsForMascot(
      bounds,
      mascotWidth,
      mascotAspectRatio,
      fallbackBottomInset,
    );
}

export function visibleRectFromInsets(bounds, insets) {
  const normalizedInsets = normalizeVisualInsets(insets);
  const left = Number(bounds?.x) + normalizedInsets.left;
  const top = Number(bounds?.y) + normalizedInsets.top;
  const right = Number(bounds?.x) + Number(bounds?.width) - normalizedInsets.right;
  const bottom = Number(bounds?.y) + Number(bounds?.height) - normalizedInsets.bottom;
  return {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(right),
    bottom: Math.round(bottom),
  };
}

export function centerOfVisibleRect(bounds, insets) {
  const rect = visibleRectFromInsets(bounds, insets);
  return {
    x: Math.round((rect.left + rect.right) / 2),
    y: Math.round((rect.top + rect.bottom) / 2),
  };
}

export function boundsCenteredAt(size, center) {
  const width = finitePositive(size?.width) ?? 0;
  const height = finitePositive(size?.height) ?? 0;
  const centerX = finiteNumber(center?.x) ?? width / 2;
  const centerY = finiteNumber(center?.y) ?? height / 2;
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
  };
}

export function boundsWithVisibleCenter(size, insets, center, minVisiblePx) {
  const width = finitePositive(size?.width) ?? 0;
  const height = finitePositive(size?.height) ?? 0;
  const normalizedInsets = safeVisualInsetsForBounds({ width, height }, insets, minVisiblePx);
  const visibleWidth = Math.max(1, width - normalizedInsets.left - normalizedInsets.right);
  const visibleHeight = Math.max(1, height - normalizedInsets.top - normalizedInsets.bottom);
  const centerX = finiteNumber(center?.x) ?? width / 2;
  const centerY = finiteNumber(center?.y) ?? height / 2;
  return {
    x: Math.round(centerX - normalizedInsets.left - visibleWidth / 2),
    y: Math.round(centerY - normalizedInsets.top - visibleHeight / 2),
    width,
    height,
  };
}

export function pointInRect(point, rect) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

export function pointerPassthroughDecision({ bounds, cursor, isVisible, isDragging = false }) {
  if (!isVisible) return "passthrough";
  if (isDragging) return "interactive";

  const x = Number(cursor?.x);
  const y = Number(cursor?.y);
  const left = Number(bounds?.x);
  const top = Number(bounds?.y);
  const right = left + Number(bounds?.width);
  const bottom = top + Number(bounds?.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    x < left ||
    x > right ||
    y < top ||
    y > bottom
  ) {
    return "passthrough";
  }

  return "renderer";
}

export function expandRect(rect, padding) {
  const inset = finiteNonNegative(padding);
  return {
    left: Math.round(Number(rect?.left) - inset),
    top: Math.round(Number(rect?.top) - inset),
    right: Math.round(Number(rect?.right) + inset),
    bottom: Math.round(Number(rect?.bottom) + inset),
  };
}

export function dragBoundsForPointer({
  bounds,
  pointer,
  pointerWindowOffset,
  workArea,
  insets,
  minVisiblePx,
}) {
  const width = finitePositive(bounds?.width);
  const height = finitePositive(bounds?.height);
  if (width === null || height === null) return bounds;

  const pointerX = Number(pointer?.x);
  const pointerY = Number(pointer?.y);
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return bounds;

  const offsetX = finiteNumber(pointerWindowOffset?.x) ?? Math.round(width / 2);
  const offsetY = finiteNumber(pointerWindowOffset?.y) ?? Math.round(height / 2);
  return clampBoundsToWorkArea({
    ...bounds,
    x: Math.round(pointerX - offsetX),
    y: Math.round(pointerY - offsetY),
  }, workArea, insets, { minVisiblePx });
}

export function clampBoundsToWorkArea(bounds, workArea, insets, options = {}) {
  const normalizedInsets = safeVisualInsetsForBounds(bounds, insets, options.minVisiblePx);
  const minX = Number(workArea.x) - normalizedInsets.left;
  const maxX = Number(workArea.x) + Number(workArea.width) - Number(bounds.width) +
    normalizedInsets.right;
  const minY = Number(workArea.y) - normalizedInsets.top;
  const maxY = Number(workArea.y) + Number(workArea.height) - Number(bounds.height) +
    normalizedInsets.bottom;
  return {
    ...bounds,
    x: Math.round(clamp(Number(bounds.x), minX, maxX)),
    y: Math.round(clamp(Number(bounds.y), minY, maxY)),
  };
}

export function safeVisualInsetsForBounds(bounds, insets, minVisiblePx = 64) {
  const normalizedInsets = normalizeVisualInsets(insets);
  const width = finitePositive(bounds?.width);
  const height = finitePositive(bounds?.height);
  return {
    ...constrainAxisInsets(width, normalizedInsets.left, normalizedInsets.right, minVisiblePx, [
      "left",
      "right",
    ]),
    ...constrainAxisInsets(height, normalizedInsets.top, normalizedInsets.bottom, minVisiblePx, [
      "top",
      "bottom",
    ]),
  };
}

function constrainAxisInsets(size, start, end, minVisiblePx, [startKey, endKey]) {
  if (size === null) return { [startKey]: start, [endKey]: end };
  const minimumVisible = Math.max(1, Math.min(Math.round(Number(minVisiblePx) || 64), size));
  const maxTrim = Math.max(0, Math.round(size - minimumVisible));
  const total = start + end;
  if (total <= maxTrim) return { [startKey]: start, [endKey]: end };
  if (total <= 0) return { [startKey]: 0, [endKey]: 0 };

  const nextStart = Math.round((start / total) * maxTrim);
  return {
    [startKey]: nextStart,
    [endKey]: maxTrim - nextStart,
  };
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
