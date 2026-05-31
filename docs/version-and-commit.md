# 版本与提交规范

这份文档只在任务涉及版本、提交、打包、发布或资源清理时阅读。

## 版本管理

- `package.json` 的 `version` 是应用版本号的唯一来源。
- 当前阶段使用 `0.x.y` MVP 版本线：
  - `0.x.0`：有明确用户价值的新功能或交互模块。
  - `0.x.y`：修复、视觉优化、资源整理、打包可见性问题。
  - 破坏兼容或重做核心交互时，先写方案或工作日志，再实现。
- `release/`、`dist/`、安装包和平台产物不进入 git。
- 重要版本节点需要更新 `docs/WORKLOG.md`，记录目的、关键实现和风险。

## 提交粒度

- 一个 commit 只做一类事情。
- 推荐拆分：
  - 行为或交互实现。
  - 视觉样式调整。
  - 宠物资源增删。
- 打包配置或平台修复。
- 文档和工作日志。
- 探索失败的路线不要提交，提交前清理成最终状态。

## 仓库边界

- 桌宠核心应用在 `desktop-pet-mvp` 自己的 Git 仓库内提交。
- 父目录的 `desktop-pet-site` 是展示站点，`petdex` 是参考/平台源快照；除非任务明确要求，不和 MVP 核心应用放进同一提交。
- 提交前用 `git status --short` 和 `git diff --stat` 确认暂存范围，只暂存本轮确认要落地的桌宠文件。
- `release/`、`dist/`、`node_modules/`、安装包、本地设置、日志和平台生成物不进入 git。

## 提交信息

使用 Conventional Commits：

```text
<type>: <summary>
```

常用类型：

- `feat`：新增用户可见能力。
- `fix`：修复 bug 或平台问题。
- `chore`：资源清理、依赖维护、非行为性整理。
- `docs`：文档、工作日志、计划单。
- `build`：打包、构建配置、产物流程。
- `refactor`：不改变行为的代码重组。
- `test`：测试或验证脚本。

示例：

```text
feat: add companion speech bubbles
fix: render packaged desktop pet window
chore: remove duplicate pet assets
build: add desktop packaging
docs: update MVP worklog
```

## 提交前检查

至少执行：

```sh
npm run preflight
git status --short
```

如果只需要基础构建确认，也可以执行：

```sh
npm run build
git status --short
```

涉及桌宠窗口、点击穿透、拖拽、宠物选择器或气泡 UI 时，还要手动冒烟检查：

- `npm run dev` 能启动 Electron 和 Vite。
- `http://127.0.0.1:5173/?picker=1` 可打开选择器。
- 透明背景保持透明。
- 角色可见区域可拖拽，透明空白区域不抢点击。
- 设置里的大小、透明度、置顶、自启、气泡、主动提醒和互动模式能保存并在重开后恢复。
- 选择器搜索、来源/门派筛选、内置/导入标识和 manifest 元信息在小窗口下不溢出。

## 打包检查

涉及打包时：

- 先运行 `npm run preflight`，一次性执行主要测试、资源检查、打包配置核验和构建。
- 如需单独核验，运行 `npm run pet:check`，只读检查项目本地 `desktop-pet-mvp/pets/`。
- 运行 `npm run package:check`，确认 electron-builder `build.files` 包含 `dist/**/*`、`electron/**/*`、`pets/**/*`、`public/**/*` 和 `package.json`，并复用本地宠物资源健康检查。
- `npm run package:check` 不会运行 electron-builder，不会生成安装包，也不会写入 `release/`。
- 清理旧 `release/` 后重新构建；只清理当前项目的 `desktop-pet-mvp/release`，不要清理父目录、`~/.codex/pets`、生成器、`desktop-pet-site` 或 `petdex`。
- 双端包运行 `npm run dist:all`。这个命令会运行 electron-builder，并在 `release/` 生成 macOS/Windows 打包产物。
- 运行 `npm run package:verify`，读取 `release/mac*/**/*.app/Contents/Resources/app.asar` 和 `release/win-unpacked/resources/app.asar`，确认包内 `/pets`、`/pets/*/pet.json` 数量、spritesheet 覆盖、本地宠物健康结果、以及副本/暂存/测试素材排除都符合发布要求。
- `npm run package:verify` 是只读验收；它不会运行 electron-builder，不会生成安装包，也不会修改 `release/`。
- 最后按 `docs/release-smoke.md` 做 Electron 启动冒烟，确认透明窗口、置顶、拖拽、点击挥手、picker、默认宠物和设置读取。

## 宠物资源

- 运行时宠物资源统一放在 `pets/`。
- 每个宠物目录包含：

```text
pet.json
spritesheet.webp | spritesheet.png | spritesheet.svg
```

- `pet.json` manifest v1 的必需字段是 `id`、`displayName`、`spritesheetPath`；可选字段是 `author`、`version`、`tags`、`faction`、`recommendedScale`、`accentColor`、`behaviorProfile`。
- 旧 manifest 不需要补齐可选字段；非法可选字段只应在 `pet:check` 中产生 warning 或被运行时忽略。
- 优先使用 Codex-compatible atlas：

```text
8 columns x 9 rows
192 x 208 per frame
transparent background
```

- 不保留重复资源目录，例如 `_副本`。
- 测试宠物、临时素材、截图参考不要打进发布资源。
