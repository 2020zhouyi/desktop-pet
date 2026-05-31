# P2 剑三主题生活行为内核计划

## 目标

P2 MVP 将桌宠从 agent 联动转成普通电脑用户可用的生活节奏编排。桌宠只响应本地 UI 交互和轻量时间事件，不读取 Codex、Claude、agent、任务队列或外部工作状态。

本阶段继续复用现有 atlas 行和底层 `PetState`，但用户可见语义改为生活化表达：`review` 行只表示观察、探头、好奇，不展示工作流含义。

## 不做的事

- 不接入 Codex、Claude 或任何 agent 状态。
- 不恢复“江湖状态 / 今日状态”卡片模块。
- 不新增大型依赖，不新增后台任务编排器。
- 不改变宠物资源加载边界，仍只由 `desktop-pet-mvp` 自身加载本地宠物。

## 事件模型

规则层接收 `PetEvent`，输出 `LifestyleDecision`：

- `welcome`：启动或切宠后欢迎，按时间可转成早安或晚间气泡。
- `pet-clicked`：用户点击宠物，立即挥手并显示点击气泡。
- `pet-dragged`：用户拖拽宠物，显示拖拽气泡；跑动方向仍由 UI 根据指针方向即时处理。
- `pet-switched`：切换宠物成功后跳跃并显示切宠气泡。
- `idle-timeout`：用户一段时间未互动时，按互动模式和门派 profile 选择 `waiting`、第 8 行观察动作或 `idle`。
- `long-session`：长时间使用电脑后的低频提醒。
- `import-finished`：预留给未来导入功能，成功/失败分别映射到 `importSuccess` / `importFail`。
- `sleep` / `wake`：进入或唤醒睡眠模式的轻量反馈。

## 互动模式

- `quiet`：更少主动打扰，idle 多回到 `idle`，长会话提醒间隔更长。
- `standard`：默认生活节奏，少量 idle 探头或歇脚。
- `lively`：更活跃，idle 更容易进入观察或等待动作。
- `sleep`：禁止欢迎、idle、长会话等主动事件；用户直接点击、拖拽、切宠仍可以即时反馈。

P2.1 已将互动模式做成最小设置持久化；P2.2 在同一份设置里补齐“不烦”控制：

```json
{
  "interactionMode": "standard",
  "speechBubblesEnabled": true,
  "proactiveEventsEnabled": true
}
```

Electron 通过 app `userData` 下的 `desktop-pet-settings.json` 保存设置；文件缺失、损坏 JSON、缺字段或非法类型都会安全回退默认值，不阻塞桌宠启动。浏览器独立预览使用同形状的 `localStorage` fallback。非法 patch 会逐字段忽略，不覆盖已有合法设置。

控制条保留互动模式循环按钮，并新增一个小型“设置”浮层：`speechBubblesEnabled=false` 时不显示任何 speech bubble，但点击、拖拽、切宠等动画仍可发生；`proactiveEventsEnabled=false` 时不安排 welcome、idle timeout、long-session 等主动事件；睡眠模式仍通过 `interactionMode=sleep` 进入或唤醒。

## 门派 Profile

P2 至少内置七秀、万花、纯阳、五毒、丐帮、凌雪阁、北天药宗，以及 fallback。Profile 只决定生活化倾向，不代表外部状态。

- 七秀：偏轻盈探头，活泼时歇脚整理。
- 万花：偏观察问诊，长会话提醒更温和。
- 纯阳：偏安静入定，活泼时探头。
- 五毒：偏陪伴等待，活泼时好奇观察。
- 丐帮：偏热闹歇脚，活泼时探头。
- 凌雪阁：偏低调观察，活泼时短暂停留。
- 北天药宗：偏温和提醒，活泼时观察药炉。
- fallback：保守等待或 idle。

## 优先级

直接交互优先于主动事件：

1. 导入失败、切宠、点击、唤醒等即时事件。
2. 长会话低频提醒。
3. idle timeout。
4. welcome / morning / evening 气泡。
5. sleep 模式下的主动事件全部跳过。

## 气泡场景

P2 使用这些气泡场景：`welcome`、`idle`、`click`、`drag`、`morning`、`evening`、`longSession`、`petSwitch`、`importSuccess`、`importFail`、`sleep`、`wake`。UI 侧仍保留场景级冷却，避免频繁刷屏。

## 验收方式

- 纯逻辑测试覆盖点击、切宠、idle、长会话、sleep 模式、门派识别、气泡场景、气泡隐藏和主动事件调度开关。
- settings store 测试覆盖默认值、新增布尔字段、非法 mode、损坏 JSON、合法 patch 更新和非法 patch 保护。
- `npm run test:behavior` 通过。
- `npm run test:settings` 通过。
- `npm run build` 通过。
- 桌宠控制条能循环切换并持久化 `quiet` / `standard` / `lively` / `sleep`。
- 用户可见文案只把第 8 行表达为观察、探头或好奇。
