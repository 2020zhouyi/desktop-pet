export const requiredManifestFields = ["id", "displayName", "spritesheetPath"];

export const manifestOptionalFields = [
  "author",
  "version",
  "tags",
  "faction",
  "recommendedScale",
  "accentColor",
  "behaviorProfile",
];

const stringOptionalFields = new Set([
  "author",
  "version",
  "faction",
  "behaviorProfile",
]);

const minRecommendedScale = 0.5;
const maxRecommendedScale = 2;

export function normalizePetManifest(value) {
  const required = validateManifestRequiredFields(value);
  if (required.missingFields.length > 0) {
    return { ok: false, missingFields: required.missingFields, manifest: null };
  }

  const manifest = {
    ...value,
    id: required.values.id,
    displayName: required.values.displayName,
    spritesheetPath: required.values.spritesheetPath,
  };

  if (typeof value.description === "string" && value.description.trim()) {
    manifest.description = value.description.trim();
  } else {
    delete manifest.description;
  }

  for (const field of manifestOptionalFields) {
    delete manifest[field];
    const normalized = normalizeOptionalManifestField(field, value[field]);
    if (normalized.valid) manifest[field] = normalized.value;
  }

  return { ok: true, missingFields: [], manifest };
}

export function validateManifestRequiredFields(value) {
  const missingFields = [];
  const values = {};

  for (const field of requiredManifestFields) {
    if (typeof value?.[field] === "string" && value[field].trim()) {
      values[field] = value[field].trim();
    } else {
      missingFields.push(field);
    }
  }

  return { missingFields, values };
}

export function invalidOptionalManifestFields(value) {
  if (!isPlainObject(value)) return [];
  return manifestOptionalFields.filter((field) => {
    if (!hasOwn(value, field)) return false;
    return !normalizeOptionalManifestField(field, value[field]).valid;
  });
}

export function publicManifestMetadata(manifest) {
  const metadata = {};
  for (const field of manifestOptionalFields) {
    if (hasOwn(manifest, field)) metadata[field] = manifest[field];
  }
  return metadata;
}

function normalizeOptionalManifestField(field, value) {
  if (stringOptionalFields.has(field)) {
    if (typeof value !== "string") return invalid();
    const trimmed = value.trim();
    return trimmed ? valid(trimmed) : invalid();
  }

  if (field === "tags") return normalizeTags(value);
  if (field === "recommendedScale") return normalizeRecommendedScale(value);
  if (field === "accentColor") return normalizeAccentColor(value);
  return invalid();
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return invalid();
  const tags = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (tags.some((tag) => !tag)) return invalid();
  return valid(tags);
}

function normalizeRecommendedScale(value) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < minRecommendedScale ||
    number > maxRecommendedScale
  ) {
    return invalid();
  }
  return valid(Math.round(number * 100) / 100);
}

function normalizeAccentColor(value) {
  if (typeof value !== "string") return invalid();
  const trimmed = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return invalid();
  return valid(trimmed.toLowerCase());
}

function valid(value) {
  return { valid: true, value };
}

function invalid() {
  return { valid: false };
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
