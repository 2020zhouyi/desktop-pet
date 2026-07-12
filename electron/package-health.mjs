import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  formatPetHealthReport,
  validatePetHealth,
} from "./pet-health.mjs";

export const requiredBuildFilePatterns = [
  "dist/**/*",
  "electron/**/*",
  "pets/**/*",
  "public/**/*",
  "package.json",
];
export const requiredAsarUnpackPatterns = ["pets/**/*"];

export async function validatePackageHealth({
  projectRoot = process.cwd(),
  packageJsonPath,
  petsRoot,
  requiredPatterns = requiredBuildFilePatterns,
} = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedPackageJsonPath = path.resolve(
    packageJsonPath ?? path.join(resolvedProjectRoot, "package.json"),
  );
  const resolvedPetsRoot = path.resolve(petsRoot ?? path.join(resolvedProjectRoot, "pets"));

  const packageIssues = [];
  const packageResult = await readPackageJson(resolvedPackageJsonPath);
  if (packageResult.status === "missing") {
    packageIssues.push(issue({
      severity: "error",
      code: "package_json_missing",
      message: "package.json does not exist.",
    }));
  } else if (packageResult.status === "invalid_json") {
    packageIssues.push(issue({
      severity: "error",
      code: "package_json_invalid",
      message: "package.json is not valid JSON.",
    }));
  } else {
    packageIssues.push(
      ...validateRequiredBuildFiles(packageResult.packageJson, { requiredPatterns }),
      ...validateRequiredAsarUnpack(packageResult.packageJson),
    );
  }

  const petHealth = await validatePetHealth({ petsRoot: resolvedPetsRoot });
  const packageErrorCount = countSeverity(packageIssues, "error");
  const packageWarningCount = countSeverity(packageIssues, "warning");
  const errorCount = packageErrorCount + petHealth.errorCount;
  const warningCount = packageWarningCount + petHealth.warningCount;

  return {
    ok: errorCount === 0,
    projectRoot: resolvedProjectRoot,
    packageJsonPath: resolvedPackageJsonPath,
    petsRoot: resolvedPetsRoot,
    requiredPatterns: [...requiredPatterns],
    packageErrorCount,
    packageWarningCount,
    errorCount,
    warningCount,
    packageIssues,
    petHealth,
  };
}

export function validateRequiredAsarUnpack(
  packageJson,
  { requiredPatterns = requiredAsarUnpackPatterns } = {},
) {
  const configuredPatterns = new Set(
    Array.isArray(packageJson?.build?.asarUnpack)
      ? packageJson.build.asarUnpack
        .filter((entry) => typeof entry === "string")
        .map((entry) => normalizeBuildFilePattern(entry))
      : [],
  );

  return requiredPatterns
    .filter((pattern) => !configuredPatterns.has(normalizeBuildFilePattern(pattern)))
    .map((pattern) => issue({
      severity: "error",
      code: "missing_required_asar_unpack",
      pattern,
      message: `electron-builder build.asarUnpack is missing required entry "${pattern}".`,
    }));
}

export function validateRequiredBuildFiles(
  packageJson,
  { requiredPatterns = requiredBuildFilePatterns } = {},
) {
  const issues = [];
  const files = packageJson?.build?.files;

  if (!Array.isArray(files)) {
    issues.push(issue({
      severity: "error",
      code: "build_files_missing",
      message: "electron-builder build.files must be an array.",
    }));
    return issues;
  }

  const normalizedFiles = new Set(
    files
      .filter((entry) => typeof entry === "string")
      .map((entry) => normalizeBuildFilePattern(entry)),
  );

  for (const pattern of requiredPatterns) {
    if (normalizedFiles.has(normalizeBuildFilePattern(pattern))) continue;
    issues.push(issue({
      severity: "error",
      code: "missing_required_build_file",
      pattern,
      message: `electron-builder build.files is missing required entry "${pattern}".`,
    }));
  }

  return issues;
}

export function formatPackageHealthReport(result) {
  const lines = [];
  const status = result.ok ? "passed" : "failed";
  lines.push(
    `Package check ${status}: ${formatCount(result.errorCount, "error")}, ` +
      `${formatCount(result.warningCount, "warning")}.`,
  );
  lines.push(
    "Scope: validates electron-builder resource config and project-local desktop-pet-mvp/pets.",
  );
  lines.push("This check is read-only; it does not run electron-builder or generate release files.");
  lines.push(`Project root: ${result.projectRoot}`);
  lines.push(`package.json: ${result.packageJsonPath}`);
  lines.push("");
  lines.push(
    `Required build.files entries: ${result.requiredPatterns.join(", ")}`,
  );

  if (result.packageIssues.length === 0) {
    lines.push("Package config: all required build.files entries are present.");
  } else {
    lines.push("Package config:");
    for (const item of result.packageIssues) {
      lines.push(formatIssue(item));
    }
  }

  lines.push("");
  lines.push("Pet resource health:");
  lines.push(formatPetHealthReport(result.petHealth).trimEnd());

  return `${lines.join("\n")}\n`;
}

async function readPackageJson(packageJsonPath) {
  let raw;
  try {
    raw = await readFile(packageJsonPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing" };
    throw error;
  }

  try {
    return { status: "ok", packageJson: JSON.parse(raw) };
  } catch {
    return { status: "invalid_json" };
  }
}

function normalizeBuildFilePattern(pattern) {
  return pattern.replaceAll("\\", "/").replace(/^\.\//, "");
}

function issue(value) {
  return value;
}

function formatIssue(item) {
  const prefix = `[${item.severity.toUpperCase()}]`;
  const suffix = item.code ? ` (${item.code})` : "";
  return `${prefix} ${item.message}${suffix}`;
}

function countSeverity(items, severity) {
  return items.filter((item) => item.severity === severity).length;
}

function formatCount(value, singular) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
