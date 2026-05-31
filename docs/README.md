# Desktop Pet Docs

这组文档只覆盖 `desktop-pet-mvp` 这个 Electron 桌宠项目。父目录里的 `desktop-pet-site` 是展示站点，`petdex` 是参考/平台源快照；除非任务明确涉及，不在这里混写。

## 当前主线

- 应用形态：Electron 透明悬浮窗 + React/Vite 渲染层 + Codex-compatible sprite atlas。
- 交互主线：拖拽、点击挥手、右键菜单、宠物选择器、设置浮层、生活化气泡和轻量行为队列。
- 资源边界：运行时只加载本项目 `pets/`；Codex 宠物只能通过显式导入复制进来，不自动同步 `~/.codex/pets`。
- 发布边界：`preflight` 做测试/资源/构建检查，`dist:all` 才生成安装包，`package:verify` 只读验收已有 `release/`。

## 文档地图

| 文档 | 何时阅读 | 主要内容 |
| --- | --- | --- |
| [../README.md](../README.md) | 启动、开发、发布前总览 | 运行命令、项目结构、行为模型、资源边界、发布流程 |
| [WORKLOG.md](WORKLOG.md) | 理解阶段演进或继续迭代 | P0-P4 阶段记录、已完成内容、风险和后续建议 |
| [version-and-commit.md](version-and-commit.md) | 涉及版本、提交、打包或资源清理 | 版本规则、提交粒度、预检查、打包检查、资源规则 |
| [p2-lifestyle-behavior-plan.md](p2-lifestyle-behavior-plan.md) | 改行为、气泡、互动模式 | 生活行为内核、事件模型、互动模式、验收方式 |
| [manifest-v1.md](manifest-v1.md) | 改宠物 manifest、导入或健康检查 | manifest 必需/可选字段、兼容策略、导入边界 |
| [release-smoke.md](release-smoke.md) | 打可发布包后人工验收 | 原生窗口、交互、picker、设置、本地 state API 冒烟 |

## 更新规则

- 改用户可见行为时，同步更新 `README.md` 的行为/运行说明和 `WORKLOG.md` 的阶段记录。
- 改资源、导入、manifest、打包边界时，同步更新 `manifest-v1.md`、`version-and-commit.md` 或 `release-smoke.md`。
- 改发布命令或验证链路时，确保 `README.md`、`version-and-commit.md` 和 `release-smoke.md` 的命令保持一致。
- 只记录已经落地或明确决定的内容；探索失败的路线不进入正式文档。
