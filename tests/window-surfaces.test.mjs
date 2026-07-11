import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  isTrustedSurfaceUrl,
  surfaceSearchParams,
} from "../electron/window-surfaces.mjs";

function serializedSearchParams(value) {
  const serialized = String(value);
  return serialized.startsWith("?") ? serialized.slice(1) : serialized;
}

function surfaceUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  url.search = serializedSearchParams(params);
  return url.href;
}

assert.equal(serializedSearchParams(surfaceSearchParams("pet")), "surface=pet");
assert.equal(
  serializedSearchParams(surfaceSearchParams("control", "picker")),
  "surface=control&panel=picker",
);

assert.throws(() => surfaceSearchParams("unknown"), /surface/i);
assert.throws(() => surfaceSearchParams("control"), /panel/i);
assert.throws(() => surfaceSearchParams("control", "settings"), /panel/i);
assert.throws(() => surfaceSearchParams("control", "import"), /panel/i);
assert.throws(() => surfaceSearchParams("pet", "settings"), /panel/i);

const devOrigin = "http://127.0.0.1:5173";
const packagedRoot = path.join(path.sep, "tmp", "desktop-pet", "dist");
const packagedIndexUrl = pathToFileURL(path.join(packagedRoot, "index.html")).href;
const outsideIndexUrl = pathToFileURL(path.join(path.sep, "tmp", "outside", "index.html")).href;

const devOptions = { isDev: true, devOrigin, packagedRoot };
assert.equal(
  isTrustedSurfaceUrl(surfaceUrl(devOrigin, surfaceSearchParams("pet")), devOptions),
  true,
);
assert.equal(isTrustedSurfaceUrl(`${devOrigin}/?surface=control&panel=settings`, devOptions), false);
assert.equal(
  isTrustedSurfaceUrl(`${devOrigin}/?surface=unknown`, devOptions),
  false,
);
assert.equal(
  isTrustedSurfaceUrl(`${devOrigin}/?surface=control&panel=import`, devOptions),
  false,
);
assert.equal(
  isTrustedSurfaceUrl("https://example.com/?surface=pet", devOptions),
  false,
);

const packagedOptions = { isDev: false, devOrigin, packagedRoot };
assert.equal(
  isTrustedSurfaceUrl(surfaceUrl(packagedIndexUrl, surfaceSearchParams("pet")), packagedOptions),
  true,
);
assert.equal(
  isTrustedSurfaceUrl(
    surfaceUrl(packagedIndexUrl, surfaceSearchParams("control", "picker")),
    packagedOptions,
  ),
  true,
);
assert.equal(
  isTrustedSurfaceUrl(surfaceUrl(outsideIndexUrl, surfaceSearchParams("pet")), packagedOptions),
  false,
);

console.log("window surface tests passed");
