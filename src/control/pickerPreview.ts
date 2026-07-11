const visiblePreviewLimit = 8;
const concurrentPreviewLimit = 9;

export function pickerPreviewIds(
  visiblePetIds: readonly string[],
  detailPetId: string | null | undefined,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const petId of visiblePetIds) {
    if (result.length >= visiblePreviewLimit) break;
    if (!petId || seen.has(petId)) continue;
    seen.add(petId);
    result.push(petId);
  }

  if (detailPetId && !seen.has(detailPetId)) result.push(detailPetId);
  return result;
}

export function previewRequestSlots(
  requestedPetIds: readonly string[],
  inFlightPetIds: ReadonlySet<string>,
  resolvedPetIds: ReadonlySet<string>,
): string[] {
  let availableSlots = Math.max(0, concurrentPreviewLimit - inFlightPetIds.size);
  if (availableSlots === 0) return [];

  const result: string[] = [];
  for (const petId of requestedPetIds) {
    if (
      !petId ||
      inFlightPetIds.has(petId) ||
      resolvedPetIds.has(petId) ||
      result.includes(petId)
    ) {
      continue;
    }
    result.push(petId);
    availableSlots -= 1;
    if (availableSlots === 0) break;
  }
  return result;
}
