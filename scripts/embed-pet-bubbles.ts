import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bubbleLinesForPet } from "../src/petBubbles.ts";
import type { PetOption } from "../src/types.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = process.argv.slice(2).map((root) => path.resolve(root));
if (roots.length === 0) roots.push(path.join(projectRoot, "pets"));

for (const root of roots) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const folder = path.join(root, entry.name);
    const manifestPath = path.join(folder, "pet.json");
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (typeof manifest.id !== "string" || typeof manifest.displayName !== "string") continue;
    manifest.displayName = manifest.displayName.replace(/\s+Codex Pet\s+\d+$/i, "").trim();
    const pet = {
      ...manifest,
      folder,
      source: "user",
      spritesheetPath: String(manifest.spritesheetPath ?? "spritesheet.webp"),
    } as PetOption;
    manifest.bubbleLines = bubbleLinesForPet(pet);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

console.log(`Embedded editable bubble lines into ${roots.join(", ")}`);
