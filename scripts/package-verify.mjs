#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPackageVerifyReport,
  validatePackageArtifacts,
} from "../electron/package-verify.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  const result = await validatePackageArtifacts({
    projectRoot: options.projectRoot,
    releaseRoot: options.releaseRoot,
    petsRoot: options.petsRoot,
  });
  console.log(formatPackageVerifyReport(result).trimEnd());
  if (result.errorCount > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    projectRoot,
    releaseRoot: undefined,
    petsRoot: undefined,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--project-root") {
      const value = args[index + 1];
      if (!value) throw new Error("--project-root requires a path");
      options.projectRoot = path.resolve(value);
      index += 1;
    } else if (arg === "--release-root") {
      const value = args[index + 1];
      if (!value) throw new Error("--release-root requires a path");
      options.releaseRoot = path.resolve(value);
      index += 1;
    } else if (arg === "--pets-root") {
      const value = args[index + 1];
      if (!value) throw new Error("--pets-root requires a path");
      options.petsRoot = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function helpText() {
  return [
    "Usage: npm run package:verify -- [--project-root <path>] [--release-root <path>] [--pets-root <path>]",
    "",
    "Verifies generated mac/win app.asar artifacts under desktop-pet-mvp/release.",
    "Checks that packaged /pets content matches project-local pets manifests and spritesheets.",
    "The check is read-only and does not run electron-builder or modify release artifacts.",
  ].join("\n");
}
