# Project Structure

日期：2026-07-11

本文记录当前可运行代码的双窗口边界、选宠契约、命令和资源范围。

## Repository Boundary

`desktop-pet-mvp/` 是独立的 Electron 桌宠核心仓库。父目录中的 `desktop-pet-site` 是独立展示站，`petdex` 是参考快照；它们不参与本仓库运行、测试或打包。

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
|-- scripts/                     preflight、release gate 与资源检查入口
|-- tests/                       行为、窗口、资源、picker 和 Electron smoke
|-- docs/                        结构、ADR、发布、交接和版本说明
`-- package.json                scripts、版本和 Electron Builder 配置
```

## Window Model

| Surface | Native window | Purpose |
| --- | --- | --- |
| `?surface=pet` | `PetWindow` | 透明桌宠、sprite、拖拽缩放、逐像素点击与气泡 |
| `?surface=control&panel=picker` | `ControlWindow` | 无原生标题栏的单框体选择器：搜索、预览和确认选择 |

settings panel 不是合法 surface。`PetWindow` 和 `ControlWindow` 生命周期独立；打开或关闭 picker 不得改变桌宠 bounds，关闭 picker 不得退出应用。

renderer 只通过 `preload.cjs` 暴露的受信 IPC 与主进程通信。surface URL 由 `window-surfaces.mjs` 构造并由 `window-security.mjs` 校验。

## Selection Contract

应用持久化当前宠物 ID、桌宠宽度和开机自启选择：

```json
{
  "selectedPetId": "user:player-01",
  "mascotWidthPx": 120,
  "launchAtLogin": false
}
```

实现位于 `electron/pet-selection-store.mjs`。文件名继续使用 `desktop-pet-settings.json`；只读写 `selectedPetId`、`mascotWidthPx` 与 `launchAtLogin`，透明度、可变置顶等旧字段继续忽略。开机自启只通过 ControlWindow 的受限 IPC 修改，开发模式不注册系统登录项。

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

## Pet Resource Contract

`./pets/<pet-id>/` 是随安装包发布的内置种子。首次运行后，内置与自定义资源统一位于 Electron `userData/pets/`，运行时只扫描这一可写目录。每个目录只允许 `pet.json` 和一个 manifest 引用的 spritesheet；名称、Tag 和四类气泡台词由角色自己的 manifest 管理。

## Packaging And Site Boundary

- `app.asar` 只打包 `dist/`、`electron/`、`public/` 和 `package.json`；25 个角色通过 `extraResources` 单独进入 `resources/pets-seed/`。
- macOS 发布 DMG；Windows 发布包含完整应用目录和资源的便携 ZIP，不生成安装器。
- 打包态首次运行优先移动 `pets-seed` 到 `userData/pets/`，跨卷或只读来源则复制并尽力删除源目录；一次性标记防止后续恢复用户已删除角色。
- `release/` 是生成产物，不进入 git，也不属于父目录任何项目。
- `desktop-pet-site` 通过独立配置提供下载或展示，不读取本仓库运行时状态。
