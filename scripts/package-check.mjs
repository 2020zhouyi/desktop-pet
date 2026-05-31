#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPackageHealthReport,
  validatePackageHealth,
} from "../electron/package-health.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  const result = await validatePackageHealth({
    projectRoot: options.projectRoot,
    packageJsonPath: options.packageJsonPath,
    petsRoot: options.petsRoot,
  });
  console.log(formatPackageHealthReport(result).trimEnd());
  if (result.errorCount > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    projectRoot,
    packageJsonPath: undefined,
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
    } else if (arg === "--package-json") {
      const value = args[index + 1];
      if (!value) throw new Error("--package-json requires a path");
      options.packageJsonPath = path.resolve(value);
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
    "Usage: npm run package:check -- [--project-root <path>] [--package-json <path>] [--pets-root <path>]",
    "",
    "Checks electron-builder resource config and the project-local desktop-pet-mvp/pets health.",
    "The check is read-only and does not run electron-builder or generate release files.",
  ].join("\n");
}
