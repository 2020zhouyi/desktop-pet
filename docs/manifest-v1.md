# Pet Manifest v1

`pet.json` stays small and backward compatible. Existing manifests with only the required fields continue to load.

## Required Fields

```json
{
  "id": "jx3-u4e03-u79c0-01",
  "displayName": "七秀 Codex Pet 1",
  "spritesheetPath": "spritesheet.webp"
}
```

- `id`: non-empty string. Used for duplicate detection during import and health checks.
- `displayName`: non-empty string shown in the picker and control bar.
- `spritesheetPath`: safe relative path inside the pet folder. Absolute paths, empty path parts, and `..` traversal are rejected.

## Optional Fields

```json
{
  "author": "Pi Team",
  "version": "1.0.0",
  "tags": ["jx3", "qixiu"],
  "faction": "七秀",
  "recommendedScale": 1.15,
  "accentColor": "#217d74",
  "behaviorProfile": "watchful"
}
```

- `author`, `version`, `faction`, `behaviorProfile`: non-empty strings.
- `tags`: array of non-empty strings.
- `recommendedScale`: number from `0.5` to `2`, displayed as a picker hint.
- `accentColor`: `#rgb` or `#rrggbb`, displayed as a small picker swatch.

The loader and importer ignore invalid optional fields. `npm run pet:check` reports invalid optional fields as warnings, not errors, so metadata cleanup does not block old or otherwise healthy pets.

## Runtime Consumers

- Loader: normalizes required fields before a pet can appear in the picker or render as the active desktop pet.
- Importer: validates external Codex pet folders before copying them into this project's `pets/` directory.
- Health check: reports manifest errors/warnings before packaging.
- Package verifier: compares packaged pet resources against the project-local manifest set after `npm run dist:all`.

## Import Boundary

Codex pet imports copy from `~/.codex/pets/<pet-id>/` into this project's `pets/<pet-id>/`. Import does not watch, delete, move, or modify `~/.codex/pets`.
