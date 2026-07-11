# External Model Handoff

日期：2026-07-11

这是当前 Desktop Pet MVP 的一页式接手简报。评审时以运行代码、`package.json` 和自动 smoke 为事实来源，不要从旧计划恢复已经收口的功能。

## Project Role

`desktop-pet-mvp` 是 Electron + React + Vite 桌宠核心应用。

- `desktop-pet-mvp`：当前应用、测试与打包范围。
- `desktop-pet-site`：父目录中的独立展示站。
- `petdex`：参考快照，不是本应用运行时。

不要跨仓库混合运行逻辑、生成产物或提交。

## Current Product Contract

- `PetWindow` 是透明、无边框、置顶的桌宠窗口，负责 sprite、拖拽缩放、点击、逐像素透明穿透和气泡。
- `ControlWindow` 是普通原生窗口，单实例只承载 picker。
- 打开、切换或关闭 `ControlWindow` 不得改变 `PetWindow` bounds。
- 关闭 `ControlWindow` 不得退出 `PetWindow` 或应用。
- 持久化只保留 `selectedPetId` 与 `mascotWidthPx`；没有 settings UI 或通用 settings IPC。
- 核心状态机只有 `idle`、`running-right`、`running-left`、`waving`、`jumping`。
- 气泡场景只有 `welcome`、`click`、`drag`、`petSwitch`。
- 仓库 `pets/` 是首次初始化种子；运行时只加载 Electron `userData/pets/` 中的统一宠物库。

当前 MVP 不包含外部控制服务、应用内复杂资源 CRUD、游戏数据或日程、后台主动行为、系统登录启动配置。宠物管理只负责打开统一资源目录，增删由文件管理器完成。

## Architecture

```text
Electron main
├── PetWindow      ?surface=pet
├── ControlWindow  ?surface=control&panel=picker
├── trusted IPC + selectedPetId store
└── project-local pets + package verification

React renderer
├── App / PetSurface
├── ControlSurface / PetPicker
├── four-state petStateMachine
└── four-scene petBubbles
```

`ControlWindow` 只承载 picker；它不是透明桌宠窗口的扩展区域。renderer 只能通过 `preload.cjs` 暴露的最小 API 与主进程交互。

## Key Files

- `README.md`：五分钟入口、命令和边界。
- `docs/project-structure.md`：当前 tree、picker-only 双窗口、状态和资源契约。
- `docs/release-smoke.md`：自动与人工发布验收。
- `docs/decisions/0001-split-pet-and-control-windows.md`：双窗口决策。
- `docs/decisions/0002-picker-only-control-surface.md`：picker-only 控制面决策。
- `electron/main.mjs`：窗口生命周期、菜单、IPC、选宠持久化与 pets 加载。
- `electron/preload.cjs`：renderer API 边界。
- `electron/window-surfaces.mjs`：surface URL 契约。
- `electron/window-geometry.mjs`：桌宠 bounds 与拖拽几何。
- `electron/pet-selection-store.mjs`：`selectedPetId` 单字段持久化。
- `electron/smoke-probe.mjs`：双窗口与 bounds 自动探针。
- `src/App.tsx`：surface 路由和 PetWindow renderer。
- `src/control/ControlSurface.tsx`：ControlWindow renderer。
- `src/control/PetPicker.tsx`：内置宠物选择 UI。
- `src/behavior/petStateMachine.ts`：五态交互状态机。
- `src/petBubbles.ts`：四场景气泡。
- `tests/smoke/electron-smoke.mjs`：完整 Electron smoke 断言。

## Verification Commands

针对改动运行：

```sh
npm run test:pet-state-machine
npm run test:bubbles
npm run test:selection-store
npm run test:picker-only-surface
npm run test:window-security
npm run test:window-geometry
npm run test:window-surfaces
npm run test:pet-health
npm run test:package-health
npm run test:package-verify
npm run build
```

合并前：

```sh
npm run preflight
npm run smoke:electron
```

生成发布包时：

```sh
npm run release:gate
```

`release:gate` 会写入 `release/`；生成文件不进入 git。

## Review Invariants

- Pet renderer 是否仍能在透明窗口内点击、拖拽并正确穿透透明像素？
- `ControlWindow` 是否只存在 picker，settings surface 是否被拒绝？
- 重复打开 picker 是否复用单个控制窗？
- 控制窗打开与关闭前后，桌宠 bounds 是否完全一致？
- 关闭控制窗后桌宠是否仍存活并可交互？
- selection store 是否只写回 `selectedPetId`，smoke 是否验证重启恢复？
- 核心状态和气泡场景是否仍分别限制为四个？
- preload 是否保持最小 API，主进程 IPC 是否校验受信 sender？
- 运行时、健康检查和打包是否都只读取 `pets/`？
- `preflight`、Electron smoke、release gate 和人工冒烟边界是否清楚？

## Resource, Package And Site Boundaries

- 每个内置宠物包只含 `pet.json` 和一个安全相对路径 spritesheet。
- `pet:check` 与 `package:check` 是只读检查；`package:verify` 读取已有产物。
- `release:gate` 只清理本仓库 `release/`。
- `dist/`、`release/`、安装包、本地选宠文件、日志和运行产物不提交。
- 展示站只通过独立站点配置引用发布下载，不直接读取桌宠运行时或把安装包并入站点源码。
