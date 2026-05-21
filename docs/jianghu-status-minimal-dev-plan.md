# 江湖状态极简功能框架开发文档

来源文档：`docs/剑三桌宠_今日状态单模块严格设计文档.docx`

更新时间：2026-05-21

适用仓库：`desktop-pet-mvp/`

目标：从原需求中抽取一个独立、可落地、可回溯的“江湖状态”最小功能模块。该模块只负责每日生成、展示、缓存和导出一张门派动物状态卡，不承接养成、提醒、Agent 状态或在线生成器能力。

## 1. 极简定义

江湖状态不是运势系统，而是“每日门派动物状态卡”。

用户每天第一次打开桌宠时，系统基于 `date + petId + menpai + skinVersion` 生成一张当天固定的小卡。卡片展示门派动物徽章、状态标题、一句解释、三项轻参数、今日宜/避和一句小宠气泡。当天重复打开不重新生成；用户可手动再次查看；分享只导出卡片本身，不截桌面。

## 2. 模块边界

### 2.1 做

- 每日确定性生成：同一天、同宠物、同门派、同皮肤版本结果一致。
- 本地缓存：保存当天状态、是否看过、是否关闭过。
- 最小门派数据：首版支持 20 门派，但每门派只保留 3 个标题、6 句气泡、1 套配色、1 个动物字形或简化徽章。
- 最小 UI：桌宠旁展示小纸卡，支持关闭、再次查看、导出 PNG。
- 最小动画：复用现有 `review`、`waiting`、`waving`、`jumping`、`idle` 状态，不新增 spritesheet 行。
- 合规边界：不使用官方 Logo、官方技能图标、官方立绘、官方 UI 截图。

### 2.2 不做

- 不做真实运势、掉落预测、职业强弱排行。
- 不做任务提醒、开团提醒、Agent 状态。
- 不做复杂养成、签到、积分、连续天数奖励。
- 不做云端同步和在线生成器。
- 不做大规模逐帧美术资产生产。

## 3. 需求追踪表

| ID | 需求 | 验收方式 |
| --- | --- | --- |
| JS-REQ-001 | 每日状态由 `date:petId:menpai:skinVersion` 生成，当天稳定 | 单元测试固定 seed，两次结果深度相等 |
| JS-REQ-002 | 首次打开当天自动展示，8 秒后收起 | 手测或组件测试确认 `autoShow` 和计时关闭 |
| JS-REQ-003 | 用户关闭后当天不再自动弹出 | 缓存 `dismissedAt` 后重启验证 |
| JS-REQ-004 | 右键菜单或悬浮按钮可再次查看 | 手测菜单/按钮打开卡片 |
| JS-REQ-005 | 切换宠物/门派后生成对应门派状态 | 固定 petId + menpai 测试 |
| JS-REQ-006 | 分享 PNG 只包含卡片，不包含桌面背景 | 导出 canvas 快照检查背景透明或纸色 |
| JS-REQ-007 | reduced motion 下不播放跳动动画 | 浏览器模拟 `prefers-reduced-motion` 验证 |
| JS-REQ-008 | 卡片正文总字数不超过 90 汉字 | 数据校验脚本或单元测试 |
| JS-REQ-009 | 不引用官方素材 | PR checklist 人工确认资源来源 |

## 4. 数据模型

新增共享类型文件：

`src/daily-status/types.ts`

```ts
export type MenpaiId =
  | "duanshi"
  | "wanling"
  | "daozong"
  | "beitian-yaozong"
  | "yantian"
  | "lingxue"
  | "penglai"
  | "badao"
  | "changge"
  | "cangyun"
  | "gaibang"
  | "mingjiao"
  | "tangmen"
  | "wudu"
  | "cangjian"
  | "tiance"
  | "chunyang"
  | "shaolin"
  | "qixiu"
  | "wanhua";

export type DailyStatusMetrics = {
  momentum: number;
  heart: number;
  social: number;
};

export type DailyStatusSkin = {
  skinId: string;
  skinVersion: string;
  menpai: MenpaiId;
  displayName: string;
  animalAnchor: string;
  glyph: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    paper: string;
    ink: string;
  };
  motifs: string[];
  titlePool: string[];
  linePool: string[];
  goodForPool: string[];
  avoidPool: string[];
};

export type DailyJianghuStatus = {
  date: string;
  petId: string;
  menpai: MenpaiId;
  skinId: string;
  skinVersion: string;
  animalAnchor: string;
  glyph: string;
  title: string;
  summary: string;
  metrics: DailyStatusMetrics;
  goodFor: string[];
  avoid: string[];
  petLine: string;
  actionId: "daily.reveal.generic";
};

export type DailyStatusCacheRecord = {
  status: DailyJianghuStatus;
  seenAt: string | null;
  dismissedAt: string | null;
};
```

## 5. 文件结构

首版只新增模块目录，不打散现有 `src/App.tsx` 之外的行为。

```txt
desktop-pet-mvp/
  src/
    daily-status/
      types.ts
      skins.ts
      generator.ts
      cache.ts
      DailyStatusCard.tsx
      DailyStatusShareCanvas.ts
      index.ts
  electron/
    daily-status-store.mjs
  docs/
    jianghu-status-minimal-dev-plan.md
```

说明：

- `skins.ts` 保存 20 门派轻量数据。首版允许用 glyph 文本徽章代替 SVG。
- `generator.ts` 只做纯函数生成，不访问 Electron、不读写文件。
- `cache.ts` 封装渲染端 fallback localStorage 逻辑，便于浏览器预览。
- `electron/daily-status-store.mjs` 负责正式 Electron 环境的本地 JSON 存储。
- `DailyStatusCard.tsx` 只接收 props，不直接生成状态。

## 6. 生成规则

### 6.1 Seed

```ts
const seedInput = `${date}:${petId}:${menpai}:${skinVersion}`;
```

使用稳定 hash 函数生成伪随机数。禁止使用 `Math.random()` 生成最终状态。

推荐实现：

- `hashStringToUint32(input: string): number`
- `createSeededRandom(seed: number): () => number`
- `pickBySeed<T>(items: T[], random: () => number): T`

### 6.2 结果规则

- `title`：从当前门派 `titlePool` 选 1 个。
- `petLine`：从当前门派 `linePool` 选 1 个。
- `goodFor`：从 `goodForPool` 选 2 个，最多 3 个。
- `avoid`：从 `avoidPool` 选 1 个，最多 2 个。
- `metrics.momentum/heart/social`：生成 35-95 的整数，避免负面化。
- `summary`：首版使用通用模板，不做复杂文案系统。

示例 summary 模板：

```ts
const summaries = [
  "今天适合慢一点，但别忘了出手。",
  "小宠状态正好，适合轻轻开工。",
  "江湖风向不错，先把心气稳住。",
];
```

## 7. 缓存规则

缓存 key：

```txt
daily-status:v1:{date}:{petId}:{menpai}:{skinVersion}
```

缓存位置：

- Electron：`app.getPath("userData")/daily-status-cache.json`
- 浏览器预览：`localStorage`

缓存记录：

```json
{
  "status": {},
  "seenAt": "2026-05-21T09:00:00.000+08:00",
  "dismissedAt": null
}
```

行为：

- 缓存不存在：生成，保存，首次展示。
- 缓存存在且 `dismissedAt === null`、`seenAt === null`：允许自动展示。
- 缓存存在且 `dismissedAt !== null`：不再自动展示，但允许手动查看。
- 日期变化：生成新记录，不删除旧记录；后续可按保留 14 天清理。

## 8. UI 结构

桌面卡只展示 7 个块：

1. 门派动物徽章：`glyph + animalAnchor`
2. 状态标题
3. 一句状态解释
4. 三项轻参数：动势 / 心气 / 亲友缘
5. 今日宜：2-3 个 chip
6. 今日避：1-2 个 chip
7. 小宠气泡

尺寸建议：

- 桌面卡：`344px x auto`，最大高度不超过 `432px`
- 圆角：`16px`
- 背景：纸色 `#F6F1E6` 或门派 `paper`
- 动物徽章面积：不超过卡片面积 20%

首版交互：

- 自动展示：8 秒后收起。
- 关闭：当天不再自动弹。
- 再看：从角标或菜单打开。
- 分享：生成 `900x900` PNG，二期再加 `1080x1440`。

## 9. Electron/API 接入

扩展 `DesktopPetApi`：

```ts
getDailyStatus(payload: {
  date: string;
  petId: string;
  menpai: MenpaiId;
}): Promise<DailyStatusCacheRecord>;

dismissDailyStatus(payload: {
  cacheKey: string;
  dismissedAt: string;
}): Promise<void>;
```

主进程 IPC：

```txt
daily-status:get
daily-status:dismiss
daily-status:mark-seen
```

HTTP 预览 API：

```txt
GET  /daily-status?date=2026-05-21&petId=project%3Ajx3-u7eaf-u9633-01&menpai=chunyang
POST /daily-status/dismiss
POST /daily-status/seen
```

首版门派推断：

- 优先从宠物 `pet.json` 的扩展字段读取：`menpai`
- 如果不存在，则用 folder 名或 displayName 映射。
- 无法识别时使用默认 `qixiu`，但在开发日志中记录后续补全。

## 10. 动画接入

不新增状态枚举。使用现有状态：

```txt
review 700ms -> jumping 或 waving 900ms -> show card 8000ms -> idle
```

按状态类别映射：

| 类别 | 使用状态 |
| --- | --- |
| 伏眠 | `waiting` |
| 巡游 | `running` |
| 鸣响 | `waving` |
| 守护 | `review` |
| 灵光 | `jumping` |

首版可以统一使用：

```ts
await desktopPetApi.setState("review", 700);
await desktopPetApi.setState("jumping", 900);
showDailyStatusCard();
```

reduced motion 下跳过 `jumping`，直接显示卡片。

## 11. 测试计划

必测命令：

```bash
npm run build
```

建议新增测试：

```txt
src/daily-status/generator.test.ts
```

测试用例：

- 同 seed 结果一致。
- 不同日期结果允许变化。
- 所有 20 门派都有 skin。
- 每个 skin 至少 3 个 title、6 个 line、3 个 goodFor、2 个 avoid。
- metrics 范围在 35-95。
- 卡片文字总量不超过 90 汉字。
- 官方禁用词检查：`Logo`、`技能图标`、`必出`、`强度排行` 不出现在池子中。

手测清单：

- 首次启动自动展示。
- 8 秒自动收起。
- 关闭后重启当天不自动展示。
- 手动再次查看正常。
- 切换宠物后状态更新。
- 分享 PNG 不包含桌面内容。
- reduced motion 下无跳动动画。

## 12. Git 版本管理与可回溯要求

当前 `desktop-pet-mvp` 已有 Git 历史，但工作树存在未提交修改。开发前必须先做状态记录，不能混入不明来源改动。

### 12.1 开始前

```bash
cd desktop-pet-mvp
git status --short --branch
git diff --stat
```

如果当前修改不是本功能产生，先做一个基线提交或请负责人确认归属。推荐流程：

```bash
git switch -c codex/daily-jianghu-status
git add docs/剑三桌宠_今日状态单模块严格设计文档.docx docs/jianghu-status-minimal-dev-plan.md
git commit -m "docs: define minimal jianghu status module"
```

### 12.2 提交粒度

每个提交只对应一个可验证阶段：

```txt
docs: define minimal jianghu status module
feat(daily-status): add skin data and shared types
feat(daily-status): add deterministic generator
feat(daily-status): add local cache store
feat(daily-status): expose electron daily status api
feat(daily-status): render desktop status card
feat(daily-status): add card png export
test(daily-status): cover generator and data completeness
```

禁止把 UI、缓存、主进程 API、测试混成一个大提交。

### 12.3 回溯字段

每个 PR 或提交说明必须包含：

```txt
Requirement: JS-REQ-001, JS-REQ-002
Source: docs/剑三桌宠_今日状态单模块严格设计文档.docx
Dev doc: docs/jianghu-status-minimal-dev-plan.md
Validation: npm run build
```

### 12.4 标签

首版验收通过后打标签：

```bash
git tag daily-status-mvp-v0.1
```

若后续调整数据池或 UI，使用递增标签：

```txt
daily-status-mvp-v0.2
daily-status-mvp-v0.3
```

### 12.5 回滚策略

由于功能独立，回滚应优先 revert 本模块提交：

```bash
git revert <commit-sha>
```

不得使用 `git reset --hard` 清除他人工作。若需要临时关闭功能，增加 feature flag：

```ts
const dailyStatusEnabled = import.meta.env.VITE_DAILY_STATUS_ENABLED !== "0";
```

## 13. 执行顺序

1. 建立基线：确认当前工作树归属，创建 `codex/daily-jianghu-status` 分支。
2. 落数据：实现 `types.ts`、`skins.ts`，先用 glyph 徽章。
3. 落生成器：实现稳定 hash、选择器、metrics、summary。
4. 落缓存：先浏览器 localStorage，再 Electron JSON store。
5. 接 API：扩展 preload、main、renderer API。
6. 接 UI：在 `App.tsx` 挂载 `DailyStatusCard`，不重构现有宠物选择器。
7. 接动画：复用 `review -> jumping/waving -> idle`。
8. 接导出：canvas 生成 `900x900` PNG。
9. 补测试：generator、skin 完整性、禁用词。
10. 验收：执行 `npm run build`，完成手测清单，打 tag。

## 14. 最小验收定义

满足以下条件即可算 MVP 完成：

- 20 门派均可生成一张状态卡。
- 同一天同宠物同门派状态稳定。
- 首次展示、关闭、再次查看可用。
- 关闭后当天不再自动弹。
- 卡片能导出纯 PNG。
- `npm run build` 通过。
- Git 历史中能从提交信息追溯到 `JS-REQ-*`、来源文档和验证命令。
