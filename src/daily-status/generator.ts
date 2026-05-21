import { dailyStatusSkinForMenpai } from "./skins";
import type { DailyJianghuStatus, DailyStatusRequest } from "./types";

const summaries = [
  "今天适合慢一点，但别忘了出手。",
  "小宠状态正好，适合轻轻开工。",
  "江湖风向不错，先把心气稳住。",
];

export function generateDailyStatus(request: DailyStatusRequest): DailyJianghuStatus {
  const skin = dailyStatusSkinForMenpai(request.menpai);
  const random = createSeededRandom(hashStringToUint32(
    `${request.date}:${request.petId}:${request.menpai}:${skin.skinVersion}`,
  ));

  return {
    date: request.date,
    petId: request.petId,
    menpai: request.menpai,
    skinId: skin.skinId,
    skinVersion: skin.skinVersion,
    animalAnchor: skin.animalAnchor,
    glyph: skin.glyph,
    title: pickBySeed(skin.titlePool, random),
    summary: pickBySeed(summaries, random),
    metrics: {
      momentum: metric(random),
      heart: metric(random),
      social: metric(random),
    },
    goodFor: pickManyBySeed(skin.goodForPool, random, 2),
    avoid: pickManyBySeed(skin.avoidPool, random, 1),
    petLine: pickBySeed(skin.linePool, random),
    actionId: "daily.reveal.generic",
  };
}

export function hashStringToUint32(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let value = seed || 0x9e3779b9;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickBySeed<T>(items: T[], random: () => number): T {
  if (items.length === 0) throw new Error("Cannot pick from an empty pool.");
  return items[Math.floor(random() * items.length) % items.length];
}

function pickManyBySeed<T>(items: T[], random: () => number, count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length) % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function metric(random: () => number): number {
  return 35 + Math.floor(random() * 61);
}
