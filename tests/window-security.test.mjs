import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  devRendererOrigin,
  isAllowedRendererUrl,
  shouldOpenExternalUrl,
} from "../electron/window-security.mjs";

const packagedRoot = path.join(path.sep, "tmp", "desktop-pet", "dist");
const packagedIndexUrl = pathToFileURL(path.join(packagedRoot, "index.html")).href;
const outsideFileUrl = pathToFileURL(path.join(path.sep, "tmp", "outside.html")).href;

assert.equal(
  isAllowedRendererUrl(`${devRendererOrigin}/`, { isDev: true, packagedRoot }),
  true,
);
assert.equal(
  isAllowedRendererUrl(`${devRendererOrigin}/src/main.tsx`, { isDev: true, packagedRoot }),
  true,
);
assert.equal(
  isAllowedRendererUrl("http://localhost:5173/", { isDev: true, packagedRoot }),
  false,
);
assert.equal(
  isAllowedRendererUrl("https://example.com/", { isDev: true, packagedRoot }),
  false,
);
assert.equal(
  isAllowedRendererUrl(packagedIndexUrl, { isDev: false, packagedRoot }),
  true,
);
assert.equal(
  isAllowedRendererUrl(outsideFileUrl, { isDev: false, packagedRoot }),
  false,
);
assert.equal(
  isAllowedRendererUrl(packagedIndexUrl, { isDev: true, packagedRoot }),
  true,
);

assert.equal(shouldOpenExternalUrl("https://example.com"), true);
assert.equal(shouldOpenExternalUrl("http://example.com"), true);
assert.equal(shouldOpenExternalUrl("file:///tmp/index.html"), false);
assert.equal(shouldOpenExternalUrl("javascript:alert(1)"), false);

console.log("window security tests passed");
