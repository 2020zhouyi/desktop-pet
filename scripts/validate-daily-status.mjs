import {
  dailyStatusSkins,
  generateDailyStatus,
} from "../electron/daily-status-store.mjs";

const expectedMenpaiCount = 20;
const bannedWords = ["必出", "强度排行", "官方Logo", "官方 LOGO", "技能图标"];

const errors = [];
const menpai = new Set(dailyStatusSkins.map((skin) => skin.menpai));

if (dailyStatusSkins.length !== expectedMenpaiCount || menpai.size !== expectedMenpaiCount) {
  errors.push(`Expected ${expectedMenpaiCount} unique menpai skins, got ${menpai.size}.`);
}

for (const skin of dailyStatusSkins) {
  if (skin.titlePool.length < 3) errors.push(`${skin.menpai} needs at least 3 titles.`);
  if (skin.linePool.length < 6) errors.push(`${skin.menpai} needs at least 6 lines.`);
  if (skin.goodForPool.length < 3) errors.push(`${skin.menpai} needs at least 3 goodFor items.`);
  if (skin.avoidPool.length < 2) errors.push(`${skin.menpai} needs at least 2 avoid items.`);

  const status = generateDailyStatus({
    date: "2026-05-21",
    petId: `test:${skin.menpai}`,
    menpai: skin.menpai,
  });
  const sameStatus = generateDailyStatus({
    date: "2026-05-21",
    petId: `test:${skin.menpai}`,
    menpai: skin.menpai,
  });

  if (JSON.stringify(status) !== JSON.stringify(sameStatus)) {
    errors.push(`${skin.menpai} generation is not deterministic.`);
  }

  for (const [name, value] of Object.entries(status.metrics)) {
    if (value < 35 || value > 95) {
      errors.push(`${skin.menpai}.${name} is outside 35-95: ${value}.`);
    }
  }

  const text = [
    status.title,
    status.summary,
    status.petLine,
    ...status.goodFor,
    ...status.avoid,
  ].join("");
  if (Array.from(text).length > 90) {
    errors.push(`${skin.menpai} card text exceeds 90 chars.`);
  }
  for (const word of bannedWords) {
    if (text.includes(word)) errors.push(`${skin.menpai} includes banned word: ${word}.`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Daily status validation passed: ${dailyStatusSkins.length} skins.`);
