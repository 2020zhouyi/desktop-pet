# Desktop Pet MVP

A tiny Electron + React desktop pet prototype inspired by the Codex pet renderer.

这是一个本地桌宠 MVP：主窗口使用 Electron 透明悬浮窗，渲染层使用 React + CSS sprite atlas，交互方式尽量贴近 Codex pet 的桌面覆盖层。

## Documentation

桌宠核心应用的文档入口在 [`docs/README.md`](docs/README.md)。先从这里确认当前主线、资源边界和文档地图，再按任务进入工作日志、manifest、行为计划或发布冒烟清单。

## Run

```sh
npm install
npm run dev
```

The app opens a transparent always-on-top window and starts a local state API:

```sh
curl -X POST http://127.0.0.1:7777/state \
  -H 'content-type: application/json' \
  -d '{"state":"waving","durationMs":1800}'
```

Shortcuts:

```sh
npm run pet:wave
npm run pet:jump
npm run pet:run
npm run pet:wait
npm run pet:observe
npm run pet:fail
npm run pet:idle
```

Interactions mirror the Codex overlay pattern:

- Drag the pet body to move the floating window.
- The animation switches to left/right running while dragging.
- Release after a fast drag to let the pet glide with inertia.
- Click without moving to wave.
- Drag the bottom-right handle to resize the pet.
- Right-click the pet to open the native context menu.
- Hover over the pet to show the small control bar.
- Use the control bar settings popover to toggle speech bubbles, proactive reminders, or enter/leave sleep mode.
- Open the pet picker to import compatible pets from the local Codex pet store into this project's `pets/` folder.
- Transparent pixels pass through to the desktop; only visible pet pixels capture clicks.
- Window edge constraints use the pet's visible alpha bounds, so dragging to the screen edge hugs the character rather than the transparent atlas cell.

Idle animation uses the Codex timing model: the idle row frame durations are multiplied by 6. Left/right running loops continuously while dragging; other action rows play at their normal frame durations before returning to idle.

## Behavior Model

State changes flow through a small behavior controller in the Electron main process. It gives actions priority, applies a short cooldown to repeated one-shot actions, queues lower-priority actions when another action is already playing, and returns to `idle` when timed actions finish.

P2 adds a renderer-side lifestyle rule layer for ordinary desktop use. It does not read Codex, Claude, agent, task queue, or external work status. Local UI and time events map to a lifestyle decision first, then optionally trigger a state and a speech bubble.

P2.5 adds a small renderer-side behavior queue between lifestyle decisions and playback. Direct user actions can interrupt lower-priority proactive prompts, import and pet-switch feedback is preserved as important feedback, and repeated welcome/idle prompts are merged so bubbles and short animations do not overwrite each other during quick clicks, drags, imports, or picker activity. Sleep mode and the proactive-reminder toggle still use the P2 helper gate; the queue does not introduce Codex, Claude, agent, or task-status integration.

P2.6 adds a read-only project pet health check for packaging. It scans only this project's `desktop-pet-mvp/pets/` directory and reports broken manifests, unsafe spritesheet paths, duplicate manifest ids, copied folder suffixes, and stale `.importing-*` staging directories before resources are bundled.

P2.7 adds a one-command packaging preflight. `npm run package:check` verifies that electron-builder is configured to include the runtime resources (`dist/**/*`, `electron/**/*`, `pets/**/*`, `public/**/*`, and `package.json`) and reuses the project-local pet health check. It does not run electron-builder, create installers, or write `release/` artifacts. `npm run preflight` runs the behavior, import, management, pet health, package health, package, and build checks in order and stops on the first failure.

P2.8 adds real packaged artifact verification. After `npm run dist:all` creates `release/`, `npm run package:verify` reads the generated macOS and Windows `app.asar` files, verifies packaged `/pets` manifests and spritesheets against the project-local `pets/` health result, and rejects duplicate copy folders, `.importing-*` staging content, or test/temporary pet materials. It is read-only and does not generate installers.

P2.9/P4.0 define the first publishable release gate: `npm run preflight`, clean only `desktop-pet-mvp/release`, run `npm run dist:all`, run `npm run package:verify`, then complete the manual smoke checklist in `docs/release-smoke.md`.

The user-facing state semantics are:

```text
dragging          -> running-left / running-right
click / wake      -> waving
pet switched      -> jumping
busy burst        -> running
idle rest         -> waiting
curious peek      -> observation row
error             -> failed
settled           -> idle
```

The atlas still keeps its original internal state keys, including `review` for row 8, but visible copy labels that row as observation, peeking, or curiosity. Looping states such as `waiting`, the observation row, and `running` can stay active until another higher/equal priority action or `idle` replaces them. Timed states such as `waving`, `jumping`, and `failed` automatically return to `idle`.

The interaction mode button cycles through 清静 / 日常 / 活泼 / 睡觉 and persists the current mode. The settings popover also persists size, opacity, always-on-top, launch-at-login, speech bubbles, and proactive reminders. Electron stores settings in the app `userData` folder as `desktop-pet-settings.json` with this shape:

```json
{
  "interactionMode": "standard",
  "mascotWidthPx": 120,
  "opacity": 1,
  "alwaysOnTopEnabled": true,
  "launchAtLoginEnabled": false,
  "speechBubblesEnabled": true,
  "proactiveEventsEnabled": true
}
```

Missing, damaged, or unsupported values safely fall back to defaults so the pet can still start. Standalone browser previews use the local state API when available and fall back to `localStorage` with the same setting shape.

For a visible debug window:

```sh
DESKTOP_PET_DEBUG=1 npm run dev
```

## Project Structure

```text
electron/
  main.mjs       Electron 主进程：透明窗口、拖拽惯性、点击穿透、宠物扫描、IPC
  package-health.mjs 打包前配置核验：electron-builder build.files 和本地 pets 健康
  package-verify.mjs 打包后产物验收：读取 release 内 app.asar 并核验 pets 资源
  pet-health.mjs 打包前项目本地 pets 资源健康检查：manifest、spritesheet、安全路径、重复项
  pet-importer.mjs 显式 Codex 宠物导入桥：校验、复制、不覆盖本地资源
  pet-manifest.mjs manifest v1 必需/可选字段归一化
  pet-management.mjs 本地宠物管理：识别导入标记、保护内置资源、删除项目本地导入目录
  settings-store.mjs 轻量设置存储：大小、透明度、置顶、自启、互动模式等 JSON 持久化
  preload.mjs    安全暴露给渲染层的 desktopPet API
src/
  App.tsx        桌宠渲染、拖拽/缩放/切换器交互、alpha 命中检测
  behavior/      P2 生活行为规则层：事件、互动模式、门派 profile、决策和 renderer 行为队列
  petAnimation.ts Codex-compatible atlas 动画时序
  styles.css     透明覆盖层、角色、切换器 UI
pets/            项目内置宠物包，运行时只从这里加载
scripts/         本地状态控制脚本
docs/            设计记录和工作日志
```

## Development Workflow

```sh
npm run test:settings
npm run test:behavior
npm run test:behavior-queue
npm run test:pet-import
npm run test:pet-management
npm run test:pet-health
npm run test:package-health
npm run test:package-verify
npm run pet:check
npm run package:check
npm run build
git status --short
```

提交前建议至少跑一次 `npm run test:settings`、`npm run test:behavior`、`npm run test:behavior-queue`、`npm run test:pet-import`、`npm run test:pet-management`、`npm run test:pet-health`、`npm run test:package-health`、`npm run test:package-verify` 和 `npm run build`。发布前可直接运行 `npm run preflight` 串起主要检查。打包前也可单独运行 `npm run pet:check` 和 `npm run package:check`；其中 `package:check` 只做 electron-builder 资源配置与本地宠物资源核验，不会生成安装包或 release 产物。构建会执行 TypeScript 类型检查和 Vite 构建。运行中的开发服务会生成 `dist/`，该目录不进入 git。

## Release Workflow

First publishable build gate:

```sh
npm run preflight
rm -rf release
npm run dist:all
npm run package:verify
```

`preflight` runs tests, resource checks, package config checks, and a production build; it does not create installers. `dist:all` runs electron-builder and writes generated macOS/Windows artifacts into `desktop-pet-mvp/release`. `package:verify` is read-only: it inspects the generated `app.asar` files under `release/` and compares packaged pets against the local project `pets/` manifests. After the commands pass, finish the manual Electron checklist in `docs/release-smoke.md`.

## Pet Folders

The app scans the project-local pet folder:

```text
./pets/
```

Before packaging, run the read-only health check:

```sh
npm run pet:check
npm run package:check
npm run package:verify
```

`pet:check` only scans `desktop-pet-mvp/pets/`. It does not read, modify, delete, or sync anything under `~/.codex/pets`. `package:check` wraps that same local pet health check and verifies the electron-builder `build.files` resource allowlist; it is also read-only and does not run electron-builder. `package:verify` requires an existing `release/` from `npm run dist:all`; it reads generated `app.asar` files and fails if packaged pet manifests, spritesheets, duplicate/staging folders, or test materials do not match the local release gate.

Each pet is:

```text
pet.json
spritesheet.webp | spritesheet.png | spritesheet.svg
```

Manifest v1 keeps `id`, `displayName`, and `spritesheetPath` as required fields. Optional metadata fields are `author`, `version`, `tags`, `faction`, `recommendedScale`, `accentColor`, and `behaviorProfile`; old manifests without them still load. Invalid optional fields are ignored by the runtime and reported as warnings by `npm run pet:check`. See `docs/manifest-v1.md`.

The picker can explicitly import compatible Codex pets from:

```text
~/.codex/pets/<pet-id>/
```

Importing copies a valid pet directory into `./pets/<pet-id>/`, refreshes the local pet list, and selects the imported pet. It is not a background sync process: the app does not watch `~/.codex/pets`, does not modify that external directory, and does not overwrite an existing local `./pets/<pet-id>/` folder. A Codex pet whose manifest id already exists locally is treated as already installed so duplicate copies such as `_副本` do not enter the project pet set.

Imported pets receive a lightweight `desktopPetMvp` marker in `pet.json`. The picker can delete only locally imported pets with that marker, and deletion only removes `./pets/<folder>/`. Built-in pets and any older local pets without a reliable imported marker stay protected by default.

The preferred Codex-compatible atlas is:

```text
1536 x 1872
8 columns x 9 rows
192 x 208 per frame
transparent background
```

## States

The renderer follows the Codex row map:

```text
0 idle
1 running-right
2 running-left
3 waving
4 jumping
5 failed
6 waiting
7 running
8 observation row (internal key: review)
```
