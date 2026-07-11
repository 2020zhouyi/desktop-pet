import assert from "node:assert/strict";
import {
  bubbleScenes,
  bubbleTextForPet,
  type BubbleScene,
} from "../../src/petBubbles.ts";
import type { PetOption } from "../../src/types.ts";

const activeScenes = ["welcome", "click", "drag", "petSwitch"] as const satisfies
  readonly BubbleScene[];

const pets: Array<{ kind: string; pet: PetOption }> = [
  {
    kind: "built-in",
    pet: createPet("七秀 Codex Pet 1", "project:jx3-u4e03-u79c0-01"),
  },
  {
    kind: "player",
    pet: createPet("春丽", "project:player-01"),
  },
  {
    kind: "boss",
    pet: createPet("唐怀仁", "project:boss-01"),
  },
];

for (const { kind, pet } of pets) {
  for (const scene of activeScenes) {
    assert.ok(
      bubbleTextForPet(pet, scene).trim().length > 0,
      `${kind} pet should have non-empty ${scene} bubble text`,
    );
  }
}

assert.deepEqual(
  bubbleScenes,
  activeScenes,
  "runtime bubble scenes should expose only the four direct-interaction scenes",
);

const retiredScenes = [
  "idle",
  "clickCombo",
  "idleLong",
  "dragLong",
  "rare",
  "comfort",
  "morning",
  "evening",
  "longSession",
  "importSuccess",
  "importFail",
  "sleep",
  "wake",
  "reminder",
] as const;

for (const scene of retiredScenes) {
  assert.equal(
    (bubbleScenes as readonly string[]).includes(scene),
    false,
    `${scene} should not be an available runtime bubble scene`,
  );
}

assert.throws(() => bubbleTextForPet(pets[0].pet, "reminder" as never));

const editablePet = createPet("可编辑角色", "user:editable-pet");
editablePet.bubbleLines = {
  welcome: ["角色 JSON 欢迎词"],
  click: ["角色 JSON 点击词"],
  drag: ["角色 JSON 拖拽词"],
  petSwitch: ["角色 JSON 切换词"],
};
assert.equal(bubbleTextForPet(editablePet, "welcome"), "角色 JSON 欢迎词");
assert.equal(bubbleTextForPet(editablePet, "click"), "角色 JSON 点击词");

console.log("slim bubble tests passed");

function createPet(displayName: string, id: string): PetOption {
  return {
    id,
    displayName,
    spritesheetPath: "spritesheet.webp",
    folder: "/tmp/pet",
    source: "project",
  };
}
