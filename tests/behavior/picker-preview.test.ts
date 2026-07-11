import assert from "node:assert/strict";
import {
  pickerPreviewIds,
  previewRequestSlots,
} from "../../src/control/pickerPreview.ts";

assert.deepEqual(
  pickerPreviewIds(
    ["pet-01", "pet-01", "pet-02", "pet-03"],
    "pet-02",
  ),
  ["pet-01", "pet-02", "pet-03"],
  "visible card IDs and the detail ID should be deduplicated",
);

assert.deepEqual(
  pickerPreviewIds(["pet-01", "pet-02"], "pet-09"),
  ["pet-01", "pet-02", "pet-09"],
  "the current detail pet should be appended when it is not visible",
);

const cappedIds = pickerPreviewIds(
  Array.from({ length: 30 }, (_, index) => `pet-${String(index + 1).padStart(2, "0")}`),
  "pet-30",
);
assert.deepEqual(
  cappedIds,
  [
    "pet-01",
    "pet-02",
    "pet-03",
    "pet-04",
    "pet-05",
    "pet-06",
    "pet-07",
    "pet-08",
    "pet-30",
  ],
  "only eight visible cards plus one detail pet may request previews",
);
assert.ok(cappedIds.length <= 9, "picker preview requests must never exceed nine IDs");

const inFlight = new Set(cappedIds);
assert.deepEqual(
  previewRequestSlots(
    Array.from({ length: 9 }, (_, index) => `next-${index + 1}`),
    inFlight,
    new Set(),
  ),
  [],
  "rapid paging must not start another batch while nine previews are in flight",
);
inFlight.delete("pet-01");
inFlight.delete("pet-02");
assert.deepEqual(
  previewRequestSlots(["next-1", "next-2", "next-3"], inFlight, new Set()),
  ["next-1", "next-2"],
  "the current page may fill only the slots released by completed old requests",
);

console.log("picker preview tests passed");
