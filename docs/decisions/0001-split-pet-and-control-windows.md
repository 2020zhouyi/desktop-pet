# ADR-0001：保留 Electron + React，并拆分桌宠窗与控制窗

## 状态

Accepted；ControlWindow 职责由 ADR-0002 进一步收缩

## 日期

2026-07-10

## 背景

当前应用把透明桌宠、设置、picker、提醒、导入管理、主动行为和 HTTP API
集中在一个 React 页面与一个 Electron main 文件中。打开 picker/settings 时需要扩大、
移动并恢复透明窗口，导致窗口几何、焦点、鼠标穿透和 UI 状态相互耦合。

精简目标不是重新发明桌宠运行时，而是保留已经验证的透明窗口、spritesheet、
打包和跨平台基础，删除非核心能力并缩小维护面。

## 决策

继续使用 Electron、React、TypeScript 和 Vite，不增加依赖。应用改为两个
BrowserWindow：

- `petWindow`：透明、置顶、无边框、常驻，只显示宠物和基础气泡。
- `controlWindow`：普通可聚焦窗口，按需显示宠物选择器或四项设置。

主进程拥有窗口生命周期、四字段 settings 和只读内置宠物仓库。renderer 只通过
preload IPC 访问这些能力。删除本地 HTTP server、token、Codex 导入、本地删除、
JX3 reminders 和主动行为队列。

PetWindow 使用四态纯状态机：`idle`、`dragging`、`waving`、`jumping`。
现有 8×9 atlas 继续兼容，但核心运行时不再为所有历史状态建立产品行为。

## 备选方案

### 继续使用单一透明窗口

优点是改动较小。缺点是 picker/settings 仍会改变透明窗尺寸、位置、焦点和穿透，
无法从根本上去掉当前最复杂的窗口几何代码，因此不采用。

### Electron + 原生 TypeScript DOM

可以减少 React 概念，但 Electron/Chromium 仍决定主要包体；同时需要重写现有 UI，
收益不足以抵消迁移成本，因此暂不采用。

### Tauri + Web UI

通常能缩小安装包和内存，但会引入 Rust、插件和新的 macOS/Windows 透明窗口验证。
当前主要问题是功能耦合，不是 Electron 无法满足需求。待精简后若实际包体或内存仍
不达标，再单独做技术验证。

### macOS 原生 AppKit

窗口和资源占用最优，但会放弃当前 Windows 路线或形成双代码库，只适合未来明确
转为 macOS 单平台时采用。

## 结果

正面影响：

- 透明窗口不再承载管理面板，窗口几何和穿透逻辑显著收缩。
- picker/settings 具备正常的焦点、键盘和可访问性语义。
- 去掉 HTTP 后减少安全面、固定端口冲突和 smoke 假阳性。
- 不迁移技术栈，保留现有资产、打包脚本和团队知识。

代价：

- Electron 包体不会因为删 React 功能而大幅下降。
- 需要管理两个窗口和 surface 级 IPC 权限。
- 双窗口迁移前需要先切除与 overlay 耦合的旧功能。

## 验证要求

- 打开或关闭 controlWindow 不改变 petWindow bounds。
- controlWindow 关闭后 petWindow 继续运行。
- renderer 未加载时 Electron smoke 必须失败。
- 不同 surface 不能调用不属于自身的窗口操作。
- 最终运行时不监听 HTTP 端口。
