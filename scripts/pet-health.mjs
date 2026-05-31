#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPetHealthReport,
  validatePetHealth,
} from "../electron/pet-health.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  const result = await validatePetHealth({ petsRoot: options.petsRoot });
  console.log(formatPetHealthReport(result).trimEnd());
  if (result.errorCount > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {
    petsRoot: path.join(projectRoot, "pets"),
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
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
    "Usage: npm run pet:check -- [--pets-root <path>]",
    "",
    "Scans only the project-local desktop-pet-mvp/pets directory by default.",
    "The check is read-only and does not touch ~/.codex/pets.",
  ].join("\n");
}
