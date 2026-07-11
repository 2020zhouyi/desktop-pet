const commonChannels = new Set([
  "pet:get-status",
  "pet:set-state",
]);

const petOnlyChannels = new Set([
  "window:drag-start",
  "window:drag-move",
  "window:drag-end",
  "window:resize-mascot",
  "window:visual-insets",
  "window:pointer-passthrough",
  "window:context-menu",
  "app:close",
]);

const controlOnlyChannels = new Set([
  "pet:list",
  "pet:preview",
  "pet:select",
  "pet:library-open",
  "window:control-close",
]);

export function surfaceForSender(senderId, webContentsIds = {}) {
  if (!isWebContentsId(senderId)) return null;

  const petMatches = isWebContentsId(webContentsIds?.petWebContentsId) &&
    senderId === webContentsIds.petWebContentsId;
  const controlMatches = isWebContentsId(webContentsIds?.controlWebContentsId) &&
    senderId === webContentsIds.controlWebContentsId;

  if (petMatches === controlMatches) return null;
  return petMatches ? "pet" : "control";
}

export function isChannelAllowed(surface, channel) {
  if (typeof channel !== "string") return false;
  if (commonChannels.has(channel)) return surface === "pet" || surface === "control";
  if (surface === "pet") return petOnlyChannels.has(channel);
  if (surface === "control") return controlOnlyChannels.has(channel);
  return false;
}

function isWebContentsId(value) {
  return Number.isInteger(value) && value > 0;
}
