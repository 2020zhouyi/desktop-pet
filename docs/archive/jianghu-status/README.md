# 江湖状态模块归档说明

归档日期：2026-05-27

## 状态

江湖状态功能已从运行时代码中移除，不再暴露桌面入口、Electron IPC、HTTP 接口、浏览器降级 API、React 卡片、导出逻辑、样式、校验脚本或生成图资源。

## 归档内容

- `剑三桌宠_今日状态单模块严格设计文档.docx`：原始需求文档。
- `jianghu-status-minimal-dev-plan.md`：曾用于轻量化实现的开发计划。

## 追溯

功能实现来源提交：

- `8868438 feat(daily-status): add status model and generator`
- `715c1be feat(daily-status): wire daily jianghu status ui`
- `6030c7f style(daily-status): redesign jianghu status card`
- `21fbdbd style(daily-status): match reference parchment card`
- `56bbc2a style(daily-status): use generated Cangjian card art`

本归档提交负责下线并清理上述运行时能力；如需恢复，应从以上提交或本目录文档重新评估后再独立开发。
