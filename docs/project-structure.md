# Project Structure

日期：2026-07-16

本文记录当前 Electron 发布主线与 Windows Rust/Win32 候选的双窗口边界、选宠契约、命令和资源范围。

## Repository Boundary

`desktop-pet-mvp/` 是独立桌宠仓库。Electron 仍承担当前公开发布和 macOS；`native/` 是功能等价的 Windows 原生候选。P0 原型已在生产宿主完整后退出源码和 CI，不再形成第二个运行入口。父目录中的 `desktop-pet-site` 是独立展示站，`petdex` 是参考快照；它们不参与本仓库运行、测试或打包。

```text
desktop-pet-mvp/
|-- electron/
|   |-- main.mjs                 PetWindow / ControlWindow 生命周期、IPC、托盘和 pets 加载
|   |-- preload.cjs              向受信 renderer 暴露最小 desktopPet API
|   |-- pet-selection-store.mjs  selectedPetId 单字段持久化
|   |-- pet-library.mjs          内置种子初始化、统一用户目录和角色名文件夹整理
|   |-- window-geometry.mjs      透明桌宠窗口的 bounds、拖拽和可见区域计算
|   |-- window-security.mjs      renderer URL、导航与外链边界
|   |-- window-surfaces.mjs      Pet / picker-only Control surface URL 契约
|   |-- pet-manifest.mjs         manifest v1 归一化
|   |-- pet-health.mjs           内置 pets 资源健康检查
|   |-- package-health.mjs       Electron Builder 配置与资源范围检查
|   |-- package-verify.mjs       app.asar 与 release/pets-seed 成品验收
|   `-- smoke-probe.mjs          真实 Electron 双窗口探针
|-- src/
|   |-- App.tsx                  surface 路由与 PetWindow renderer
|   |-- control/
|   |   |-- ControlSurface.tsx   picker-only ControlWindow renderer
|   |   |-- PetPicker.tsx        搜索、预览、分页和确认选择
|   |   |-- PetPicker.css        picker 视觉与响应式样式
|   |   `-- pickerPreview.ts     预览 ID 与并发上限
|   |-- behavior/
|   |   `-- petStateMachine.ts   idle / 左右跑步 / waving / jumping 状态机
|   |-- desktopPetApi.ts         Electron API 与浏览器内存 fixture
|   |-- petAnimation.ts          8x9 sprite atlas 帧映射
|   |-- petBubbles.ts            四场景气泡文案路由
|   |-- types.ts                 renderer、IPC 和 manifest 类型
|   `-- styles.css               PetWindow 与共享基础样式
|-- pets/<pet-id>/               首次初始化使用的内置种子资源
|-- native/
|   |-- desktop-pet-core/        平台无关状态、几何、资源、气泡、picker 与设置
|   |-- desktop-pet-render/      WebP/PNG/SVG atlas 解码、渲染缓存与 alpha 命中
|   |-- desktop-pet-app/         Electron 旧数据合并、用户目录、消费式种子和设置事务
|   |-- desktop-pet-windows/     Win32 Pet/Picker/Bubble 窗、托盘、自启和日志
|   `-- scripts/                 Windows 打包、成品校验与隔离运行证据
|-- .github/workflows/          Electron CI 与 Windows 原生构建/体积门禁
|-- scripts/                     preflight、release gate 与资源检查入口
|-- tests/                       行为、窗口、资源、picker 和 Electron smoke
|-- docs/                        结构、ADR、发布、交接和版本说明
`-- package.json                scripts、版本和 Electron Builder 配置
```

## Window Model

### Electron 发布主线

| Surface | Native window | Purpose |
| --- | --- | --- |
| `?surface=pet` | `PetWindow` | 透明桌宠、sprite、拖拽缩放、逐像素点击与气泡 |
| `?surface=control&panel=picker` | `ControlWindow` | 无原生标题栏的单框体选择器：搜索、预览和确认选择 |

settings panel 不是合法 surface。`PetWindow` 和 `ControlWindow` 生命周期独立；打开或关闭 picker 不得改变桌宠 bounds，关闭 picker 不得退出应用。

renderer 只通过 `preload.cjs` 暴露的受信 IPC 与主进程通信。surface URL 由 `window-surfaces.mjs` 构造并由 `window-security.mjs` 校验。

### Windows 原生候选

| Window | Purpose |
| --- | --- |
| layered `PetWindow` | sprite、逐像素窗口 region、拖拽、缩放、置顶和右键 |
| `PickerWindow` | 原生搜索、4×2 卡片、真实预览、确认选择、自启和管理目录 |
| click-through `BubbleWindow` | welcome、click、drag、petSwitch；不扩大 PetWindow 命中范围 |

三类 HWND 生命周期独立。picker 使用系统控件和对话框键盘导航，不承载 WebView；关闭 picker 不退出应用，也不修改 PetWindow bounds。高频窗口移动只由 Win32 `GetCursorPos` 和 `SetWindowPos` 写入。

## Selection Contract

应用持久化当前宠物 ID、桌宠宽度和开机自启选择：

```json
{
  "selectedPetId": "user:player-01",
  "mascotWidthPx": 120,
  "launchAtLogin": false
}
```

Electron 实现位于 `electron/pet-selection-store.mjs`，原生实现位于 `desktop-pet-core/preferences.rs` 与 `desktop-pet-app`。文件名继续使用 `desktop-pet-settings.json`；只读写 `selectedPetId`、`mascotWidthPx` 与 `launchAtLogin`，透明度、可变置顶等旧字段继续忽略。开机自启只通过 picker 勾选修改；原生 Windows 将状态与 HKCU `Run` 事务同步。

## Interaction Contract

```text
idle -> running-right -> idle
idle -> running-left  -> idle
idle -> waving  -> idle
idle -> jumping -> idle
```

气泡只包含 `welcome`、`click`、`drag`、`petSwitch`，优先读取角色 `pet.json.bubbleLines`。picker 使用两阶段选择：卡片点击只更新预览，确认按钮才写入选择。按下角色本身不切换动画，横向移动达到 4px 后才进入对应方向跑步。

## Command Tiers

核心契约：

```sh
npm run test:selection-store
npm run test:pet-library
npm run test:picker-only-surface
npm run test:picker-preview
npm run test:pet-state-machine
npm run test:bubbles
npm run test:window-security
npm run test:window-geometry
npm run test:window-surfaces
npm run test:ipc-capabilities
```

完整门禁：

```sh
npm run preflight
npm run smoke:electron
npm run release:gate
```

`package:verify` 读取已有 release；`release:gate` 才会清理本仓库 `release/` 并生成安装包。

Windows 原生候选：

```sh
cargo fmt --manifest-path native/Cargo.toml --all --check
cargo test --manifest-path native/Cargo.toml --workspace --locked
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets --locked -- -D warnings
```

Windows 本机再运行：

```powershell
.\native\scripts\package-windows.ps1
.\native\scripts\verify-windows-package.ps1 `
  -ArchivePath .\native\target\package\DesktopPet-Windows-x64.zip `
  -MetadataPath .\native\target\package\DesktopPet-Windows-x64.artifact.json
.\native\scripts\verify-windows-runtime.ps1 `
  -PackageDirectory .\native\target\package\DesktopPet-Windows-x64
```

完整 VM/实机门禁见 [windows-native-migration.md](windows-native-migration.md)。

## Pet Resource Contract

`./pets/<pet-id>/` 是两条实现共享的发布种子。首次运行后，内置与自定义资源统一位于平台用户数据的 `pets/`，运行时只扫描这一可写目录。每个目录只允许 `pet.json` 和一个 manifest 引用的 spritesheet；名称、Tag 和四类气泡台词由角色自己的 manifest 管理。

## Packaging And Site Boundary

- `app.asar` 只打包 `dist/`、`electron/`、`public/` 和 `package.json`；25 个角色通过 `extraResources` 单独进入 `resources/pets-seed/`。
- macOS 发布 DMG；Windows 发布包含完整应用目录和资源的便携 ZIP，不生成安装器。
- 原生 Windows 候选只包含 `DesktopPet.exe` 与 `pets-seed/`，不包含 Chromium、Node 或 WebView；PowerShell 门禁预算为 20/65/90 MiB。
- 打包态首次运行优先移动 `pets-seed` 到 `userData/pets/`，跨卷或只读来源则复制并尽力删除源目录；一次性标记防止后续恢复用户已删除角色。
- 原生候选全项通过前，GitHub Release 和站点 Windows 下载入口仍指向 Electron ZIP；切换与回滚按 `windows-native-migration.md` 执行。
- `release/` 是生成产物，不进入 git，也不属于父目录任何项目。
- `desktop-pet-site` 通过独立配置提供下载或展示，不读取本仓库运行时状态。
