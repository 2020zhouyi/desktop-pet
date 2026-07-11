# ADR-0002：ControlWindow 只保留宠物选择器

## 状态

Amended by ADR-0003

## 日期

2026-07-11

## 背景

ADR-0001 将透明桌宠与普通控制窗拆开，但控制窗仍同时承载大小、透明度、置顶设置和宠物选择。对于当前 MVP，这些设置没有形成独立价值，反而继续扩大 renderer 状态、IPC、持久化契约、菜单入口和发布验证范围。

用户明确要求只保留宠物选择，因此控制窗不再需要 panel 切换能力。

## 决策

- `ControlWindow` 只接受 `?surface=control&panel=picker`。
- 删除 settings 页面、公开 settings IPC、renderer settings hook、大小调整把手和可变透明度/置顶状态。
- 桌宠固定使用 120px 宽度、100% 不透明度和始终置顶。
- 桌宠主窗口始终使用透明、无阴影的固定尺寸窗口，不再保留可切换为不透明矩形的调试分支。
- 只持久化 `selectedPetId`。为保留旧用户选择，内部继续读取旧文件名 `desktop-pet-settings.json`，下一次选宠时只写回该单字段。
- picker 保留“卡片预览，再确认切换”的两阶段交互。

## 备选方案

### 只隐藏设置入口，保留 settings API

改动较小，但会留下不可达 UI、公开 IPC 和四字段契约，未来维护者仍会误以为这些能力受支持，因此不采用。

### 保留大小拖拽把手

可以提供轻量自定义，但它仍需要 renderer 状态、窗口 resize IPC 和持久化。当前目标是单一选择任务，因此一并删除。

## 结果

- 控制窗只有一条用户路径，菜单、surface 路由和 capability allowlist 更小。
- 用户无法调整大小、透明度或置顶；如未来恢复，应重新立项并新增 ADR，而不是重新暴露旧 settings 代码。
- 旧选宠结果不会因本次精简丢失。

## 验证要求

- settings surface 与 settings IPC 必须被拒绝。
- 右键菜单和托盘只提供选择宠物、唤醒与退出等必要操作。
- 真实 Electron smoke 必须点击宠物卡片和确认按钮，并在重启后恢复选中宠物。
- 打开或关闭 picker 不改变 `PetWindow` bounds。
