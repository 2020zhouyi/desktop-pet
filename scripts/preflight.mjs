#!/usr/bin/env node

import { spawn } from "node:child_process";

const commands = [
  "test:selection-store",
  "test:pet-library",
  "test:picker-preview",
  "test:pet-state-machine",
  "test:bubbles",
  "test:pet-health",
  "test:package-health",
  "test:package-verify",
  "test:window-security",
  "test:window-geometry",
  "test:window-surfaces",
  "test:ipc-capabilities",
  "test:picker-only-surface",
  "pet:check",
  "package:check",
  "build",
];

for (const command of commands) {
  console.log(`\n==> npm run ${command}`);
  const result = await runNpmScript(command);
  if (result.code === 0) continue;

  if (result.signal) {
    console.error(`Preflight failed: npm run ${command} exited by signal ${result.signal}.`);
  } else {
    console.error(`Preflight failed: npm run ${command} exited with code ${result.code}.`);
  }
  process.exit(result.code || 1);
}

console.log("\nPreflight passed.");

function runNpmScript(command) {
  return new Promise((resolve) => {
    const child = spawn(npmCommand(), ["run", command], {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      resolve({ code: 1, signal: null });
    });
    child.on("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
