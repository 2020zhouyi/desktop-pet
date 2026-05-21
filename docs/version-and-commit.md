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
npm run build
git status --short
```

涉及桌宠窗口、点击穿透、拖拽、宠物选择器或气泡 UI 时，还要手动冒烟检查：

- `npm run dev` 能启动 Electron 和 Vite。
- `http://127.0.0.1:5173/?picker=1` 可打开选择器。
- 透明背景保持透明。
- 角色可见区域可拖拽，透明空白区域不抢点击。
- 选择器打开/关闭不导致角色明显错位或闪烁。

## 打包检查

涉及打包时：

- 清理旧 `release/` 后重新构建。
- 双端包运行 `npm run dist:all`。
- 校验包内宠物资源数量符合预期。
- 不包含废弃资源，例如 `codexish` 或重复副本目录。

## 宠物资源

- 运行时宠物资源统一放在 `pets/`。
- 每个宠物目录包含：

```text
pet.json
spritesheet.webp | spritesheet.png | spritesheet.svg
```

- 优先使用 Codex-compatible atlas：

```text
8 columns x 9 rows
192 x 208 per frame
transparent background
```

- 不保留重复资源目录，例如 `_副本`。
- 测试宠物、临时素材、截图参考不要打进发布资源。
