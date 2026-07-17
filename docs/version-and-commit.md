# 版本与提交规范

这份文档用于版本、提交、打包、发布和资源清理任务。当前实现事实以 [MVP 精简计划](mvp-simplification-plan.md)、[双窗口 ADR](decisions/0001-split-pet-and-control-windows.md)、[picker-only ADR](decisions/0002-picker-only-control-surface.md) 和代码为准。

## 版本管理

- `package.json` 的 `version` 是应用版本号唯一来源。
- `native/Cargo.toml` 的 workspace 版本必须与 `package.json` 同步；Windows artifact JSON 直接读取 `package.json`，不得手写另一个发布版本。
- 当前使用 `0.x.y` MVP 版本线：
  - `0.x.0`：新增明确用户价值或改变产品契约。
  - `0.x.y`：修复、视觉优化、资源整理和打包修正。
- 改变窗口架构、选宠持久化、manifest 或 spritesheet 协议前，先更新规格或 ADR。
- `dist/`、`release/`、安装包、本地选宠文件、日志和平台运行产物不进入 git。

## 当前发布契约

任何版本都必须保持：

- `PetWindow`：透明、无边框、置顶，只承载桌宠与基础气泡。
- `ControlWindow`：普通原生窗口，单实例只承载 picker。
- 打开、切换和关闭 `ControlWindow` 不改变 `PetWindow` bounds。
- 关闭 `ControlWindow` 不退出桌宠或应用。
- 持久化只包含：

```text
selectedPetId
mascotWidthPx
launchAtLogin
```

- 核心状态机只包含：

```text
idle
running-right / running-left
waving
jumping
```

- Runtime 不包含本地 HTTP 服务或 token、应用内宠物导入/删除、提醒或主动调度。
- Runtime 只读取 `userData/pets/`；“管理宠物”通过系统文件管理器打开该目录。
- 发布包离线包含完整 `pets-seed`。首次运行迁移到统一目录并写入一次性标记，玩家删除的角色不会自动恢复。
- 开机自启只保留 picker 中的一个受限勾选项。

## 仓库与提交边界

- 只在 `desktop-pet-mvp` 独立 Git 仓库提交本应用改动。
- 父目录的 `desktop-pet-site` 是独立展示站，`petdex` 是参考快照；除非任务明确跨项目，不放入同一提交。
- 开始和结束时都检查：

```sh
git status --short
git diff --stat
git diff --check
```

- 保留工作区已有改动，只暂存本轮明确归属文件。
- 一个 commit 只做一类事情：行为、窗口、样式、资源、测试、打包或文档不要无关混合。

提交信息使用 Conventional Commits：

```text
<type>: <summary>
```

常用类型：`feat`、`fix`、`refactor`、`test`、`build`、`docs`、`chore`。

示例：

```text
feat: split pet and control windows
fix: preserve pet bounds when opening controls
test: cover renderer IPC capabilities
build: verify packaged pet resources
docs: align release checklist with slim runtime
```

## 提交前自动检查

最低门禁：

```sh
npm run preflight
npm run smoke:electron
git diff --check
git status --short
```

按改动范围可先运行专项命令：

```sh
npm run test:pet-state-machine
npm run test:bubbles
npm run test:selection-store
npm run test:picker-only-surface
npm run test:picker-preview
npm run test:window-security
npm run test:window-geometry
npm run test:window-surfaces
npm run build
```

CI 使用 `npm ci` 和 `npm run preflight`，不生成 release，也不替代真实 Electron smoke 与人工平台验收。

Windows 原生改动还必须运行 workspace 测试、Clippy `-D warnings` 和 Windows 本机构建/包体门禁；macOS `cargo xwin` 只能证明 x64 PE 可编译，不能替代真实 Windows HWND、登录启动、DPI 与多屏验收。完整命令见 [windows-native-migration.md](windows-native-migration.md)。

## 人工验收清单

### PetWindow

- 背景透明且 sprite 外没有不透明矩形。
- 可见像素能点击和拖拽；透明像素不抢后方点击。
- 单击进入 `waving`，拖拽达到 4px 后按方向进入 `running-right` 或 `running-left`，松手回到 `idle`。
- 确认切宠后进入 `jumping`，随后回到 `idle`。
- 右键菜单只能打开 picker，并能退出应用。

### ControlWindow

- picker 在独立普通窗口中，不覆盖透明桌宠窗口。
- 重复打开 picker 复用同一个控制窗实例。
- 打开和关闭控制窗前后，桌宠位置与尺寸不变。
- 标题栏关闭、面板关闭按钮和 Escape 只关闭控制窗；桌宠继续运行。
- picker 显示统一用户目录中的宠物，搜索、分页、预览和确认切换可用。

### Selection

- `selectedPetId` 由确认切宠更新并在重启后恢复。
- 旧 settings 文件中的不支持字段会被忽略；后续写回只有 `selectedPetId`。

### Removed Runtime Surface

- 应用不监听本地业务端口，也不要求运行 token。
- picker 只有“管理宠物”目录入口，不提供应用内导入或删除；运行时资源来自统一用户宠物目录。
- renderer 没有 settings、提醒、主动行为或登录启动控制。
- preload 与主进程只保留当前双窗口所需 IPC；未知 sender 或 channel 被拒绝。

完整人工步骤见 [release-smoke.md](release-smoke.md)。

## 打包检查

发布候选推荐直接运行：

```sh
npm run release:gate
```

流程为：

```text
preflight -> clean desktop-pet-mvp/release -> dist:all -> package:verify
```

边界：

- 只清理本仓库 `release/`。
- `npm run pet:check` 只读检查 `pets/`。
- `npm run package:check` 只读检查 Electron Builder 配置和资源范围。
- `npm run package:verify` 只读检查已有 Mac/Windows `app.asar` 和 `resources/pets-seed/`。
- `npm run dist:all` 和 `npm run release:gate` 会写入 `release/`。
- macOS 当前 `identity=null`；本地包不等于完成签名和公证的公开发行包。
- macOS 产物为 DMG；Windows 产物为便携 ZIP，不发布 NSIS 安装器。
- 最后按 `release-smoke.md` 记录双窗口、bounds、持久化、资源和平台结果。
- 原生 Windows ZIP 只有在 `windows-native-migration.md` 的 VM、真实 x64、artifact、下载链接和回滚检查全部通过后，才可替换 Electron Windows ZIP。

## 宠物资源

运行与打包只使用：

```text
pets/<pet-id>/pet.json
pets/<pet-id>/spritesheet.webp | spritesheet.png | spritesheet.svg
```

- manifest 必需字段为 `id`、`displayName`、`spritesheetPath`。
- `spritesheetPath` 必须是当前宠物目录内的安全相对路径。
- 每个宠物目录只允许 manifest 和一个被引用的 spritesheet。
- 重复 ID、额外文件、符号链接、复制目录、测试素材和超限资源会阻断健康检查或包验证。
- 默认 atlas 为 8 列 × 9 行，每帧 192 × 208，透明背景。
- 改变资源协议时同步更新 `manifest-v1.md`、资源检查、包验证和测试。
