import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import http from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BehaviorController } from "./behavior-controller.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const isDev = !app.isPackaged;
const PET_PORT = Number(process.env.DESKTOP_PET_PORT ?? 7777);
const transparentWindow = process.env.DESKTOP_PET_DEBUG !== "1";
const mascotAspectRatio = 192 / 208;
const defaultMascotWidth = 112;
const overlayPadding = 12;
const speechBubbleMinWidth = 340;
const speechBubbleHeadroom = 96;
const pickerWindowBounds = { width: 660, height: 500 };
const windowBounds = transparentWindow
  ? overlayBoundsForMascot(defaultMascotWidth)
  : { width: 520, height: 620 };
const mascotSize = {
  min: 80,
  max: 224,
};
const dragRelease = {
  sampleWindowMs: 100,
  minVelocityPxPerSec: 320,
  maxVelocityPxPerSec: 1600,
  frictionPxPerSec2: 2600,
  frameMs: 16,
};

const VALID_STATES = new Set([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
]);

const petDirs = [
  { source: "project", dir: path.join(projectRoot, "pets") },
];

let mainWindow = null;
let tray = null;
let server = null;
let isPointerPassthrough = false;
let dragSession = null;
let inertiaSession = null;
let visualInsets = { left: 0, top: 0, right: 0, bottom: 0 };
let currentMascotWidth = defaultMascotWidth;
let isPickerOpen = false;
const spritesheetUrlCache = new Map();
const petPreviewUrlCache = new Map();

const petState = {
  state: "idle",
  selectedPetId: null,
  pets: [],
};

const behaviorController = new BehaviorController({
  initialState: petState.state,
  isValidState: (state) => VALID_STATES.has(state),
  onStateChange: (state) => {
    petState.state = state;
    broadcastStatus();
  },
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    minWidth: transparentWindow ? overlayBoundsForMascot(mascotSize.min).width : 220,
    minHeight: transparentWindow ? overlayBoundsForMascot(mascotSize.min).height : 260,
    frame: false,
    transparent: transparentWindow,
    hasShadow: !transparentWindow,
    resizable: true,
    fullscreenable: false,
    focusable: !transparentWindow,
    skipTaskbar: transparentWindow,
    alwaysOnTop: true,
    show: false,
    backgroundColor: transparentWindow ? "#00000000" : "#f7f1e8",
    title: "Desktop Pet MVP",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setMenuBarVisibility(false);
  if (transparentWindow) {
    const cursorPoint = screenPointNearCursor();
    if (cursorPoint) mainWindow.setPosition(cursorPoint.x, cursorPoint.y, false);
  } else {
    mainWindow.center();
  }

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(projectRoot, "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    if (transparentWindow) mainWindow?.showInactive();
    else {
      mainWindow?.show();
      mainWindow?.focus();
    }
    mainWindow?.moveTop();
    setPointerPassthrough(transparentWindow);
    broadcastStatus();
  });

  mainWindow.on("closed", () => {
    stopOverlayDrag();
    stopInertia();
    mainWindow = null;
  });
}

async function loadPets() {
  const pets = [];
  for (const entry of petDirs) {
    await mkdir(entry.dir, { recursive: true });
    const folders = await readdir(entry.dir, { withFileTypes: true }).catch(() => []);
    for (const folder of folders) {
      if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
      const petFolder = path.join(entry.dir, folder.name);
      const manifestPath = path.join(petFolder, "pet.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (!isManifest(manifest)) continue;
        const spritesheetPath = path.resolve(petFolder, manifest.spritesheetPath);
        if (!existsSync(spritesheetPath)) continue;
        pets.push({
          ...manifest,
          id: `${entry.source}:${folder.name}`,
          folder: petFolder,
          source: entry.source,
          spritesheetFilePath: spritesheetPath,
        });
      } catch {
        // Ignore broken pet folders; this keeps the app bootable while iterating.
      }
    }
  }

  petState.pets = pets;
  if (!petState.selectedPetId || !pets.some((pet) => pet.id === petState.selectedPetId)) {
    petState.selectedPetId = pets[0]?.id ?? null;
  }
  broadcastStatus();
  return pets;
}

function screenPointNearCursor() {
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const x = Math.min(
      Math.max(cursor.x - Math.round(windowBounds.width / 2), display.workArea.x),
      display.workArea.x + display.workArea.width - windowBounds.width,
    );
    const y = Math.min(
      Math.max(cursor.y - Math.round(windowBounds.height / 2), display.workArea.y),
      display.workArea.y + display.workArea.height - windowBounds.height,
    );
    return { x, y };
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

function isManifest(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.spritesheetPath === "string"
  );
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
  };
}

async function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pet:status-changed", await status());
}

function setPetState(nextState, durationMs) {
  return behaviorController.requestState(nextState, {
    durationMs,
    source: "state-api",
  });
}

function playPetAction(state, durationMs) {
  return behaviorController.requestState(state, {
    durationMs,
    source: "ui-action",
  });
}

function registerIpc() {
  ipcMain.handle("pet:get-status", () => status());
  ipcMain.handle("pet:list", () => petState.pets.map(publicPet));
  ipcMain.handle("pet:preview", async (_event, id) => {
    const pet = petState.pets.find((candidate) => candidate.id === id);
    if (!pet) return null;
    return petPreviewUrl(pet);
  });
  ipcMain.handle("pet:select", async (_event, id) => {
    const pet = petState.pets.find((candidate) => candidate.id === id) ?? null;
    if (pet) {
      petState.selectedPetId = pet.id;
      broadcastStatus();
    }
    return pet ? hydratePet(pet) : null;
  });
  ipcMain.handle("pet:set-state", (_event, payload) =>
    setPetState(payload?.state, payload?.durationMs),
  );
  ipcMain.on("window:drag-start", (_event, payload) => {
    startOverlayDrag(payload);
  });
  ipcMain.on("window:drag-end", () => {
    stopOverlayDrag();
  });
  ipcMain.on("window:resize-mascot", (_event, widthPx) => {
    resizeOverlayForMascot(widthPx);
  });
  ipcMain.on("window:visual-insets", (_event, insets) => {
    setVisualInsets(insets);
  });
  ipcMain.on("window:pointer-passthrough", (_event, enabled) => {
    setPointerPassthrough(Boolean(enabled));
  });
  ipcMain.on("window:picker-open", (_event, enabled) => {
    setPickerWindowOpen(Boolean(enabled));
  });
  ipcMain.handle("window:context-menu", () => {
    showPetContextMenu();
  });
  ipcMain.handle("app:close", () => app.quit());
}

function overlayBoundsForMascot(widthPx) {
  return {
    width: Math.ceil(Math.max(widthPx + overlayPadding * 2, speechBubbleMinWidth)),
    height: Math.ceil(widthPx / mascotAspectRatio + overlayPadding * 2 + speechBubbleHeadroom),
  };
}

function setVisualInsets(insets) {
  visualInsets = {
    left: finiteNonNegative(insets?.left),
    top: finiteNonNegative(insets?.top),
    right: finiteNonNegative(insets?.right),
    bottom: finiteNonNegative(insets?.bottom),
  };
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function setPointerPassthrough(enabled) {
  if (!mainWindow || mainWindow.isDestroyed() || !transparentWindow) return;
  if (isPickerOpen && enabled) return;
  if (isPointerPassthrough === enabled) return;
  isPointerPassthrough = enabled;
  mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
}

function setPickerWindowOpen(enabled) {
  if (!mainWindow || mainWindow.isDestroyed() || !transparentWindow) return;
  if (isPickerOpen === enabled) return;

  stopOverlayDrag();
  stopInertia();

  if (enabled) {
    const mascotCenter = currentMascotScreenCenter();
    isPickerOpen = true;
    mainWindow.setFocusable(true);
    mainWindow.show();
    mainWindow.moveTop();
    setPointerPassthrough(false);
    resizeWindowForPicker(mascotCenter);
    return;
  }

  const mascotCenter = currentMascotScreenCenter();
  isPickerOpen = false;
  resizeOverlayForMascot(currentMascotWidth, mascotCenter);
  mainWindow.setFocusable(false);
  setPointerPassthrough(true);
}

function resizeWindowForPicker(mascotCenter) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const center = mascotCenter ?? currentMascotScreenCenter();
  const nextBounds = {
    x: Math.round(center.x - pickerWindowBounds.width / 2),
    y: Math.round(center.y - pickerWindowBounds.height / 2),
    width: pickerWindowBounds.width,
    height: pickerWindowBounds.height,
  };
  mainWindow.setBounds(clampBoundsToDisplay(nextBounds), false);
}

function currentMascotScreenCenter() {
  if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 };
  const bounds = mainWindow.getBounds();
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function startOverlayDrag(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pointerWindowX = Number(payload?.pointerWindowX);
  const pointerWindowY = Number(payload?.pointerWindowY);
  if (!Number.isFinite(pointerWindowX) || !Number.isFinite(pointerWindowY)) return;

  stopOverlayDrag();
  stopInertia();
  setPointerPassthrough(false);
  const cursor = screen.getCursorScreenPoint();
  dragSession = {
    pointerWindowX,
    pointerWindowY,
    hasMoved: false,
    samples: [dragSample(cursor)],
    timer: setInterval(() => {
      if (!dragSession) return;
      const cursor = screen.getCursorScreenPoint();
      const previous = dragSession?.samples.at(-1);
      if (previous && (previous.x !== cursor.x || previous.y !== cursor.y)) {
        dragSession.hasMoved = true;
      }
      dragSession.samples = recentDragSamples([...dragSession.samples, dragSample(cursor)]);
      moveOverlayWindow({
        screenX: cursor.x,
        screenY: cursor.y,
        pointerWindowX,
        pointerWindowY,
      });
    }, 16),
  };
}

function stopOverlayDrag() {
  if (!dragSession) return;
  const session = dragSession;
  clearInterval(dragSession.timer);
  dragSession = null;
  const velocity = releaseVelocity(session);
  if (velocity) startInertia(velocity);
}

function dragSample(point) {
  return { x: point.x, y: point.y, timeMs: Date.now() };
}

function recentDragSamples(samples) {
  const latest = samples.at(-1);
  if (!latest) return samples;
  return samples.filter((sample) => latest.timeMs - sample.timeMs <= dragRelease.sampleWindowMs);
}

function releaseVelocity(session) {
  if (!session.hasMoved) return null;
  const samples = recentDragSamples(session.samples);
  const latest = samples.at(-1);
  if (!latest) return null;
  const previous = samples.find((sample) => latest.timeMs - sample.timeMs > dragRelease.frameMs);
  if (!previous) return null;

  const seconds = (latest.timeMs - previous.timeMs) / 1000;
  if (seconds <= 0) return null;

  const velocity = {
    x: (latest.x - previous.x) / seconds,
    y: (latest.y - previous.y) / seconds,
  };
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < dragRelease.minVelocityPxPerSec) return null;
  if (speed <= dragRelease.maxVelocityPxPerSec) return velocity;

  const scale = dragRelease.maxVelocityPxPerSec / speed;
  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
  };
}

function startInertia(velocity) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopInertia();

  inertiaSession = {
    velocity,
    lastMs: Date.now(),
    timer: setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !inertiaSession) {
        stopInertia();
        return;
      }

      const nowMs = Date.now();
      const seconds = Math.min((nowMs - inertiaSession.lastMs) / 1000, 0.05);
      inertiaSession.lastMs = nowMs;

      const bounds = mainWindow.getBounds();
      const next = clampBoundsToDisplay({
        ...bounds,
        x: bounds.x + Math.round(inertiaSession.velocity.x * seconds),
        y: bounds.y + Math.round(inertiaSession.velocity.y * seconds),
      });

      const hitHorizontalEdge = next.x !== bounds.x + Math.round(inertiaSession.velocity.x * seconds);
      const hitVerticalEdge = next.y !== bounds.y + Math.round(inertiaSession.velocity.y * seconds);
      if (hitHorizontalEdge) inertiaSession.velocity.x = 0;
      if (hitVerticalEdge) inertiaSession.velocity.y = 0;

      mainWindow.setPosition(next.x, next.y, false);
      dampVelocity(inertiaSession.velocity, seconds);

      if (Math.hypot(inertiaSession.velocity.x, inertiaSession.velocity.y) < 35) {
        stopInertia();
      }
    }, dragRelease.frameMs),
  };
}

function dampVelocity(velocity, seconds) {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= 0) return;
  const nextSpeed = Math.max(0, speed - dragRelease.frictionPxPerSec2 * seconds);
  const scale = nextSpeed / speed;
  velocity.x *= scale;
  velocity.y *= scale;
}

function stopInertia() {
  if (!inertiaSession) return;
  clearInterval(inertiaSession.timer);
  inertiaSession = null;
}

function moveOverlayWindow(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const point = {
    x: Number(payload?.screenX),
    y: Number(payload?.screenY),
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;

  const pointerWindowX = Number(payload?.pointerWindowX);
  const pointerWindowY = Number(payload?.pointerWindowY);
  const target = {
    x: point.x - (Number.isFinite(pointerWindowX) ? pointerWindowX : Math.round(bounds.width / 2)),
    y: point.y - (Number.isFinite(pointerWindowY) ? pointerWindowY : Math.round(bounds.height / 2)),
  };
  const next = clampBoundsToDisplay({
    ...bounds,
    x: Math.round(target.x),
    y: Math.round(target.y),
  });
  mainWindow.setPosition(next.x, next.y, false);
}

function clampBoundsToDisplay(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const insets = isPickerOpen ? { left: 0, top: 0, right: 0, bottom: 0 } : visualInsets;
  const minX = display.workArea.x - insets.left;
  const maxX = display.workArea.x + display.workArea.width - bounds.width + insets.right;
  const minY = display.workArea.y - insets.top;
  const maxY = display.workArea.y + display.workArea.height - bounds.height + insets.bottom;
  return {
    ...bounds,
    x: Math.round(clamp(bounds.x, minX, maxX)),
    y: Math.round(clamp(bounds.y, minY, maxY)),
  };
}

function resizeOverlayForMascot(widthPx, mascotCenter) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const width = clamp(Math.round(Number(widthPx)), mascotSize.min, mascotSize.max);
  if (!Number.isFinite(width)) return;
  currentMascotWidth = width;
  if (isPickerOpen) return;

  const bounds = mainWindow.getBounds();
  const overlayBounds = overlayBoundsForMascot(width);
  const center = mascotCenter ?? {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const nextBounds = {
    x: Math.round(center.x - overlayBounds.width / 2),
    y: Math.round(center.y - overlayBounds.height / 2),
    width: overlayBounds.width,
    height: overlayBounds.height,
  };
  mainWindow.setBounds(clampBoundsToDisplay(nextBounds), false);
}

function showPetContextMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  Menu.buildFromTemplate([
    {
      label: "Choose pet...",
      click: () => {
        setPickerWindowOpen(true);
        mainWindow?.webContents.send("pet:open-picker");
      },
    },
    { type: "separator" },
    { label: "Wave", click: () => playPetAction("waving", 1800) },
    { label: "Run", click: () => playPetAction("running", 1600) },
    { type: "separator" },
    {
      label: "Open pets folder",
      click: () => shell.openPath(path.join(projectRoot, "pets")),
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
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
      {
        label: "Wake",
        click: () => {
          mainWindow?.showInactive();
          playPetAction("waving", 1800);
        },
      },
      {
        label: "Open pets folder",
        click: () => shell.openPath(path.join(projectRoot, "pets")),
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function startStateServer() {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PET_PORT}`);
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/status") {
        return json(res, 200, url.searchParams.get("assets") === "1" ? await status() : publicStatus());
      }
      if (req.method === "GET" && url.pathname === "/pets") {
        return json(res, 200, { pets: petState.pets.map(publicPet) });
      }
      if (req.method === "GET" && url.pathname === "/pet/preview") {
        const pet = petState.pets.find((candidate) => candidate.id === url.searchParams.get("id"));
        return json(res, pet ? 200 : 404, {
          ok: Boolean(pet),
          previewUrl: pet ? await petPreviewUrl(pet) : null,
        });
      }
      if (req.method === "POST" && url.pathname === "/state") {
        const body = await readJson(req);
        const next = setPetState(body.state, body.durationMs);
        return json(res, 200, { ok: true, state: next });
      }
      if (req.method === "POST" && url.pathname === "/pet/select") {
        const body = await readJson(req);
        const pet = petState.pets.find((candidate) => candidate.id === body.id);
        if (!pet) return json(res, 404, { ok: false, error: "pet_not_found" });
        petState.selectedPetId = pet.id;
        broadcastStatus();
        return json(res, 200, {
          ok: true,
          pet: url.searchParams.get("assets") === "1" ? await hydratePet(pet) : publicPet(pet),
        });
      }
      return json(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      return json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.listen(PET_PORT, "127.0.0.1", () => {
    console.log(`Desktop Pet MVP state API: http://127.0.0.1:${PET_PORT}`);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function json(res, code, body) {
  res.writeHead(code, {
    ...corsHeaders(),
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function publicStatus() {
  return {
    selectedPet: selectedPetMeta() ? publicPet(selectedPetMeta()) : null,
    state: petState.state,
    pets: petState.pets.map(publicPet),
  };
}

function publicPet(pet) {
  const { spritesheetFilePath, spritesheetUrl, ...rest } = pet;
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
  registerIpc();
  await loadPets();
  createWindow();
  createTray();
  startStateServer();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  behaviorController.dispose();
  stopOverlayDrag();
  stopInertia();
  if (server) server.close();
});
