# ADR-0005：选择窗口内提供轻量开机自启

## 状态

Accepted

## 日期

2026-07-12

## 背景

ControlWindow 已收缩为宠物选择器，不应恢复完整设置页面；但开机自启是桌面常驻应用的独立生命周期能力，适合作为一个轻量开关保留。

## 决策

- 在选择窗口标题操作区增加“开机自启”checkbox，不新增 settings surface。
- 选项持久化到现有 `desktop-pet-settings.json` 的 `launchAtLogin` 字段。
- 仅 ControlWindow 可以调用 `app:launch-at-login-get/set` IPC。
- 打包版通过 Electron `app.setLoginItemSettings` 写入系统登录项。
- 开发模式保存和展示状态，但不把 Electron 开发进程注册为登录项。

## 验证

- selection store 测试覆盖默认值、旧配置读取、写入和并发队列。
- IPC capability 测试确保 PetWindow 无法修改登录项。
- picker 契约与 Electron smoke 验证 checkbox 存在。
