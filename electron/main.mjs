import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isChannelAllowed, surfaceForSender } from "./ipc-capabilities.mjs";
import { shouldOpenExternalUrl } from "./window-security.mjs";
import { isTrustedSurfaceUrl, surfaceSearchParams } from "./window-surfaces.mjs";
import { normalizePetManifest } from "./pet-manifest.mjs";
import {
  migrateSelectedPetId,
  normalizePetLibraryFolders,
  seedBundledPetLibrary,
} from "./pet-library.mjs";
import {
  createPetSelectionStore,
  selectionPathForUserData,
} from "./pet-selection-store.mjs";
import { runSmokeProbe } from "./smoke-probe.mjs";
import {
  activeVisualInsets,
  clampBoundsToWorkArea,
  dragBoundsForPointer,
  normalizeVisualInsets,
  pointerPassthroughDecision,
  visibleRectFromInsets,
} from "./window-geometry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const isDev = !app.isPackaged;
const isSmoke = process.env.DESKTOP_PET_SMOKE === "1";
const smokePhase = process.env.DESKTOP_PET_SMOKE_PHASE === "restart" ? "restart" : "initial";
const smokeMarkerPrefix = "DESKTOP_PET_SMOKE_RESULT=";
const rendererSecurity = Object.freeze({
  isDev,
  packagedRoot: path.join(projectRoot, "dist"),
});
const mascotAspectRatio = 192 / 208;
const mascotWidthStep = 12;
const defaultMascotWidth = 120;
const mascotSize = { min: 84, max: 228 };
const overlayPadding = 12;
const speechBubbleMinWidth = 340;
const speechBubbleHeadroom = 280;
const pointerHitMonitorMs = 50;

const VALID_STATES = new Set([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
]);
const defaultActionDurationMs = {
  waving: 1600,
  jumping: 1300,
};

const projectPetsDir = path.join(projectRoot, "pets");
let userPetsDir = null;
let activeSelectionStore = null;
const preferredDefaultPetFolder = "jx3-u4e03-u79c0-01";

let mainWindow = null;
let controlWindow = null;
let tray = null;
let isPointerPassthrough = false;
let dragSession = null;
let pointerHitMonitor = null;
let visualInsets = { left: 0, top: 0, right: 0, bottom: 0 };
let currentMascotWidth = defaultMascotWidth;
let petStateResetTimer = null;
let smokeResultEmitted = false;
let controlWindowOpenQueue = Promise.resolve();
const spritesheetUrlCache = new Map();
const petPreviewUrlCache = new Map();

const petState = {
  state: "idle",
  selectedPetId: null,
  pets: [],
};

function createWindow() {
  const initialBounds = currentWindowBounds();
  const minimumBounds = overlayBoundsForMascot(mascotSize.min);
  let hasRevealedInitialPetWindow = false;
  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: minimumBounds.width,
    minHeight: minimumBounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#00000000",
    title: "Desktop Pet MVP",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  installNavigationGuards(mainWindow);
  installSmokeProbe(mainWindow);
  applyAlwaysOnTopSetting();
  mainWindow.setMenuBarVisibility(false);
  const wakeBounds = centeredOverlayBounds(initialBounds);
  if (wakeBounds) mainWindow.setBounds(wakeBounds, false);

  void loadWindowSurface(mainWindow, "pet").catch((error) => {
    console.error("Failed to load pet window:", error);
  });

  const revealInitialPetWindow = () => {
    if (hasRevealedInitialPetWindow || !mainWindow || mainWindow.isDestroyed()) return;
    hasRevealedInitialPetWindow = true;
    revealPetWindow({ center: true, action: false });
  };
  mainWindow.once("ready-to-show", revealInitialPetWindow);
  mainWindow.webContents.once("did-finish-load", revealInitialPetWindow);

  mainWindow.on("closed", () => {
    stopOverlayDrag();
    stopInertia();
    stopPointerHitMonitor();
    mainWindow = null;
  });
}

function openControlWindow() {
  const request = controlWindowOpenQueue.then(() => openControlWindowNow());
  controlWindowOpenQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

async function openControlWindowNow() {
  const panel = "picker";

  if (controlWindow && !controlWindow.isDestroyed()) {
    const window = controlWindow;
    await loadWindowSurface(window, "control", panel);
    if (window.isDestroyed()) throw new Error("control_window_closed_during_load");
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return window;
  }

  const window = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 640,
    minHeight: 520,
    frame: false,
    transparent: false,
    hasShadow: true,
    resizable: true,
    fullscreenable: false,
    focusable: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: "#f7f7f8",
    title: "选择桌宠",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  controlWindow = window;

  installNavigationGuards(window);
  window.setMenuBarVisibility(false);
  window.on("closed", () => {
    if (controlWindow === window) controlWindow = null;
  });
  window.on("focus", () => {
    void reloadPetLibrary().catch((error) => {
      console.error("Failed to refresh pet library:", error);
    });
  });

  try {
    await loadWindowSurface(window, "control", panel);
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    if (controlWindow === window) controlWindow = null;
    throw error;
  }
  if (window.isDestroyed()) throw new Error("control_window_closed_during_load");
  window.show();
  window.focus();
  return window;
}

function showControlWindow() {
  void openControlWindow().catch((error) => {
    console.error("Failed to open pet picker:", error);
  });
}

function closeControlWindow() {
  const window = controlWindow;
  if (!window || window.isDestroyed()) return false;
  setImmediate(() => {
    if (!window.isDestroyed()) window.close();
  });
  return true;
}

function loadWindowSurface(window, surface, panel) {
  const searchParams = surfaceSearchParams(surface, panel);
  if (isDev) {
    const url = new URL("http://127.0.0.1:5173");
    url.search = searchParams.toString();
    return window.loadURL(url.href);
  }

  return window.loadFile(path.join(projectRoot, "dist", "index.html"), {
    query: Object.fromEntries(searchParams),
  });
}

function installSmokeProbe(window) {
  if (!isSmoke) return;
  window.webContents.once("did-finish-load", () => {
    void runSmokeProbe({
      petWindow: window,
      phase: smokePhase,
      openControlWindow,
    }).then(
      (result) => emitSmokeResult({ ok: true, ...result }),
      (error) => emitSmokeResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      emitSmokeResult({
        ok: false,
        error: `renderer_load_failed:${errorCode}:${errorDescription}:${validatedUrl}`,
      });
    },
  );
}

function emitSmokeResult(result) {
  if (!isSmoke || smokeResultEmitted) return;
  smokeResultEmitted = true;
  console.log(`${smokeMarkerPrefix}${JSON.stringify({
    kind: "desktop-pet-smoke",
    phase: smokePhase,
    ...result,
  })}`);
}

async function loadPets() {
  const pets = [];
  for (const entry of petDirectories()) {
    const folders = await readdir(entry.dir, { withFileTypes: true }).catch(() => []);
    for (const folder of folders) {
      if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
      const petFolder = path.join(entry.dir, folder.name);
      const manifestPath = path.join(petFolder, "pet.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
        const manifestResult = normalizePetManifest(rawManifest);
        if (!manifestResult.ok) continue;
        const manifest = manifestResult.manifest;
        const spritesheetPath = resolveSafePetAssetPath(petFolder, manifest.spritesheetPath);
        if (!spritesheetPath) continue;
        if (!existsSync(spritesheetPath)) continue;
        pets.push({
          ...manifest,
          id: `${entry.source}:${manifest.id}`,
          folder: petFolder,
          source: entry.source,
          spritesheetFilePath: spritesheetPath,
        });
      } catch {
        // Ignore broken pet folders; this keeps the app bootable while iterating.
      }
    }
  }

  petState.pets = sortPetsForMvp(pets);
  if (!petState.selectedPetId || !petState.pets.some((pet) => pet.id === petState.selectedPetId)) {
    petState.selectedPetId = defaultPetId(petState.pets);
  }
  broadcastStatus();
  return petState.pets;
}

function petDirectories() {
  return userPetsDir ? [{ source: "user", dir: userPetsDir }] : [];
}

async function reloadPetLibrary() {
  const selectedPetIdBefore = petState.selectedPetId;
  spritesheetUrlCache.clear();
  petPreviewUrlCache.clear();
  await loadPets();
  if (selectedPetIdBefore !== petState.selectedPetId) {
    await activeSelectionStore?.write(petState.selectedPetId);
  }
  return status();
}

async function openPetLibrary() {
  if (!userPetsDir) throw new Error("pet_library_unavailable");
  await mkdir(userPetsDir, { recursive: true });
  const error = await shell.openPath(userPetsDir);
  if (error) throw new Error(`pet_library_open_failed:${error}`);
  return userPetsDir;
}

function applyLaunchAtLogin(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled === true });
}

async function setLaunchAtLogin(enabled) {
  const nextValue = enabled === true;
  applyLaunchAtLogin(nextValue);
  await activeSelectionStore.writeLaunchAtLogin(nextValue);
  return nextValue;
}

function sortPetsForMvp(pets) {
  return [...pets].sort((left, right) => {
    const scoreDelta = petSortScore(left) - petSortScore(right);
    if (scoreDelta !== 0) return scoreDelta;
    return left.displayName.localeCompare(right.displayName, "zh-Hans-CN");
  });
}

function petSortScore(pet) {
  if (pet.id === `user:${preferredDefaultPetFolder}`) return 0;
  if (pet.id.startsWith("user:jx3-")) return 1;
  return 2;
}

function defaultPetId(pets) {
  return (
    pets.find((pet) => pet.id === `user:${preferredDefaultPetFolder}`)?.id ??
    pets.find((pet) => pet.id.startsWith("user:jx3-"))?.id ??
    pets[0]?.id ??
    null
  );
}

function centeredOverlayBounds(bounds = mainWindow?.getBounds() ?? currentWindowBounds()) {
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    return clampBoundsToDisplay({
      ...bounds,
      x: Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2),
      y: Math.round(display.workArea.y + display.workArea.height * 0.58 - bounds.height / 2),
    });
  } catch {
    return null;
  }
}

async function fileToDataUrl(filePath) {
  const bytes = await readFile(filePath);
  return `data:${mimeFor(filePath)};base64,${bytes.toString("base64")}`;
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "image/webp";
}

function resolveSafePetAssetPath(petFolder, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return null;
  if (
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    return null;
  }

  const parts = relativePath.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;

  const resolvedPetFolder = path.resolve(petFolder);
  const filePath = path.resolve(resolvedPetFolder, ...parts);
  return isPathInside(filePath, resolvedPetFolder) ? filePath : null;
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function selectedPet() {
  const pet = selectedPetMeta();
  return pet ? hydratePet(pet) : null;
}

function selectedPetMeta() {
  return petState.pets.find((pet) => pet.id === petState.selectedPetId) ?? null;
}

async function status() {
  return {
    selectedPet: await selectedPet(),
    state: petState.state,
    pets: petState.pets.map(publicPet),
    mascotWidthPx: currentMascotWidth,
  };
}

async function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pet:status-changed", await status());
}

function setPetState(nextState, durationMs) {
  if (!VALID_STATES.has(nextState)) {
    throw new Error(`Unsupported pet state: ${String(nextState)}`);
  }

  clearPetStateResetTimer();
  petState.state = nextState;
  broadcastStatus();

  if (nextState === "waving" || nextState === "jumping") {
    const resetAfterMs = normalizePetStateDuration(nextState, durationMs);
    petStateResetTimer = setTimeout(() => {
      petStateResetTimer = null;
      if (petState.state !== nextState) return;
      petState.state = "idle";
      broadcastStatus();
    }, resetAfterMs);
  }

  return petState.state;
}

function playPetAction(state, durationMs) {
  return setPetState(state, durationMs);
}

function normalizePetStateDuration(state, value) {
  const number = Number(value);
  if (value !== undefined && value !== null && Number.isFinite(number)) {
    return clamp(Math.round(number), 0, 30_000);
  }
  return defaultActionDurationMs[state];
}

function clearPetStateResetTimer() {
  if (petStateResetTimer === null) return;
  clearTimeout(petStateResetTimer);
  petStateResetTimer = null;
}

function registerIpc(selectionStore) {
  const handle = (channel, listener) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertAuthorizedIpcSender(event, channel);
      return listener(...args);
    });
  };
  const on = (channel, listener) => {
    ipcMain.on(channel, (event, ...args) => {
      try {
        assertAuthorizedIpcSender(event, channel);
      } catch {
        return;
      }
      listener(...args);
    });
  };

  handle("pet:get-status", () => status());
  handle("pet:list", () => petState.pets.map(publicPet));
  handle("pet:preview", async (id) => {
    const pet = petState.pets.find((candidate) => candidate.id === id);
    if (!pet) return null;
    return petPreviewUrl(pet);
  });
  handle("pet:select", async (id) => {
    const pet = await selectPetById(id, selectionStore);
    return pet ? hydratePet(pet) : null;
  });
  handle("pet:library-open", () => openPetLibrary());
  handle("app:launch-at-login-get", () => selectionStore.readLaunchAtLogin());
  handle("app:launch-at-login-set", (enabled) => setLaunchAtLogin(enabled));
  handle("pet:set-state", (payload) =>
    setPetState(payload?.state, payload?.durationMs),
  );
  on("window:drag-start", (payload) => {
    startOverlayDrag(payload);
  });
  on("window:drag-move", (payload) => {
    moveOverlayDrag(payload);
  });
  on("window:drag-end", () => {
    stopOverlayDrag();
  });
  handle("window:resize-mascot", async (payload) => {
    const width = resizeOverlayForMascot(payload?.widthPx);
    if (payload?.persist === true) await selectionStore.writeMascotWidth(width);
    return width;
  });
  on("window:visual-insets", (insets) => {
    setVisualInsets(insets);
  });
  on("window:pointer-passthrough", (enabled) => {
    setPointerPassthrough(Boolean(enabled));
  });
  handle("window:control-close", () => closeControlWindow());
  handle("window:context-menu", () => {
    showPetContextMenu();
  });
  handle("app:close", () => app.quit());
}

function assertAuthorizedIpcSender(event, channel) {
  const surface = surfaceForSender(event?.sender?.id, {
    petWebContentsId: mainWindow?.webContents?.id,
    controlWebContentsId: controlWindow?.webContents?.id,
  });
  if (!surface) throw new Error(`ipc_unknown_sender:${String(channel)}`);

  const senderUrl = senderUrlForIpcEvent(event);
  if (!isTrustedSurfaceUrl(senderUrl, rendererSecurity)) {
    throw new Error(`ipc_untrusted_surface:${surface}:${String(channel)}`);
  }

  const urlSurface = new URL(senderUrl).searchParams.get("surface");
  if (urlSurface !== surface) {
    throw new Error(`ipc_surface_mismatch:${surface}:${String(channel)}`);
  }

  if (!isChannelAllowed(surface, channel)) {
    throw new Error(`ipc_forbidden:${surface}:${String(channel)}`);
  }
  return surface;
}

function senderUrlForIpcEvent(event) {
  return event?.senderFrame?.url ?? event?.sender?.getURL?.() ?? "";
}

function installNavigationGuards(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedSurfaceUrl(url, rendererSecurity)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
}

function openExternalUrl(url) {
  if (!shouldOpenExternalUrl(url)) return;
  shell.openExternal(url).catch((error) => {
    console.error("Failed to open external URL:", error);
  });
}

function applyAlwaysOnTopSetting() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
}

async function selectPetById(id, selectionStore) {
  const pet = petState.pets.find((candidate) => candidate.id === id) ?? null;
  if (!pet) return null;
  petState.selectedPetId = pet.id;
  await selectionStore.write(pet.id);
  broadcastStatus();
  return pet;
}

function overlayBoundsForMascot(widthPx) {
  return {
    width: Math.ceil(Math.max(widthPx + overlayPadding * 2, speechBubbleMinWidth)),
    height: Math.ceil(widthPx / mascotAspectRatio + overlayPadding * 2 + speechBubbleHeadroom),
  };
}

function currentWindowBounds() {
  return overlayBoundsForMascot(currentMascotWidth);
}

function resizeOverlayForMascot(widthPx) {
  const width = clamp(
    Math.round(Number(widthPx) / mascotWidthStep) * mascotWidthStep,
    mascotSize.min,
    mascotSize.max,
  );
  if (!Number.isFinite(width)) return currentMascotWidth;
  currentMascotWidth = width;
  if (!mainWindow || mainWindow.isDestroyed()) return width;

  const bounds = mainWindow.getBounds();
  const overlayBounds = overlayBoundsForMascot(width);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const nextBounds = clampBoundsToDisplay({
    x: Math.round(center.x - overlayBounds.width / 2),
    y: Math.round(center.y - overlayBounds.height / 2),
    ...overlayBounds,
  });
  mainWindow.setBounds(nextBounds, false);
  return width;
}

function setVisualInsets(insets) {
  visualInsets = normalizeVisualInsets(insets);
}

function setPointerPassthrough(enabled, { force = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!force && isPointerPassthrough === enabled) return;
  isPointerPassthrough = enabled;
  mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
}

function startPointerHitMonitor() {
  if (pointerHitMonitor !== null) return;
  pointerHitMonitor = setInterval(updatePointerPassthroughFromCursor, pointerHitMonitorMs);
}

function stopPointerHitMonitor() {
  if (pointerHitMonitor === null) return;
  clearInterval(pointerHitMonitor);
  pointerHitMonitor = null;
}

function updatePointerPassthroughFromCursor() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const decision = pointerPassthroughDecision({
    bounds: mainWindow.getBounds(),
    cursor: screen.getCursorScreenPoint(),
    isVisible: mainWindow.isVisible(),
    isDragging: Boolean(dragSession),
  });
  if (decision === "passthrough") {
    setPointerPassthrough(true);
    return;
  }
  if (decision === "interactive") {
    setPointerPassthrough(false);
  }
}

function startOverlayDrag(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pointerWindowX = Number(payload?.pointerWindowX);
  const pointerWindowY = Number(payload?.pointerWindowY);
  if (!Number.isFinite(pointerWindowX) || !Number.isFinite(pointerWindowY)) return;

  stopOverlayDrag();
  stopInertia();
  setPointerPassthrough(false);
  const bounds = mainWindow.getBounds();
  const insets = activeVisualInsets(bounds, visualInsets, currentMascotWidth, mascotAspectRatio);
  dragSession = {
    bounds,
    pointerWindowOffset: {
      x: pointerWindowX,
      y: pointerWindowY,
    },
    insets,
    hasMoved: false,
    timer: setInterval(() => {
      if (!dragSession) return;
      const cursor = screen.getCursorScreenPoint();
      moveOverlayWindow({ screenX: cursor.x, screenY: cursor.y }, dragSession);
    }, 16),
  };
}

function moveOverlayDrag(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const point = {
    x: Number(payload?.screenX),
    y: Number(payload?.screenY),
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;

  stopInertia();
  setPointerPassthrough(false);
  if (dragSession) dragSession.hasMoved = true;
  moveOverlayWindow(payload, dragSession);
}

function stopOverlayDrag() {
  if (!dragSession) return;
  clearInterval(dragSession.timer);
  dragSession = null;
}

function stopInertia() {
  // Dragging is intentionally direct: no release momentum or inertial timer.
}

function moveOverlayWindow(payload, session = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = session?.bounds ?? mainWindow.getBounds();
  const point = {
    x: Number(payload?.screenX),
    y: Number(payload?.screenY),
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;

  const fallbackPointerWindowX = Number(payload?.pointerWindowX);
  const fallbackPointerWindowY = Number(payload?.pointerWindowY);
  const pointerWindowOffset = session?.pointerWindowOffset ?? {
    x: Number.isFinite(fallbackPointerWindowX) ? fallbackPointerWindowX : Math.round(bounds.width / 2),
    y: Number.isFinite(fallbackPointerWindowY) ? fallbackPointerWindowY : Math.round(bounds.height / 2),
  };
  const targetBounds = {
    ...bounds,
    x: Math.round(point.x - pointerWindowOffset.x),
    y: Math.round(point.y - pointerWindowOffset.y),
  };
  const display = screen.getDisplayMatching(targetBounds);
  const next = dragBoundsForPointer({
    bounds,
    pointer: point,
    pointerWindowOffset,
    workArea: display.workArea,
    insets: session?.insets ?? activeVisualInsets(bounds, visualInsets, currentMascotWidth, mascotAspectRatio),
  });
  mainWindow.setPosition(next.x, next.y, false);
}

function clampBoundsToDisplay(bounds, insetsOverride = null) {
  const display = screen.getDisplayMatching(bounds);
  const insets = insetsOverride ??
    activeVisualInsets(bounds, visualInsets, currentMascotWidth, mascotAspectRatio);
  return clampBoundsToWorkArea(bounds, display.workArea, insets);
}

function showPetContextMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  Menu.buildFromTemplate([
    {
      label: "选择宠物...",
      click: () => showControlWindow(),
    },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]).popup({ window: mainWindow });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createTray() {
  const image = nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip("Desktop Pet MVP");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Choose Pet...", click: () => showControlWindow() },
      { type: "separator" },
      {
        label: "Wake",
        click: () => {
          revealPetWindow({ center: true });
        },
      },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function windowStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { exists: false };
  }
  const bounds = mainWindow.getBounds();
  const activeInsets = activeVisualInsets(
    bounds,
    visualInsets,
    currentMascotWidth,
    mascotAspectRatio,
  );
  return {
    exists: true,
    visible: mainWindow.isVisible(),
    focused: mainWindow.isFocused(),
    bounds,
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    pointerPassthrough: isPointerPassthrough,
    pointerHitMonitor: pointerHitMonitor !== null,
    transparent: true,
    visualInsets,
    activeVisualInsets: activeInsets,
    visibleRect: visibleRectFromInsets(bounds, activeInsets),
  };
}

function revealPetWindow(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return windowStatus();

  stopOverlayDrag();
  stopInertia();
  applyAlwaysOnTopSetting();

  if (options.center) {
    const nextBounds = centeredOverlayBounds(mainWindow.getBounds());
    if (nextBounds) mainWindow.setBounds(nextBounds, false);
  }

  process.platform === "win32" ? mainWindow.show() : mainWindow.showInactive();

  mainWindow.moveTop();
  setPointerPassthrough(true);
  startPointerHitMonitor();
  if (options.action !== false) playPetAction("waving", 1800);
  broadcastStatus();
  return windowStatus();
}

function publicPet(pet) {
  const {
    spritesheetFilePath,
    spritesheetUrl,
    ...rest
  } = pet;
  return rest;
}

async function hydratePet(pet) {
  let spritesheetUrl = spritesheetUrlCache.get(pet.id);
  if (!spritesheetUrl) {
    spritesheetUrl = await fileToDataUrl(pet.spritesheetFilePath);
    spritesheetUrlCache.set(pet.id, spritesheetUrl);
  }
  return {
    ...publicPet(pet),
    spritesheetUrl,
  };
}

async function petPreviewUrl(pet) {
  let previewUrl = petPreviewUrlCache.get(pet.id);
  if (!previewUrl) {
    previewUrl = await fileToDataUrl(pet.spritesheetFilePath);
    petPreviewUrlCache.set(pet.id, previewUrl);
  }
  return previewUrl;
}

app.whenReady().then(async () => {
  const selectionStore = createPetSelectionStore(
    selectionPathForUserData(app.getPath("userData")),
  );
  activeSelectionStore = selectionStore;
  userPetsDir = path.join(app.getPath("userData"), "pets");
  await seedBundledPetLibrary({ bundledRoot: projectPetsDir, libraryRoot: userPetsDir });
  await normalizePetLibraryFolders(userPetsDir);
  const storedPetId = migrateSelectedPetId(await selectionStore.read());
  currentMascotWidth = await selectionStore.readMascotWidth() ?? defaultMascotWidth;
  applyLaunchAtLogin(await selectionStore.readLaunchAtLogin());
  petState.selectedPetId = storedPetId;
  registerIpc(selectionStore);
  await loadPets().catch((error) => {
    console.error("Failed to load bundled pets:", error);
  });
  if (storedPetId !== petState.selectedPetId) {
    await selectionStore.write(petState.selectedPetId);
  }
  createWindow();
  if (!isSmoke) createTray();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  clearPetStateResetTimer();
  stopOverlayDrag();
  stopInertia();
  stopPointerHitMonitor();
});
