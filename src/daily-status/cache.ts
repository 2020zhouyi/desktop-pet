import { generateDailyStatus } from "./generator";
import { dailyStatusSkinForMenpai } from "./skins";
import type { DailyStatusCacheRecord, DailyStatusRequest } from "./types";

export function dailyStatusCacheKey(request: DailyStatusRequest): string {
  const skin = dailyStatusSkinForMenpai(request.menpai);
  return `daily-status:v1:${request.date}:${request.petId}:${request.menpai}:${skin.skinVersion}`;
}

export function getLocalDailyStatus(request: DailyStatusRequest): DailyStatusCacheRecord {
  const cacheKey = dailyStatusCacheKey(request);
  const cached = readLocalRecord(cacheKey);
  if (cached) return cached;

  const record: DailyStatusCacheRecord = {
    cacheKey,
    status: generateDailyStatus(request),
    seenAt: null,
    dismissedAt: null,
  };
  writeLocalRecord(record);
  return record;
}

export function markLocalDailyStatusSeen(cacheKey: string, seenAt: string): void {
  updateLocalRecord(cacheKey, (record) => ({ ...record, seenAt: record.seenAt ?? seenAt }));
}

export function dismissLocalDailyStatus(cacheKey: string, dismissedAt: string): void {
  updateLocalRecord(cacheKey, (record) => ({
    ...record,
    seenAt: record.seenAt ?? dismissedAt,
    dismissedAt,
  }));
}

function readLocalRecord(cacheKey: string): DailyStatusCacheRecord | null {
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw) as DailyStatusCacheRecord;
  } catch {
    return null;
  }
}

function writeLocalRecord(record: DailyStatusCacheRecord): void {
  try {
    window.localStorage.setItem(record.cacheKey, JSON.stringify(record));
  } catch {
    // Browser preview storage is best effort; Electron remains the primary store.
  }
}

function updateLocalRecord(
  cacheKey: string,
  update: (record: DailyStatusCacheRecord) => DailyStatusCacheRecord,
): void {
  const record = readLocalRecord(cacheKey);
  if (!record) return;
  writeLocalRecord(update(record));
}
