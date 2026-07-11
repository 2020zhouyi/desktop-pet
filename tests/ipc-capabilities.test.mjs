import assert from "node:assert/strict";
import {
  isChannelAllowed,
  surfaceForSender,
} from "../electron/ipc-capabilities.mjs";

const commonChannels = [
  "pet:get-status",
  "pet:set-state",
];
const petOnlyChannels = [
  "window:drag-start",
  "window:drag-move",
  "window:drag-end",
  "window:resize-mascot",
  "window:visual-insets",
  "window:pointer-passthrough",
  "window:context-menu",
  "app:close",
];
const controlOnlyChannels = [
  "pet:list",
  "pet:preview",
  "pet:select",
  "pet:library-open",
  "window:control-close",
];
const allKnownChannels = [
  ...commonChannels,
  ...petOnlyChannels,
  ...controlOnlyChannels,
];

for (const removedChannel of ["settings:get", "settings:update"]) {
  assert.equal(isChannelAllowed("pet", removedChannel), false);
  assert.equal(isChannelAllowed("control", removedChannel), false);
}

const senderIds = {
  petWebContentsId: 101,
  controlWebContentsId: 202,
};

assert.equal(surfaceForSender(101, senderIds), "pet");
assert.equal(surfaceForSender(202, senderIds), "control");
assert.equal(surfaceForSender(303, senderIds), null);

for (const invalidSenderId of [undefined, null, 0, -1, 1.5, "101", Number.NaN]) {
  assert.equal(
    surfaceForSender(invalidSenderId, senderIds),
    null,
    `invalid sender ${String(invalidSenderId)} must be rejected`,
  );
}

assert.equal(
  surfaceForSender(101, {
    petWebContentsId: 101,
    controlWebContentsId: 101,
  }),
  null,
  "an ambiguous sender ID must fail closed",
);
assert.equal(surfaceForSender(101, {}), null);
assert.equal(surfaceForSender(101), null);

for (const surface of ["pet", "control", null, "unknown"]) {
  for (const channel of allKnownChannels) {
    const expected = (surface === "pet" || surface === "control") &&
      (commonChannels.includes(channel) ||
        (surface === "pet" && petOnlyChannels.includes(channel)) ||
        (surface === "control" && controlOnlyChannels.includes(channel)));
    assert.equal(
      isChannelAllowed(surface, channel),
      expected,
      `${String(surface)} ${expected ? "should allow" : "must reject"} ${channel}`,
    );
  }
}

for (const surface of ["pet", "control", null, "unknown"]) {
  for (const unknownChannel of [
    "",
    "pet:get-status ",
    "pet:get-status:admin",
    "window:drag",
    "window:control-open",
    "toString",
    undefined,
    null,
    0,
  ]) {
    assert.equal(
      isChannelAllowed(surface, unknownChannel),
      false,
      `${String(surface)} must reject unknown channel ${String(unknownChannel)}`,
    );
  }
}

console.log("IPC capability tests passed");
