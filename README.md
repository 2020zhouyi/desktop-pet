# Desktop Pet MVP

一个可以在 macOS 和 Windows 桌面运行的透明动画桌宠。项目基于 Electron、React、TypeScript 和 Vite，支持逐像素点击穿透、角色拖拽、直接缩放、宠物选择以及可由玩家自行编辑的气泡台词。

## 功能

- 透明、无边框、始终置顶的桌宠窗口
- 角色周围透明区域点击穿透
- 鼠标悬停播放跳跃动作
- 向左、向右拖拽使用不同跑步动画
- 右下角拖拽手柄调整大小
- 独立的浅色宠物选择窗口
- 选择窗口内可勾选“开机自启”
- 文件夹式宠物管理：复制即导入，删除即移除
- 每个宠物在自己的 `pet.json` 中维护名称、Tag 和气泡台词
- 首次运行自动把内置宠物复制到统一的可写宠物目录

## 普通玩家快速使用

### 1. 启动桌宠

从 Release 下载对应平台的压缩包或安装包：

- macOS：`.dmg` 或 `mac-arm64.zip`
- Windows：`win-x64.zip`

当前本地构建未进行 Apple 签名和公证。macOS 如果阻止首次启动，可在“系统设置 → 隐私与安全性”中确认打开。

### 2. 基本操作

| 操作 | 效果 |
| --- | --- |
| 鼠标悬停角色 | 播放跳跃动作 |
| 单击角色 | 播放点击反馈和气泡 |
| 左右拖拽角色 | 移动桌宠，并播放对应方向的跑步动作 |
| 拖拽右下角手柄 | 调整桌宠大小 |
| 右键角色 | 打开“选择宠物 / 退出”菜单 |

### 3. 选择宠物

右键桌宠，点击“选择宠物…”。在选择窗口中：

1. 点击卡片预览角色。
2. 点击“确认使用”。
3. 选择结果和角色大小会自动保存。

选择窗口右上角的“开机自启”开关用于控制桌宠是否随系统登录自动启动。该选项只在打包后的应用中注册系统登录项，开发模式不会把 Electron 开发进程加入开机启动。

## 宠物管理

在选择宠物窗口点击右上角“管理宠物”，应用会打开唯一的用户宠物目录。

macOS 默认位置：

```text
~/Library/Application Support/desktop-pet-mvp/pets/
```

Windows 默认位置：

```text
%APPDATA%\desktop-pet-mvp\pets\
```

所有内置宠物和自定义宠物都在这个目录中，每个角色使用一个独立文件夹：

```text
pets/
├── 七秀/
│   ├── pet.json
│   └── spritesheet.webp
├── 唐怀仁/
│   ├── pet.json
│   └── spritesheet.webp
└── 你的角色/
    ├── pet.json
    └── spritesheet.webp
```

应用首次运行时会把内置宠物复制到这里一次。之后你可以自由删除；被删除的内置宠物不会在每次重启时自动恢复。

### 导入网站下载的宠物

如果下载的是 ZIP：

1. 先解压 ZIP。
2. 确认解压后的角色文件夹中直接包含 `pet.json` 和 `spritesheet.webp`。
3. 把整个角色文件夹复制到“管理宠物”打开的目录。
4. 回到宠物选择窗口；窗口重新获得焦点时会刷新资源。必要时关闭并重新打开选择窗口。

不要把 ZIP 文件本身直接放进宠物目录。

### 导入 Codex 自定义宠物

Codex 创建的宠物通常位于：

```text
~/.codex/pets/<pet-id>/
```

把其中完整的角色文件夹复制到本项目“管理宠物”打开的目录即可。两者使用相同的 `8 × 9` 图集协议和 manifest 基本格式。

### 删除宠物

在“管理宠物”打开的目录中删除对应角色文件夹，然后回到选择窗口刷新即可。如果删除的是当前角色，应用会自动切换到仍然可用的宠物。

## 自定义角色名称、Tag 和台词

所有可编辑内容都在角色文件夹的 `pet.json` 中。可以使用文本编辑器打开，例如 VS Code、记事本或文本编辑。

### 完整示例

```json
{
  "id": "my-pet-stable-id",
  "displayName": "我的角色",
  "description": "一个陪伴在桌面的自定义角色。",
  "spritesheetPath": "spritesheet.webp",
  "author": "你的名字",
  "version": "1.0.0",
  "tags": ["自定义", "玩家", "可爱"],
  "faction": "七秀",
  "recommendedScale": 1,
  "accentColor": "#10a37f",
  "bubbleLines": {
    "welcome": [
      "我来啦，今天也一起加油。",
      "桌面伙伴已就位。"
    ],
    "click": [
      "我在呢。",
      "轻一点，会痒。"
    ],
    "drag": [
      "慢一点，我跟上。",
      "要搬去哪里？"
    ],
    "petSwitch": [
      "换好啦，这次由我陪你。",
      "交接完成，我来接班。"
    ]
  }
}
```

### 字段说明

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定且唯一的资源 ID。建立后不要随意修改 |
| `displayName` | 是 | 选择器显示的中文角色名称 |
| `spritesheetPath` | 是 | 图集文件相对路径，通常为 `spritesheet.webp` |
| `description` | 否 | 角色说明 |
| `author` | 否 | 作者名称 |
| `version` | 否 | 资源版本 |
| `tags` | 否 | 非空字符串数组，例如 `["玩家", "七秀"]` |
| `faction` | 否 | 门派或阵营 |
| `recommendedScale` | 否 | 建议缩放，允许 `0.5` 到 `2` |
| `accentColor` | 否 | `#rgb` 或 `#rrggbb` 颜色值 |
| `bubbleLines` | 否 | 四类可编辑气泡台词 |

### 气泡场景

| 键名 | 触发时机 |
| --- | --- |
| `welcome` | 桌宠首次就绪 |
| `click` | 单击角色且没有发生拖拽 |
| `drag` | 完成一次真实拖拽 |
| `petSwitch` | 确认切换到该角色 |

每个场景必须是字符串数组，可以写 1–3 句。应用会从可用句子中选择。不要写成单个字符串：

```json
"click": ["正确写法"]
```

```json
"click": "错误写法"
```

保存后回到选择窗口触发刷新，或重启桌宠。角色 JSON 中的 `bubbleLines` 优先级最高；缺少某个场景时才使用应用内置回退。

### 文件夹名称

应用会根据 `displayName` 把宠物文件夹整理为角色名称，例如：

```text
displayName: "阿史那承庆" → 文件夹: 阿史那承庆/
displayName: "七秀"       → 文件夹: 七秀/
```

`/`、`:` 等不适合作为文件名的字符会被替换。同名目录发生冲突时，应用不会覆盖已有资源。

## 动画图集规范

图集固定为 `1536 × 1872`、透明背景、`8 列 × 9 行`，每格 `192 × 208`。

| 行 | 动作 | 使用帧 |
| ---: | --- | ---: |
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

当前桌宠直接使用 `idle`、`running-right`、`running-left`、`waving` 和 `jumping`。其余行保留 Codex 资源兼容性。每行未使用的格子必须完全透明。

## 开发者运行

环境要求：Node.js 20 或更高版本。

```sh
npm install
npm run dev
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run build` | TypeScript 检查并构建 renderer |
| `npm run pet:check` | 检查项目内置宠物资源 |
| `npm run pet:embed-bubbles` | 把内置回退台词写入项目宠物 manifest |
| `npm run test:pet-library` | 验证统一宠物目录初始化和命名 |
| `npm run test:pet-state-machine` | 验证交互状态与左右拖拽 |
| `npm run test:bubbles` | 验证角色 JSON 台词优先级 |
| `npm run preflight` | 运行测试、资源检查和构建 |
| `npm run smoke:electron` | 真实 Electron 双窗口冒烟测试 |
| `npm run release:gate` | 预检、macOS/Windows 打包和产物验收 |

## 项目结构

```text
desktop-pet-mvp/
├── electron/   Electron 主进程、窗口、IPC、统一宠物库和安全边界
├── src/        React 桌宠、选择器、动画、气泡和样式
├── pets/       随安装包提供的初始内置宠物种子
├── scripts/    资源检查、台词迁移、预检和发布门禁
├── tests/      状态机、资源、窗口、安全和 Electron 冒烟测试
└── docs/       架构决策、manifest 和发布说明
```

进一步资料：

- [项目结构](docs/project-structure.md)
- [宠物 manifest](docs/manifest-v1.md)
- [气泡文案指南](docs/speech-bubble-copy-guide.md)
- [发布验证](docs/release-smoke.md)

## 发布说明

- `dist/`、`release/`、日志和用户数据目录不进入 Git。
- `release:gate` 只清理本仓库的 `release/` 后重新打包。
- 当前 macOS 构建未配置签名与公证，不应直接视为正式商店发行包。
- 导入第三方角色资源时，请自行确认版权和再分发权限。
