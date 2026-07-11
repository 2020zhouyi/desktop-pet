import path from "node:path";
import { fileURLToPath } from "node:url";

export const devRendererOrigin = "http://127.0.0.1:5173";

export function isAllowedRendererUrl(
  url,
  {
    isDev,
    devOrigin = devRendererOrigin,
    packagedRoot,
  } = {},
) {
  const parsed = safeUrl(url);
  if (!parsed) return false;

  if (isDev && parsed.origin === devOrigin) return true;

  if (parsed.protocol === "file:" && packagedRoot) {
    return isPathInside(fileURLToPath(parsed), packagedRoot);
  }

  return false;
}

export function shouldOpenExternalUrl(url) {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

function safeUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
