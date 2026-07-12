# Desktop Pet Docs

这组文档只覆盖 `desktop-pet-mvp` Electron 桌宠核心。父目录中的 `desktop-pet-site` 是独立展示站，`petdex` 是参考快照；除非任务明确跨项目，否则不要混写运行逻辑、生成产物或提交。

## 当前入口

按下面顺序了解当前项目：

| 文档 | 用途 |
| --- | --- |
| [mvp-simplification-plan.md](mvp-simplification-plan.md) | 当前精简目标、范围、任务和最终门禁 |
| [decisions/0001-split-pet-and-control-windows.md](decisions/0001-split-pet-and-control-windows.md) | Electron + React 双窗口架构决策 |
| [decisions/0002-picker-only-control-surface.md](decisions/0002-picker-only-control-surface.md) | 删除 settings、只保留 picker 的二次收缩决策 |
| [project-structure.md](project-structure.md) | 当前代码 tree、双窗口、交互状态、统一宠物库和资源契约 |
| [decisions/0004-unified-user-pet-library.md](decisions/0004-unified-user-pet-library.md) | 内置与自定义资源统一进入可写用户目录 |
| [decisions/0005-lightweight-launch-at-login.md](decisions/0005-lightweight-launch-at-login.md) | picker 内的受限开机自启开关 |
| [release-smoke.md](release-smoke.md) | 自动与人工双窗口发布验收 |

五分钟启动和命令入口见 [../README.md](../README.md)。把项目交给外部模型时使用 [model-handoff.md](model-handoff.md)。

## 当前专项参考

| 文档 | 当前用途 |
| --- | --- |
| [speech-bubble-copy-guide.md](speech-bubble-copy-guide.md) | 每个角色 pet.json 的四类可编辑气泡文案 |
| [manifest-v1.md](manifest-v1.md) | 内置宠物 manifest 与 spritesheet 契约 |
| [version-and-commit.md](version-and-commit.md) | 版本、提交、双窗口检查、资源与打包边界 |
| [WORKLOG.md](WORKLOG.md) | 阶段记录；用于追溯，不替代当前结构文档 |

## 历史材料

以下文档只用于理解演进，不是当前实现规格，也不应从其中恢复功能：

| 文档 | 状态 |
| --- | --- |
| [p2-lifestyle-behavior-plan.md](p2-lifestyle-behavior-plan.md) | Superseded；旧生活行为、互动模式和调度方案 |
| [archive/](archive/) | 已归档方案与素材 |

## 当前事实

- `PetWindow` 是透明常驻桌宠窗口。
- `ControlWindow` 只承载 picker，不再存在 settings surface。
- 持久化只保留 `selectedPetId` 与直接拖拽产生的 `mascotWidthPx`。
- 核心状态为 `idle`、`running-right`、`running-left`、`waving`、`jumping`。
- 气泡只有 `welcome`、`click`、`drag`、`petSwitch`。
- 运行时只加载统一用户宠物目录；仓库 `pets/` 是首次初始化种子。

## 更新规则

- 用户可见行为或运行命令变化：更新根 `README.md`、`project-structure.md` 和相关测试说明。
- 窗口架构变化：先更新或新增 ADR，再同步 `release-smoke.md`。
- 气泡 scene、alias 或角色 JSON 变化：同步 `speech-bubble-copy-guide.md` 并运行 `npm run test:bubbles`。
- manifest、资源 allowlist 或打包变化：同步 `manifest-v1.md`、`version-and-commit.md` 和 `release-smoke.md`。
- 历史计划只允许补充状态说明；不要把历史正文重新列为当前入口。
- 只记录已落地或明确接受的决策，不把探索路线写成当前事实。
