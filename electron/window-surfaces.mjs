import { isAllowedRendererUrl } from "./window-security.mjs";

const controlPanels = new Set(["picker"]);

export function surfaceSearchParams(surface, panel) {
  if (surface === "pet") {
    if (panel !== undefined) {
      throw new TypeError("The pet surface does not accept a panel");
    }
    return new URLSearchParams({ surface });
  }

  if (surface === "control") {
    if (!controlPanels.has(panel)) {
      throw new TypeError("The control surface requires a valid panel");
    }
    return new URLSearchParams({ surface, panel });
  }

  throw new TypeError("Unknown window surface");
}

export function isTrustedSurfaceUrl(url, options) {
  if (!isAllowedRendererUrl(url, options)) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const keys = [...parsed.searchParams.keys()];
  const surfaces = parsed.searchParams.getAll("surface");
  const panels = parsed.searchParams.getAll("panel");

  if (surfaces.length !== 1) return false;

  if (surfaces[0] === "pet") {
    return keys.length === 1 && panels.length === 0;
  }

  if (surfaces[0] === "control") {
    return keys.length === 2 && panels.length === 1 && controlPanels.has(panels[0]);
  }

  return false;
}
