# Release Smoke Checklist

本清单验证当前 Desktop Pet MVP 的 picker-only 双窗口、选宠持久化、内置资源和打包产物。自动 smoke 是发布前硬门禁；人工 smoke 补充透明窗口、原生交互和平台外观检查。

本页主体仍是 Electron/macOS 发布门禁。Windows `v0.1.4` 已按发布决定切换为 Rust/Win32 便携 ZIP，并保留 `v0.1.3` Electron Windows ZIP 作为回滚；后续原生 Windows 发布仍须结合 [windows-native-migration.md](windows-native-migration.md) 补齐登录自启、混合 DPI/多屏与真实 x64 证据。

## Before Smoke

从仓库根目录运行：

```sh
npm run preflight
npm run smoke:electron
```

准备发布产物时再运行：

```sh
npm run release:gate
```

`release:gate` 会再次执行 `preflight`，只清理本仓库的 `release/`，然后执行 `dist:all` 和 `package:verify`。不要清理父目录、展示站、参考快照或其它生成器输出。

构建完成后，直接验证 macOS 打包应用的生产态加载路径：

```sh
DESKTOP_PET_SMOKE_EXECUTABLE="$PWD/release/mac-arm64/Desktop Pet MVP.app/Contents/MacOS/Desktop Pet MVP" npm run smoke:electron
```

未设置 `DESKTOP_PET_SMOKE_EXECUTABLE` 时，smoke 启动 Vite 并验证开发态；设置后不启动 Vite，而是直接启动指定的打包可执行文件，并要求 renderer 使用 `file://`。

## Automated Electron Smoke

`npm run smoke:electron` 使用临时 `userData` 启动真实 Electron，并验证：

- `PetWindow` renderer 和 preload 正常加载。
- 内置宠物列表非空，宠物选择能写回 status 与 `selectedPetId`。
- picker 在单例 `ControlWindow` 中渲染。
- 真实点击宠物卡、确认切换，并在 Electron 重启后恢复选择。
- 关闭 `ControlWindow` 后，`PetWindow` 仍存活。
- 打开、切换和关闭控制窗前后，`PetWindow` bounds 完全不变。
- Control/Pet 两个 surface 的越权 IPC 会被拒绝，窗口与应用保持存活。
- 并发请求 picker 时只创建一个 `ControlWindow`。
- settings surface 和 settings IPC 均被拒绝。

任何一项失败都应阻断发布。

## Start The App

优先检查已打包 macOS app：

```sh
open release/mac*/Desktop\ Pet\ MVP.app
```

只检查开发版本时：

```sh
npm run dev
```

## PetWindow

- 桌宠周围没有不透明矩形，sprite 外保持透明。
- 桌宠保持在普通应用窗口上方。
- 可见 sprite 能被点击和拖拽；透明 atlas 像素不会拦截后方窗口。
- 拖到工作区四边时，可见 sprite 能到达边缘且不会跳回透明窗口中心。
- 快速拖动并松手后立即停在当前位置，不继续惯性滑动，也不跳出工作区。
- 单击而未拖动时播放挥手，并显示 `click` 气泡。
- 完成拖拽后回到 idle，并显示 `drag` 气泡。
- 右键桌宠只显示选择宠物和退出。
- 桌宠保持 100% 不透明和始终置顶；悬停角色后可用右下角把手缩放，重启后尺寸保留。

## ControlWindow

### Picker

- 从桌宠右键菜单打开选择器后，picker 使用独立控制窗，不覆盖透明桌宠窗口。
- 控制窗没有系统原生标题栏或第二层外框，只显示一层自定义选择器框体；标题区域可拖动窗口，右上角关闭按钮可用。
- 第一排宠物卡悬停上浮时，顶部边框、阴影和角色预览不被裁切。
- 整体使用 Codex 风格浅色配色：浅灰页面、白色卡片、中性灰边界与文字、克制的绿色状态和主操作；不随系统切换为暗色。
- 搜索能过滤内置宠物且布局不出现横向溢出。
- 点击宠物只更新预览；确认后才切换桌宠。
- 切换后 sprite、status 和 `selectedPetId` 一致，并播放 `petSwitch` 反馈。
- 760×680 与最小 640×520 下均无横向溢出；4×2 卡片、底部确认坞和分页保持可用。
- settings URL 不会渲染控制面板。

### Close And Bounds

- 使用面板关闭按钮或 Escape 关闭控制窗。
- 控制窗关闭后桌宠继续运行，点击、拖拽和右键仍可用。
- 在打开控制窗前记录桌宠位置与尺寸；打开 picker 并关闭后，位置与尺寸不变。
- 关闭控制窗不会退出应用；只有桌宠原生菜单的退出操作或系统退出才结束进程。

## Persistence

- 选择一个非默认内置宠物。
- 完全退出并重新启动应用。
- 确认选中的 `selectedPetId` 已恢复。
- 旧 `desktop-pet-settings.json` 中的其它字段不会进入后续写回结果。

## Resources And Packages

- `npm run pet:check` 通过，验证仓库内置种子；Electron smoke 另验证统一用户宠物库。
- 每个宠物目录只有 `pet.json` 和一个被 manifest 引用的 spritesheet。
- `npm run package:verify` 确认 Mac 与 Windows `app.asar` 不含重复 pets，且两个 `resources/pets-seed/` 都包含完整 25 个角色。
- 安装包运行时不依赖仓库外资源。
- `release/`、安装包、日志和本地选宠文件保持未跟踪。

## Finish

- 从桌宠右键菜单退出应用。
- 确认 `PetWindow`、`ControlWindow` 和辅助 Electron 进程都已结束。
- 若 macOS 包未签名或未公证，在发布记录中明确标记为阻断项或已接受例外。

## Evidence To Record

- Version：`package.json` 版本与 git commit SHA。
- Gates：`npm run preflight`、`npm run smoke:electron`、`npm run release:gate` 结果。
- Double-window：picker 单例、control close 后 pet 存活、pet bounds 不变。
- Artifacts：

  | Platform | Artifact path | SHA256 | Notes |
  | --- | --- | --- | --- |
  | macOS |  |  |  |
  | Windows |  |  |  |

- Signing：

  | Platform | Signed? | Notarized? | Exception / follow-up |
  | --- | --- | --- | --- |
  | macOS |  |  |  |
  | Windows |  |  |  |

- Manual result：逐节记录通过项与平台例外。

## Windows Native Candidate

在 Windows 本机运行 Rust 门禁、`native/scripts/package-windows.ps1`、`native/scripts/verify-windows-package.ps1` 和隔离运行脚本；随后逐项验证拖拽、alpha、四态、气泡、picker、托盘、自启、100%–200% DPI、负坐标与混合 DPI 多屏。证据至少包含：

- `DesktopPet-Windows-x64.artifact.json` 与 ZIP SHA256；
- `runtime-evidence.json` 和 `%LOCALAPPDATA%\DesktopPet\desktop-pet.log`；
- Windows 架构、版本、缩放、显示器布局及手工结果；
- 登录启动后的 `source=autostart`、`window_visible` 和可拖动结果；
- 鼠标从角色 alpha 区移动到右下方缩放把手的连续录像或逐步结果，确认图标不消失且光标、按下、缩放都可用；
- 自绘 picker 在 100%、150%、200% DPI 下的截图，并记录确认成功后自动关闭、管理目录位于 picker 上方；
- 短句与长句各一张气泡截图，确认动态紧凑尺寸和换行；
- 真实 Windows x64 复核与 Electron ZIP 回滚演练。
