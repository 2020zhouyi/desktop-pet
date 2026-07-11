#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(projectRoot, "release");

console.log("Release gate scope:");
console.log(`Project root: ${projectRoot}`);
console.log(`Release root: ${releaseRoot}`);

await runNpmScript("preflight");

console.log(`\n==> clean ${releaseRoot}`);
await rm(releaseRoot, { recursive: true, force: true });

await runNpmScript("dist:all");
await runNpmScript("package:verify");

console.log("\nRelease gate passed.");

function runNpmScript(scriptName) {
  console.log(`\n==> npm run ${scriptName}`);
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand(), ["run", scriptName], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (signal) reject(new Error(`npm run ${scriptName} exited by signal ${signal}`));
      else reject(new Error(`npm run ${scriptName} exited with code ${code}`));
    });
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
