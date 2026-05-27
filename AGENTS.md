# Project Agent Guide

本文件只放项目级入口规则。不要把详细流程、提交模板、打包清单直接堆在这里；需要时按触发条件打开对应文档。

## Always

- 开始修改前先看 `git status --short`，确认当前工作区里哪些改动不是本轮产生的。
- 不要回滚或覆盖未归属改动，除非用户明确要求。
- 运行时产物、安装包、日志和本地配置不进入 git。

## Triggered References

- 涉及版本号、发版、打包、安装包、资源清理或提交时，先阅读：[版本与提交规范](docs/version-and-commit.md)。
- 涉及阶段计划、功能取舍或设计决策时，优先查看并更新：[工作日志](docs/WORKLOG.md)。

## Before Commit

只有在用户明确要求提交、打包发布、整理版本，或当前任务自然需要落 commit 时，才进入提交流程。进入提交流程后按 [版本与提交规范](docs/version-and-commit.md) 执行。

## Project Shape

- Electron 主进程：`electron/`
- React 渲染层：`src/`
- 本地宠物资源：`pets/`
- 项目文档：`docs/`
