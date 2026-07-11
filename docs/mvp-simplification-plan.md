# Desktop Pet MVP 精简开发计划

状态：第二轮 picker-only 精简已实施，待最终人工桌面验收
日期：2026-07-11

> 2026-07-11 追加：ADR-0002 将控制窗进一步收缩为仅保留 picker。下方四字段 settings 任务记录属于第一轮实施历史；当前运行时不再公开 settings UI 或 settings IPC。

## 1. 目标

把当前应用收敛为一个稳定、可打包、易维护的纯桌宠核心：

- 透明、置顶、无边框的常驻桌宠窗口。
- 内置宠物选择与 8×9 spritesheet 兼容。
- 点击、拖拽、切宠和基础气泡反馈。
- 只持久化当前宠物选择。
- 宠物选择器使用独立的普通控制窗口。

成功后，运行时不再包含 JX3 提醒、主动行为调度、本地 HTTP API、Codex
宠物导入、本地宠物删除和开机自启。

## 2. 已确认假设

- 保留 Electron、React、TypeScript 和 Vite，不增加依赖。
- 保留 `pets/` 中的内置资源和现有 manifest/spritesheet 协议。
- `desktop-pet-site`、Pi 宠物生成器和 `~/.codex/pets` 不在本轮修改范围。
- 旧 settings 文件允许无损迁移：读取时忽略被删除字段，随后只写四字段契约。
- 不创建提交、不切换分支，除非用户后续明确要求。

## 3. 目标架构

```text
Electron main
├── petWindow       透明常驻，只显示宠物和气泡
├── controlWindow   普通窗口，只显示 picker
├── selectionStore  selectedPetId 单字段 JSON
├── petRepository   只读内置 pets/
└── typed IPC       无 HTTP server

React renderer
├── PetSurface      sprite、点击、拖拽、基础气泡
├── ControlSurface  picker
└── petStateMachine idle/dragging/waving/jumping
```

当前持久化契约：

```ts
type PetSelection = { selectedPetId: string | null };
```

## 4. 边界

### 必须做到

- 每个行为切片先有失败测试或明确的现状验证。
- 每个任务最多修改约 5 个文件，并在完成后运行专项测试和 TypeScript 检查。
- 保留用户当前未提交改动，不回滚或覆盖不属于本轮的内容。
- `pet-health`、`package-health`、`package-verify` 和内置资源校验继续保留。

### 需要先询问

- 引入任何新依赖。
- 改变 8×9 spritesheet 或 manifest 公共协议。
- 修改 `desktop-pet-site`、Pi 生成器、版本号、签名或发布产物。
- 创建提交、tag、分支或推送远端。

### 不做

- 不保留隐藏的旧功能开关。
- 不增加 Redux、事件总线、HTTP 服务或插件系统。
- 不在本轮重新设计宠物视觉和网站内容。

## 5. 可执行任务

### Phase 0：规格与基线

- [x] Task 0.1：记录当前工作树和专项测试基线
  - 验收：settings、behavior、reminder、state API、import 专项测试均有结果。
  - 验证：`git diff --check` 与对应 `npm run test:*`。
  - 文件：无。

- [x] Task 0.2：写入精简规格和双窗口 ADR
  - 验收：范围、架构、任务、风险和最终门禁均可追踪。
  - 验证：文档人工检查。
  - 文件：本文件、`docs/decisions/0001-split-pet-and-control-windows.md`。

### Phase 1：最小行为核心与 JX3 切除

- [x] Task 1.1：定义四态宠物状态机
  - 验收：只允许 idle、dragging、waving、jumping；非法旧状态被拒绝。
  - 验证：`node --experimental-strip-types tests/behavior/slim-pet-state-machine.test.ts`。
  - 文件：`src/behavior/petStateMachine.ts`、对应测试。

- [x] Task 1.2：断开 App 的 JX3 reminder 集成
  - 验收：App 不再引用 JX3 scheduler、面板、规则或提醒气泡。
  - 验证：`rg -n 'Jx3|jx3' src/App.tsx` 无结果；`npx tsc --noEmit`。
  - 文件：`src/App.tsx`。

- [x] Task 1.3：删除 JX3 settings 契约
  - 验收：renderer、hook、types、Electron store 不再读写 `jx3Reminders`。
  - 验证：settings 专项测试与 `npx tsc --noEmit`。
  - 文件：settings renderer、settings hook、types、Electron store。

- [x] Task 1.4：删除 JX3 模块、测试和样式
  - 验收：`src/reminders/` 和对应命令消失，preflight 不再调用它们。
  - 验证：`rg -n 'Jx3|jx3-reminder|jx3Reminders' src electron tests scripts package.json`。
  - 文件：reminder 模块、测试、`package.json`、`scripts/preflight.mjs`、CSS。

### Phase 2：删除本地 HTTP API

- [x] Task 2.1：删除 renderer 的 HTTP fallback
  - 验收：Electron 只使用 preload IPC，浏览器预览使用显式内存 fixture。
  - 验证：HTTP/XHR endpoint `rg` 无结果；`npx tsc --noEmit`。
  - 文件：`src/desktopPetApi.ts`。

- [x] Task 2.2：把 Electron smoke 改为 renderer/preload/IPC 探针
  - 验收：smoke 启动 Vite，renderer 缺失时失败，并验证设置、状态、选宠。
  - 验证：`npm run smoke:electron`。
  - 文件：`electron/main.mjs`、`tests/smoke/electron-smoke.mjs`。

- [x] Task 2.3：删除 main HTTP server 和控制脚本
  - 验收：应用不监听端口，不使用 token，不包含 `/state` 等路由。
  - 验证：state API 符号 `rg` 无结果；Electron smoke 通过。
  - 文件：`electron/main.mjs`、state auth、pet-state script、测试、`package.json`。

### Phase 3：删除导入和本地删除

- [x] Task 3.1：从 picker 删除资源坞和导入管理状态
  - 验收：picker 只显示内置宠物、简单搜索和选择操作。
  - 验证：TypeScript、build、picker 人工检查。
  - 文件：`src/App.tsx`、`src/styles.css`。

- [x] Task 3.2：删除导入/删除 IPC 与类型
  - 验收：preload、renderer API、main 和 types 均无 Codex/local management 方法。
  - 验证：`rg -n 'CodexPet|LocalPet|importCodex|deleteLocal' src electron` 无结果。
  - 文件：main、preload、desktop API、types。

- [x] Task 3.3：删除导入实现和测试
  - 验收：pet importer/management 代码及命令消失，资源健康检查仍保留。
  - 验证：pet health、package health、package verify 全部通过。
  - 文件：两个 Electron 模块、两个测试、`package.json`/preflight。

### Phase 4：删除主动行为并收缩 settings

- [x] Task 4.1：把直接交互接入四态状态机
  - 验收：点击、拖拽、松手、切宠只走确定性状态转换。
  - 验证：状态机测试、behavior 核心回归、TypeScript。
  - 文件：App、状态机、相关测试。

- [x] Task 4.2：删除主动 timer、lifestyle 和 event queue
  - 验收：无 idle timeout、long session、night comfort、priority queue。
  - 验证：相关符号 `rg` 无结果；build 通过。
  - 文件：App、lifestyle、event queue、两个旧测试。

- [x] Task 4.3：把 settings 收缩到四字段
  - 验收：旧 JSON 字段被忽略；Electron/renderer normalization 完全一致。
  - 验证：`slim-settings-contract.test.ts` 从红变绿；settings 测试通过。
  - 文件：types、renderer settings、hook、Electron store、settings tests。

### Phase 5：双窗口迁移

- [x] Task 5.1：抽离 picker 与 settings 组件
  - 验收：组件不依赖 pet overlay 的局部状态。
  - 验证：TypeScript 与现有单窗口行为暂时保持可用。
  - 文件：App、Picker、SettingsPanel、共享类型/样式。

- [x] Task 5.2：增加 renderer surface router
  - 验收：`surface=pet` 只渲染 PetSurface；`surface=control` 只渲染 ControlSurface。
  - 验证：build 和浏览器两个 URL 的 DOM 检查。
  - 文件：main renderer entry、PetSurface、ControlSurface、App。

- [x] Task 5.3：实现 controlWindow 与最小 IPC
  - 验收：右键/托盘打开控制窗；关闭控制窗不退出桌宠；重复打开复用窗口。
  - 验证：window geometry tests 与 Electron smoke。
  - 文件：main、preload、types、window tests。

- [x] Task 5.4：删除单窗口 overlay 几何逻辑
  - 验收：打开控制窗不改变 petWindow bounds；旧 picker-open/overlay phase 消失。
  - 验证：Electron smoke 和人工桌面检查。
  - 文件：main、App、styles、geometry tests。

### Phase 6：清理与门禁

- [x] Task 6.1：删除死代码、旧 CSS、旧测试和过期文档入口
  - 验收：无孤立 imports、旧 feature 名称或不可达 UI。
  - 验证：`rg`、TypeScript、`git diff --check`。
  - 文件：每次最多 5 个，按功能组拆分。

- [x] Task 6.2：最终自动验证
  - 验收：核心测试、资源检查、build、smoke 全绿。
  - 验证：`npm run preflight`、`npm run smoke:electron`。
  - 文件：无或仅门禁脚本。

- [x] Task 6.2b：验证真实打包产物
  - 验收：Mac/Windows `app.asar` 内容一致，macOS `.app` 使用生产态 `file://` renderer 通过完整 Electron smoke。
  - 验证：`npm run release:gate`，以及设置 `DESKTOP_PET_SMOKE_EXECUTABLE` 后运行 `npm run smoke:electron`。
  - 文件：`tests/smoke/electron-smoke.mjs`、`electron/package-verify.mjs`。

- [ ] Task 6.3：人工桌面验收
  - 验收：启动、点击、拖拽、切宠、透明穿透、退出均正常。
  - 验证：按 `docs/release-smoke.md` 的精简清单执行。
  - 文件：文档结果记录。

### Phase 7：Picker-only 二次精简

- [x] Task 7.1：删除 settings surface、菜单入口、组件与公开 IPC。
- [x] Task 7.2：删除 settings 内的大小、透明度与置顶控制；按 ADR-0003 恢复桌宠右下角直接缩放把手。
- [x] Task 7.3：把持久化收缩为 `selectedPetId` 与 `mascotWidthPx`，同时兼容读取旧文件。
- [x] Task 7.4：重设计 picker 为搜索、4×2 陈列与底部确认坞。
- [x] Task 7.5：补 picker-only 契约、最小窗口、真实卡片确认与重启持久化验证。

## 6. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 当前工作树已有大量未提交改动 | 每个切片限定文件并反复使用 `git diff --check`，不做 destructive Git 操作 |
| 删除 HTTP 后失去现有 smoke | 先完成 renderer/preload/IPC smoke，再删除 server |
| 旧 settings 数据影响启动 | selection store 只读取 `selectedPetId`，后续写回收缩为单字段 |
| 双窗口破坏透明窗口位置 | smoke 明确断言打开控制窗前后 pet bounds 不变 |
| App/main 同时大改难以定位回归 | 先删功能，再抽组件和迁移窗口；每步保持可编译 |

## 7. 最终验收

- `DesktopPetSettings` 仅有四个字段。
- 运行时无 HTTP listener、reminder timer、proactive timer、Codex import scan。
- PetWindow 和 ControlWindow 独立，控制窗不会改变宠物位置。
- 点击、拖拽和切宠持久化可用。
- 内置宠物资源和 8×9 spritesheet 兼容。
- `npm run preflight`、`npm run smoke:electron` 通过。
