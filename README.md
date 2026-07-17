# 剑三小桌宠

一个运行在电脑桌面上的剑网 3 同人像素小宠物。它会保持透明置顶，在桌面上待机，并响应点击、拖拽、切换角色等简单操作。

- [在线角色图鉴](https://2020zhouyi.github.io/desktop-pet-site/)
- [下载桌宠](https://github.com/2020zhouyi/desktop-pet/releases/latest)
- [问题反馈](https://github.com/2020zhouyi/desktop-pet/issues)

## 当前功能

- macOS 和 Windows 桌面运行
- 透明、无边框、始终置顶
- 透明区域点击穿透，不影响桌面操作
- 点击角色、左右拖拽和切换角色动画
- 独立角色选择窗口
- 角色大小与当前选择自动保存
- 开机自启开关
- 角色气泡台词
- 25 个内置剑三角色
- 从统一宠物目录添加自定义角色

## 下载与启动

前往 [Releases](https://github.com/2020zhouyi/desktop-pet/releases/latest) 下载对应平台文件：

- macOS：`Desktop.Pet.MVP-0.1.3-mac-arm64.dmg`
- Windows：`Desktop.Pet.MVP-0.1.3-win-x64.zip`

macOS 构建暂未进行 Apple 签名和公证。如果系统阻止首次启动，请在“系统设置 → 隐私与安全性”中确认打开。

Windows 版本无需安装：解压完整 ZIP 后运行其中的 `Desktop Pet MVP.exe`，不要只把单独的 `.exe` 拿出目录。

两个平台包都离线包含全部 25 个角色。首次运行会把这些资源迁移到统一宠物目录；以后程序只读取该目录。你可以在“管理宠物”打开的文件夹中直接添加、改名或删除角色，删掉的内置角色不会在重启后自动恢复。

## 基本操作

| 操作 | 效果 |
| --- | --- |
| 单击角色 | 播放动作并显示气泡 |
| 左右拖拽 | 移动桌宠并播放对应方向动画 |
| 拖拽右下角 | 调整桌宠大小 |
| 右键角色 | 打开角色选择或退出应用 |
| 选择窗口“确认使用” | 切换并保存当前角色 |

## 添加网站角色包

角色图鉴中的每张角色卡片都提供 ZIP 下载按钮。

1. 下载并解压角色 ZIP。
2. 在桌宠选择窗口点击“管理宠物”。
3. 把解压后的完整角色文件夹复制到打开的目录。
4. 回到选择窗口刷新并选择角色。

角色文件夹应当直接包含：

```text
角色名称/
├── pet.json
└── spritesheet.webp
```

不要把未解压的 ZIP 直接放进宠物目录。

默认宠物目录：

```text
macOS:   ~/Library/Application Support/desktop-pet-mvp/pets/
Windows: %APPDATA%\desktop-pet-mvp\pets\
```

正在验收的 Windows 原生候选使用 `%LOCALAPPDATA%\DesktopPet\pets\`；公开下载入口切换前，普通玩家仍以本节 Electron 路径为准。

原生候选首次启动会把现有 Electron 设置与宠物从 `%APPDATA%\desktop-pet-mvp\` 合并复制到新目录；不会覆盖原生已有同名内容，也不会删除旧目录，因此仍可回退到 Electron 版本。

## 自定义角色

桌宠使用 `8 × 9` 动画图集，每格 `192 × 208`，完整尺寸为 `1536 × 1872`；图集可使用 WebP、PNG 或 SVG。最小 `pet.json` 示例：

```json
{
  "id": "my-pet-id",
  "displayName": "我的角色",
  "spritesheetPath": "spritesheet.webp"
}
```

可选字段包括角色说明、作者、版本、标签、推荐缩放和四类气泡台词。完整格式见 [宠物 manifest 文档](docs/manifest-v1.md)。

## 本地开发

环境要求：Node.js 20 或更高版本。

```sh
npm install
npm run dev
```

常用检查：

```sh
npm run pet:check
npm run preflight
npm run smoke:electron
```

完整发布检查：

```sh
npm run release:gate
```

Windows 原生候选需要 Rust stable；共享契约可在 macOS/Linux 检查，真实运行和发布仍必须在 Windows 验收：

```sh
cargo test --manifest-path native/Cargo.toml --workspace --locked
cargo clippy --manifest-path native/Cargo.toml --workspace --all-targets --locked -- -D warnings
```

完整迁移状态、Windows 包体门禁和回滚路径见 [Windows 原生迁移与验收](docs/windows-native-migration.md)。原生候选已在 Windows 11 ARM64 的 x64 仿真中完成单屏启动、拖拽、缩放、选宠和托盘等早期验收；按本轮收口决定，登录自启复测、混合 DPI/多屏和真实 x64 门禁留给发布前执行。当前公开 Windows Release 仍使用 Electron ZIP。

## 项目结构

```text
electron/  Electron 主进程、窗口与系统能力
src/       React 桌宠、角色选择器与交互
native/    Windows Rust/Win32 功能等价候选
pets/      打包时使用的 25 个离线角色种子
scripts/   资源检查、构建和发布脚本
tests/     状态机、窗口、安全与资源测试
docs/      manifest、架构决策和发布说明
```

## 说明

本项目是《剑网 3》同人衍生作品，非官方授权。角色及相关设定版权归原权利方所有。导入或发布第三方角色资源时，请自行确认版权和再分发权限。
