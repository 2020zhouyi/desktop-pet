import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const markerPrefix = "DESKTOP_PET_SMOKE_RESULT=";
const rendererUrl = "http://127.0.0.1:5173/";
const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const electronExecutable = typeof electronPath === "string" ? electronPath : process.execPath;
const packagedExecutable = process.env.DESKTOP_PET_SMOKE_EXECUTABLE?.trim() || null;
const smokeMode = packagedExecutable ? "packaged" : "development";
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "desktop-pet-electron-smoke-"));
const stalePetId = "project:removed-pet-smoke";
const electronRuns = [];
let viteRun = null;

try {
  await seedStaleSettings();
  await seedUserPet();
  if (!packagedExecutable) {
    viteRun = startVite();
    await waitForVite(viteRun);
  }

  const initialRun = startElectron("initial");
  electronRuns.push(initialRun);
  const initialMarker = await initialRun.marker;
  const { selectedPetId, petCount } = assertInitialMarker(initialMarker);
  await stopProcess(initialRun.child);

  const restartRun = startElectron("restart");
  electronRuns.push(restartRun);
  const restartMarker = await restartRun.marker;
  assertRestartMarker(restartMarker, selectedPetId, petCount);
  await stopProcess(restartRun.child);

  console.log(`${smokeMode} electron smoke tests passed`);
} catch (error) {
  printProcessOutput("Vite", viteRun);
  electronRuns.forEach((run, index) => printProcessOutput(`Electron ${index + 1}`, run));
  throw error;
} finally {
  await Promise.all(electronRuns.map((run) => stopProcess(run.child)));
  if (viteRun) await stopProcess(viteRun.child);
  await rm(userDataDir, { recursive: true, force: true });
}

function startVite() {
  return captureProcess(spawn(process.execPath, [
    viteCli,
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ], {
    cwd: projectRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }));
}

function startElectron(phase) {
  const env = {
    ...process.env,
    DESKTOP_PET_SMOKE: "1",
    DESKTOP_PET_SMOKE_PHASE: phase,
    FORCE_COLOR: "0",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const executable = packagedExecutable ?? electronExecutable;
  const args = packagedExecutable
    ? [`--user-data-dir=${userDataDir}`]
    : [projectRoot, `--user-data-dir=${userDataDir}`];
  const run = captureProcess(spawn(executable, args, {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }));
  run.marker = waitForMarker(run, phase);
  return run;
}

function captureProcess(child) {
  const run = { child, stdout: "", stderr: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    run.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    run.stderr += chunk;
  });
  return run;
}

function waitForMarker(run, phase, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      run.child.stdout.off("data", onData);
      run.child.off("error", onError);
      run.child.off("exit", onExit);
      callback(value);
    };
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const markerIndex = line.indexOf(markerPrefix);
        if (markerIndex < 0) continue;
        try {
          finish(resolve, JSON.parse(line.slice(markerIndex + markerPrefix.length)));
        } catch (error) {
          finish(reject, new Error(`Invalid Electron smoke marker: ${error.message}`));
        }
        return;
      }
    };
    const onError = (error) => finish(reject, error);
    const onExit = (code, signal) => {
      finish(
        reject,
        new Error(`Electron ${phase} exited before marker (code=${code}, signal=${signal})`),
      );
    };
    const timeout = setTimeout(() => {
      finish(reject, new Error(`Timed out waiting for Electron ${phase} renderer marker`));
    }, timeoutMs);

    run.child.stdout.on("data", onData);
    run.child.once("error", onError);
    run.child.once("exit", onExit);
  });
}

async function waitForVite(run, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (run.child.exitCode !== null || run.child.signalCode !== null) {
      throw new Error(`Vite exited before renderer was ready (code=${run.child.exitCode})`);
    }
    try {
      const response = await fetch(rendererUrl, { cache: "no-store" });
      const html = await response.text();
      if (response.ok && html.includes('id="root"') && html.includes("/src/main.tsx")) return;
      lastError = new Error(`Unexpected Vite response ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Vite: ${lastError?.message ?? "unknown error"}`);
}

function assertInitialMarker(marker) {
  assert.equal(marker.kind, "desktop-pet-smoke");
  assert.equal(marker.phase, "initial");
  assert.equal(marker.ok, true, marker.error);
  assert.equal(marker.rendererReady, true);
  assert.equal(marker.preloadAvailable, true);
  assertRuntimeStateGuard(marker);
  if (packagedExecutable) {
    assert.match(marker.rendererUrl, /^file:\/\//);
  } else {
    assert.match(marker.rendererUrl, /^http:\/\/127\.0\.0\.1:5173\/?/);
  }
  assert.equal(marker.initial.state, "idle");
  assert.ok(marker.initial.petCount > 0);
  assert.notEqual(marker.initial.statusPetId, stalePetId);
  assert.equal(marker.state.returned, "waving");
  assert.equal(marker.state.observed, "waving");
  assert.equal(marker.state.rendered, "waving");
  assert.equal(marker.resize.handleRendered, true);
  assert.equal(marker.resize.initialWidthPx, 180);
  assert.equal(marker.resize.returnedWidthPx, 204);
  assert.equal(marker.resize.statusWidthPx, 204);
  assert.equal(marker.petWindowAppearance.alwaysOnTop, true);
  for (const background of [
    marker.petWindowAppearance.htmlBackground,
    marker.petWindowAppearance.bodyBackground,
    marker.petWindowAppearance.stageBackground,
    marker.petWindowAppearance.petShellBackground,
  ]) {
    assert.equal(background, "rgba(0, 0, 0, 0)");
  }
  assert.ok(marker.selection.targetPetId);
  assert.equal(marker.selection.statusPetId, marker.selection.targetPetId);
  assert.equal(marker.selection.cardClicked, true);
  assert.equal(marker.selection.confirmClicked, true);
  assert.equal(marker.selection.selectedCardActive, true);
  assertControlMarker(marker, marker.selection.targetPetId, marker.initial.petCount);
  return {
    selectedPetId: marker.selection.targetPetId,
    petCount: marker.initial.petCount,
  };
}

function assertRestartMarker(marker, selectedPetId, petCount) {
  assert.equal(marker.kind, "desktop-pet-smoke");
  assert.equal(marker.phase, "restart");
  assert.equal(marker.ok, true, marker.error);
  assert.equal(marker.rendererReady, true);
  assert.equal(marker.preloadAvailable, true);
  assertRuntimeStateGuard(marker);
  assert.equal(marker.persisted.statusPetId, selectedPetId);
  assert.equal(marker.persisted.state, "idle");
  assert.equal(marker.resize.handleRendered, true);
  assert.equal(marker.resize.persistedWidthPx, 204);
  assertControlMarker(marker, selectedPetId, petCount);
}

function assertRuntimeStateGuard(marker) {
  assert.equal(marker.invalidState.rejected, true);
  assert.match(marker.invalidState.error, /unsupported pet state: failed/i);
  assert.equal(marker.invalidState.stateBefore, "idle");
  assert.equal(marker.invalidState.stateAfter, "idle");
  assert.equal(marker.invalidState.rendererAlive, true);
  assert.equal(marker.invalidState.recoveredState, "idle");
  assert.equal(marker.stateLifecycle.draggingReturned, "running-right");
  assert.equal(marker.stateLifecycle.draggingObserved, "running-right");
  assert.equal(marker.stateLifecycle.draggingRendered, "running-right");
  assert.equal(marker.stateLifecycle.jumpingReturned, "jumping");
  assert.equal(marker.stateLifecycle.jumpingObserved, "jumping");
  assert.equal(marker.stateLifecycle.jumpingRendered, "jumping");
  assert.equal(marker.stateLifecycle.jumpingSettled, "idle");
  assert.equal(marker.stateLifecycle.jumpingSettledRendered, "idle");
}

function assertControlMarker(marker, selectedPetId, petCount) {
  assert.equal(marker.control.access.control.appCloseRejected, true);
  assert.match(marker.control.access.control.appCloseError, /ipc_forbidden/i);
  assert.equal(marker.control.access.control.rendererAlive, true);
  assert.equal(marker.control.access.pet.listPetsRejected, true);
  assert.match(marker.control.access.pet.listPetsError, /ipc_forbidden/i);
  assert.equal(marker.control.access.pet.controlCloseRejected, true);
  assert.match(marker.control.access.pet.controlCloseError, /ipc_forbidden/i);
  assert.equal(marker.control.access.pet.rendererAlive, true);
  assert.equal(marker.control.access.controlAliveAfterPetRejections, true);

  assert.match(marker.control.picker.rendererUrl, /[?&]surface=control(?:&|$)/);
  assert.equal(marker.control.picker.surface, "control");
  assert.equal(marker.control.picker.panel, "picker");
  assert.equal(marker.control.picker.rendered, true);
  assert.equal(marker.control.picker.preloadAvailable, true);
  assert.ok(marker.control.picker.petRowCount > 0);
  assert.ok(marker.control.picker.petCardCount > 0);
  assert.equal(marker.control.picker.headingText, "选择桌宠");
  assert.equal(marker.control.picker.selectionDockRendered, true);
  assert.equal(marker.control.picker.libraryButtonRendered, true);
  assert.equal(marker.control.picker.launchAtLoginRendered, true);
  assert.equal(marker.control.picker.userPetCount, petCount);
  assert.equal(marker.control.picker.settingsPanelAbsent, true);
  assert.equal(marker.control.picker.closeApiAvailable, true);

  assert.equal(marker.control.rendererClose.requested, true);
  assert.equal(marker.control.rendererClose.surface, "control");
  assert.equal(marker.control.rendererClose.panel, "picker");
  assert.equal(marker.control.concurrentOpen.sameWindow, true);
  assert.equal(
    marker.control.concurrentOpen.firstPickerWindowId,
    marker.control.concurrentOpen.secondPickerWindowId,
  );
  assert.equal(marker.control.concurrentOpen.finalPanel, "picker");
  assert.equal(marker.control.closed, true);
  assert.equal(marker.control.petAlive, true);
  assert.equal(marker.control.boundsUnchanged, true);
  assert.deepEqual(marker.control.petBoundsAfter, marker.control.petBoundsBefore);
}

function printProcessOutput(label, run) {
  if (!run) return;
  const stdout = run.stdout.trim();
  const stderr = run.stderr.trim();
  if (stdout) console.error(`${label} stdout:\n${stdout}`);
  if (stderr) console.error(`${label} stderr:\n${stderr}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedStaleSettings() {
  await writeFile(
    path.join(userDataDir, "desktop-pet-settings.json"),
    `${JSON.stringify({
      selectedPetId: stalePetId,
      mascotWidthPx: 180,
      opacity: 0.5,
      alwaysOnTopEnabled: false,
    }, null, 2)}\n`,
    "utf8",
  );
}

async function seedUserPet() {
  const petDir = path.join(userDataDir, "pets", "smoke-user-pet");
  await mkdir(petDir, { recursive: true });
  await writeFile(
    path.join(petDir, "pet.json"),
    `${JSON.stringify({
      id: "smoke-user-pet",
      displayName: "Smoke User Pet",
      spritesheetPath: "spritesheet.webp",
    }, null, 2)}\n`,
  );
  await copyFile(
    path.join(projectRoot, "pets", "jx3-u6bb5-u6c0f-01", "spritesheet.webp"),
    path.join(petDir, "spritesheet.webp"),
  );
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 3_000);
  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeout);
  }
}
