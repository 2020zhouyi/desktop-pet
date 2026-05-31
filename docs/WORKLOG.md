# 工作日志

## 当前收口状态

- 桌宠 MVP 当前主线是普通桌面陪伴应用：透明 Electron 悬浮窗、React sprite 渲染、生活化行为/气泡、设置持久化、宠物选择器、显式 Codex 宠物导入和本地宠物管理。
- 运行时资源边界保持收紧：应用只加载 `desktop-pet-mvp/pets/`；`~/.codex/pets` 只作为用户主动导入的来源，不自动同步、不被修改、不参与打包。
- 发布前闭环是 `npm run preflight` -> 清理当前项目 `release/` -> `npm run dist:all` -> `npm run package:verify` -> `docs/release-smoke.md` 人工冒烟。
- 版本号暂未提升，仍以 `package.json` 的 `0.1.0` 为唯一来源；后续发布用户可见新节点时再单独 bump。

## 2026-06-01

### 文档地图和项目整理

- 新增 `docs/README.md` 作为桌宠文档地图，区分 `desktop-pet-mvp`、父目录展示站点 `desktop-pet-site` 和参考快照 `petdex`，避免把不同项目线写进同一套说明。
- README 补充文档入口，保留运行、行为、资源、发布流程的总览角色；更细的行为设计、manifest、提交规范和冒烟清单通过 docs map 进入。
- 工作日志顶部补充当前收口状态，明确应用主线、资源边界、发布门禁和版本号状态，方便下一轮迭代先读现状再动手。
- 版本与提交规范补充仓库边界：桌宠核心提交在 `desktop-pet-mvp` 仓库内完成，不把父目录站点、参考快照、`release/`、`dist/` 或本地运行产物混入同一提交。

## 2026-05-31

### P3.3-P3.6 设置、选择器、manifest 与运行稳定性

- 设置浮层扩展为原生语义控件：大小、透明度、置顶、开机自启、气泡、主动提醒和互动模式继续写入轻量 JSON，不引入复杂 store。
- Electron 主进程对置顶和开机自启做 best-effort 应用；浏览器预览优先走本地 state API，失败时回落到 `localStorage`。
- 宠物选择器保留紧凑布局，新增搜索、来源/门派筛选、内置/导入标识、manifest 元信息、推荐缩放和资源健康提示。
- 新增 manifest v1 可选字段：`author`、`version`、`tags`、`faction`、`recommendedScale`、`accentColor`、`behaviorProfile`。旧 manifest 兼容；非法可选字段运行时忽略、健康检查只报 warning。
- 运行时稳定性补齐：关闭气泡和进入 sleep 会清空当前/待播气泡；删除宠物后清理 stale preview；大小设置和手动 resize 归到同一宽度设置；卸载时清理 picker close、visual inset、resize 和队列 timers。
- `preflight` 串起当前保留的设置、行为、导入、管理、健康、打包校验和构建检查。

### P4.0 首个可发布版本收口

- 发布流程收口为 `npm run preflight` -> 清理当前项目 `release/` -> `npm run dist:all` -> `npm run package:verify` -> `docs/release-smoke.md` 手动冒烟。
- README 和版本/提交规范明确哪些命令只读、哪些命令会生成安装包：`package:check` / `package:verify` 只读，`dist:all` 写入 `release/`。
- 暂不 bump `package.json` 版本号；当前版本号仍由 `package.json` 单点维护，后续如发布用户可见的 0.2.0 节点再单独处理。

### P2.9 Electron 启动冒烟清单

- 新增 `docs/release-smoke.md`，覆盖 packaged mac app 或 dev Electron 启动、透明窗口、置顶、拖拽、透明像素点击穿透、点击挥手、右键菜单、picker、默认宠物、设置读取和本地 state API。
- 冒烟保持手动 checklist：透明/置顶/点击穿透/拖拽惯性属于原生桌面窗口行为，本轮不引入脆弱的窗口自动化脚本。

### P2.8 打包产物验收

- 新增 `electron/package-verify.mjs` 和 `scripts/package-verify.mjs`，`npm run package:verify` 会发现并读取 `release/mac*/**/*.app/Contents/Resources/app.asar` 与 `release/win-unpacked/resources/app.asar`。
- 验收会复用本地 `pets/` 健康结果，并核验包内 `/pets` 存在、`/pets/*/pet.json` 数量等于本地宠物数量、每个本地 manifest 的 spritesheet 已被打包。
- 包内如出现 `_副本`/copy 副本、`.importing-*` 暂存目录、测试或临时素材命名，会作为发布阻断错误。
- 新增 `npm run test:package-verify`，用临时 fake release/app.asar 覆盖完整包通过、缺 `/pets`、manifest 数量不符、以及副本/暂存/测试素材失败；测试不读写真实 `release/` 或真实 `pets/`。

### P2.7 打包发布预检闭环

- 新增 `electron/package-health.mjs`，只读核验 `package.json` 中 electron-builder `build.files` 是否包含运行所需资源：`dist/**/*`、`electron/**/*`、`pets/**/*`、`public/**/*` 和 `package.json`。
- 新增 `scripts/package-check.mjs` 与 `npm run package:check`，在不运行 electron-builder、不生成安装包或 `release/` 产物的前提下，串起打包配置核验和项目本地 `pets/` 健康检查。
- 新增 `scripts/preflight.mjs` 与 `npm run preflight`，按顺序执行 settings、behavior、behavior queue、pet import、pet management、pet health、package health、pet check、package check 和 build，遇到首个失败立即退出并保留原命令输出。
- 新增 `npm run test:package-health`，使用临时目录覆盖缺少 `pets/**/*`、完整配置通过、以及 pet health error 使 package check 失败，不修改真实宠物资源。
- README 与版本/提交规范补充发布前可运行 `npm run preflight`，并明确 `package:check` 只是配置/资源核验，不生成安装包。

### P2.6 资源健康检查 / 打包前校验

- 新增 `electron/pet-health.mjs` 纯扫描 validator，只读取项目本地 `desktop-pet-mvp/pets/`，不读取或修改 `~/.codex/pets`。
- 新增 `scripts/pet-health.mjs` CLI 和 `npm run pet:check`，打包前可检查缺失/损坏 `pet.json`、必需字段、spritesheet 缺失、不安全路径、manifest id 重复、复制后缀目录和残留 `.importing-*` 暂存目录。
- 检查结果分为 error / warning；存在 error 时 CLI 返回非零退出码，warning-only 情况保持零退出码。
- 新增 `npm run test:pet-health`，使用临时目录覆盖资源健康检查条件，不修改真实 `pets/`。

### P2.5 行为队列和优先级最小闭环

- 新增 `src/behavior/eventQueue.ts` 纯 renderer 逻辑队列，承接 `LifestyleDecision`，不引入全局 store 或复杂状态机。
- 队列按现有 lifestyle priority 调度：点击、拖拽、切宠、导入结果等用户/强反馈可以抢占低优先级 welcome、idle、long-session 主动事件。
- 低优先级主动事件在高优先级短动作播放时进入待播或被合并；重复 `idle-timeout` / `welcome` 只保留一个待播项，避免气泡刷屏。
- React `playLifestyleEvent` 统一经过 renderer 队列；切宠成功、Codex 导入成功/失败继续强制显示反馈，但不会被 idle 立刻覆盖。
- 打开 picker、关闭气泡、手动状态按钮、缩放和组件卸载都会清理 renderer 队列/计时器，避免旧 pending proactive 事件事后播放。
- `sleep` 和主动提醒关闭仍沿用 P2 helper gate，不恢复 agent、Codex、Claude 或 task queue 联动。
- 新增 `npm run test:behavior-queue`，覆盖高低优先级抢占、低优先级延后/合并、导入/切宠反馈保护，以及 sleep/proactive disabled 边界。

## 2026-05-30

### P2.4 本地宠物管理最小闭环

- 新增 `electron/pet-management.mjs`，只识别项目本地 `pets/<folder>/`，通过 `pet.json` 的 `desktopPetMvp.imported + origin=codex-import` 标记判断导入宠物。
- P2.3 Codex 导入成功时写入轻量导入标记；没有可靠标记的现有本地宠物默认按内置资源保护，避免误删基础/JX3 资源。
- Electron IPC/preload、本地 HTTP API 和 React `desktopPetApi` 增加本地宠物管理列表与删除方法；删除只会移除 `desktop-pet-mvp/pets/<folder>`，不会触碰 `~/.codex/pets`。
- 删除当前选中导入宠物后主进程重新 `loadPets()`，优先选择原列表中的下一个宠物，否则回到默认宠物。
- 宠物选择器新增极简“本地管理”区，显示当前宠物“内置/导入”，导入宠物才显示删除按钮，并用二次点击确认和行内消息反馈结果。
- 新增 `npm run test:pet-management`，覆盖导入标记识别、内置保护、导入宠物删除、缺失/非法目录安全失败和目标根外路径不被删除。

### P2.3 Codex 宠物显式导入桥

- 新增 `electron/pet-importer.mjs`，从 `~/.codex/pets/<pet-id>/` 列出候选并校验 `pet.json`、manifest 基本字段和 spritesheet 文件。
- 导入采用显式复制：合法宠物复制到项目本地 `pets/<pet-id>/`，不会启动自动同步，不会修改或删除 `~/.codex/pets` 内容。
- 同名本地目录或相同 manifest id 都视为冲突并返回清晰状态，保守不覆盖、不重复导入已有本地宠物；缺 manifest、manifest 字段不完整、spritesheet 缺失都会标记不可导入。
- Electron IPC/preload、本地 HTTP API 和 React `desktopPetApi` 增加 Codex 导入方法；导入成功后主进程重新扫描本地 `pets/` 并选中新宠物。
- 宠物选择器新增最小 Codex 导入区，可刷新候选、看到可导入/已有/不可用状态并触发导入；成功/失败复用现有 `importSuccess` / `importFail` 行为气泡事件。
- 新增 `npm run test:pet-import`，覆盖合法导入、常见 spritesheet fallback、缺 manifest、spritesheet 缺失和冲突不覆盖。

### P2.2 最小设置控制闭环

- 扩展轻量 settings store，继续保存 `interactionMode`，新增 `speechBubblesEnabled` 和 `proactiveEventsEnabled`，默认都为 `true`。
- Electron settings store、preload/IPC 类型面、React API fallback 和浏览器 `localStorage` 预览都支持同一份设置形状；缺字段、损坏 JSON 和非法类型都会回退默认，非法 patch 不覆盖已有合法设置。
- React 控制条新增小型“设置”浮层，使用原生 button/checkbox 控制气泡、主动提醒，并提供睡觉/唤醒入口。
- `speechBubblesEnabled=false` 时不渲染 speech bubble；点击、拖拽、切宠等动画仍会即时执行。
- `proactiveEventsEnabled=false` 时不安排 welcome、idle timeout、long-session 等主动事件；睡眠模式仍通过 `interactionMode=sleep` 关闭主动事件，用户直接操作仍反馈。
- 行为测试补充气泡隐藏 helper 和主动事件调度 helper；settings 测试补充新增默认字段、布尔 patch 和非法 patch 保护。

### P2.1 互动模式持久化

- 新增 Electron 主进程侧轻量 settings store，使用 app `userData` 下的 `desktop-pet-settings.json` 保存 `interactionMode`。
- 暴露 `settings:get` / `settings:update` IPC，并通过 preload 提供 `desktopPet.getSettings()` / `desktopPet.updateSettings(patch)`。
- React 启动时读取设置并恢复“清静 / 日常 / 活泼 / 睡觉”互动模式；切换按钮采用本地乐观更新，写入失败不会导致 UI 崩溃。
- 独立浏览器预览增加 `localStorage` fallback，方便在非 Electron 预览中验证模式持久化。
- 新增 `npm run test:settings`，覆盖默认值、非法模式、损坏 JSON 和合法 patch 更新。

### P2 剑三主题生活行为内核

- 新增 `src/behavior/lifestyle.ts` 纯规则层，把欢迎、点击、拖拽、切宠、idle、长会话、导入结果和睡眠/唤醒统一建模为 `PetEvent -> LifestyleDecision`。
- 新增 `quiet`、`standard`、`lively`、`sleep` 四种互动模式；睡眠模式会跳过欢迎、idle、长会话等主动事件，直接点击/拖拽/切宠仍即时反馈。
- 内置七秀、万花、纯阳、五毒、丐帮、凌雪阁、北天药宗和 fallback profile，idle timeout 按模式与门派倾向选择 `idle`、`waiting` 或第 8 行观察动作。
- 扩展气泡场景到欢迎、早安、晚间、点击、拖拽、长会话、切宠、导入成功/失败、睡眠、唤醒，并保留场景级冷却避免刷屏。
- React 控制条增加互动模式循环按钮；状态展示改为生活化标签，第 8 行显示为“观察”。
- 新增 `npm run test:behavior`，用无依赖 Node TypeScript strip 模式验证规则层。

## 2026-05-27

### 江湖状态模块归档移除

- 按用户要求下线“江湖状态 / 今日状态”功能，不再保留运行时入口。
- 移除 React 状态卡、Electron IPC/HTTP 接口、本地缓存生成器、导出逻辑、样式、图片资源和校验脚本。
- 恢复桌宠窗口尺寸计算为基础气泡/宠物模式，右键菜单不再展示江湖状态入口。
- 原始需求与轻量化开发计划已归档到 `docs/archive/jianghu-status/`，保留可追溯来源。
- 风险：后续如果需要恢复该能力，应重新从归档文档立项，避免直接混入当前桌宠核心交互。

## 2026-05-20

### P0 行为系统

- 新增 Electron 主进程行为控制器，统一处理外部 API、菜单和脚本触发的宠物状态。
- 行为控制器支持状态优先级、短冷却、最多 4 个待播动作队列、定时动作自动回到 `idle`。
- 明确状态语义：点击/唤醒用 `waving`，切换成功用 `jumping`，等待/歇脚用 `waiting`，第 8 行用于观察/探头/好奇，失败反馈用 `failed`。
- 调整 `/state` API：未传 `durationMs` 时由行为系统按状态语义决定一次性播放或循环。
- 增加 `pet:jump`、`pet:wait`、`pet:observe`、`pet:fail` 脚本，方便调试所有核心状态。

### 项目目标

构建一个可继续迭代的桌宠 MVP，参考 Codex pet 的技术方式和交互体验，但保持项目独立、结构清晰、方便后续替换宠物模型与扩展行为。

### 调研结论

- `crafter-station/petdex` 的实现方向不是 Electron，它更偏向 Zig + native 窗口技术栈。
- Codex desktop app 本体是 Electron，pet 渲染采用透明悬浮窗口 + CSS spritesheet，而不是 GIF、Canvas 或 Lottie。
- Codex-compatible pet atlas 采用 `8 x 9` 网格，单帧 `192 x 208`，CSS 使用 `background-size: 800% 900%` 和 `background-position` 切帧。
- Codex pet 的拖拽交互会采样释放速度，松手后把惯性移动交给宿主窗口层处理。
- 点击穿透需要区分透明像素和角色可见像素，不能只按矩形窗口命中。

### 已完成实现

- 初始化 Electron + React + TypeScript + Vite 桌宠 MVP。
- 实现透明、置顶、无边框 Electron 窗口。
- 实现 CSS sprite atlas 渲染，支持 idle、running-left、running-right、waving、jumping、failed、waiting、running 和第 8 行观察状态。
- idle 动画按 Codex 方式放慢处理；左右跑步支持连续循环。
- 实现角色拖拽、拖拽方向动画、点击挥手、右键菜单、缩放手柄。
- 实现主进程窗口拖拽和松手惯性移动。
- 实现 alpha 像素命中检测：透明区域点击穿透，角色可见区域才响应。
- 根据所有动画帧 alpha 边界计算可视 insets，让角色拖到屏幕边缘时更贴近可见轮廓。
- 宠物资源已迁移到项目内 `pets/`，运行时只扫描本地项目资源。
- 实现宠物切换器：右键 `Choose pet...` 打开，带缩略图、搜索、选中态和切换动效。
- 打开切换器时临时扩大透明窗口，关闭后收回到桌宠尺寸。
- 增加本地状态 API 和脚本：`npm run pet:wave`、`npm run pet:run`、`npm run pet:idle`。

### 当前项目状态

- 开发启动命令：`npm run dev`
- 构建检查命令：`npm run build`
- 本地预览地址：`http://127.0.0.1:5173/`
- 状态 API：`http://127.0.0.1:7777`
- 浏览器预览切换器：`http://127.0.0.1:5173/?picker=1`

### 待办建议

- 增加宠物包导入/安装界面，避免手动复制到目录。
- 为宠物 manifest 增加作者、版本、标签、推荐缩放比例等元信息。
- 增加行为状态队列，例如等待、思考、失败、庆祝等上下文触发。
- 增加自动化测试，覆盖 atlas 时序、manifest 解析和主进程 IPC。
- 打包 macOS 应用，并加入首次启动引导和权限说明。
