# Desktop Pet MVP

A tiny Electron + React desktop pet prototype inspired by the Codex pet renderer.

这是一个本地桌宠 MVP：主窗口使用 Electron 透明悬浮窗，渲染层使用 React + CSS sprite atlas，交互方式尽量贴近 Codex pet 的桌面覆盖层。

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
npm run pet:review
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
- Transparent pixels pass through to the desktop; only visible pet pixels capture clicks.
- Window edge constraints use the pet's visible alpha bounds, so dragging to the screen edge hugs the character rather than the transparent atlas cell.

Idle animation uses the Codex timing model: the idle row frame durations are multiplied by 6. Left/right running loops continuously while dragging; other action rows play at their normal frame durations before returning to idle.

## Behavior Model

State changes flow through a small behavior controller in the Electron main process. It gives actions priority, applies a short cooldown to repeated one-shot actions, queues lower-priority actions when another action is already playing, and returns to `idle` when timed actions finish.

The intended state semantics are:

```text
dragging          -> running-left / running-right
click / wake      -> waving
pet switched      -> jumping
long work         -> waiting
busy burst        -> running
needs inspection  -> review
error             -> failed
settled           -> idle
```

Looping states such as `waiting`, `review`, and `running` can stay active until another higher/equal priority action or `idle` replaces them. Timed states such as `waving`, `jumping`, and `failed` automatically return to `idle`.

For a visible debug window:

```sh
DESKTOP_PET_DEBUG=1 npm run dev
```

## Project Structure

```text
electron/
  main.mjs       Electron 主进程：透明窗口、拖拽惯性、点击穿透、宠物扫描、IPC
  preload.mjs    安全暴露给渲染层的 desktopPet API
src/
  App.tsx        桌宠渲染、拖拽/缩放/切换器交互、alpha 命中检测
  petAnimation.ts Codex-compatible atlas 动画时序
  styles.css     透明覆盖层、角色、切换器 UI
pets/            项目内置宠物包，运行时只从这里加载
scripts/         本地状态控制脚本
docs/            设计记录和工作日志
```

## Development Workflow

```sh
npm run build
git status --short
```

提交前建议至少跑一次 `npm run build`，它会执行 TypeScript 类型检查和 Vite 构建。运行中的开发服务会生成 `dist/`，该目录不进入 git。

## Pet Folders

The app scans the project-local pet folder:

```text
./pets/
```

Each pet is:

```text
pet.json
spritesheet.webp | spritesheet.png | spritesheet.svg
```

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
8 review
```
