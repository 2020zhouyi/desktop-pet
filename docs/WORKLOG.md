# 工作日志

## 当前收口状态

- 当前公开发布主线仍是精简后的 Electron 双窗口；Windows Rust/Win32 完整候选已经实现，并完成 ARM64 来宾中的 x64 单屏早期验收，但登录自启复测、混合 DPI/多屏、真实 x64 和发布资产切换仍待发布前完成，因此保留 Electron Windows ZIP 作为回滚真相。
- 两条实现都保持透明 `PetWindow`、picker-only 控制窗、四态直接交互、四类气泡、25 个离线宠物和同一三字段设置契约。
- 运行时只读统一用户宠物目录：Electron 使用 `userData/pets/`，原生 Windows 使用 `%LOCALAPPDATA%/DesktopPet/pets/`；发布种子只消费一次。
- Electron 发布闭环仍是 `npm run release:gate` -> `docs/release-smoke.md`；原生 Windows 使用 Rust workspace 门禁、`native/scripts/package-windows.ps1`、隔离运行证据脚本和 `docs/windows-native-migration.md`。
- 当前发布版本以 `package.json` 的 `0.1.3` 为唯一来源。

## 2026-07-16

### Windows 原生完整候选（代码与 ARM64 早期验收收口）

- 新增 `native/desktop-pet-core` Rust workspace，把精简版状态机、8×9 动画时间线、拖拽/DPI 几何与 84–228px / 12px 分档缩放从平台窗口代码中抽为共享核心。
- P0 删除重复的几何模块并直接依赖共享核心；idle atlas 解码也改为读取共享动画时间线，避免原型与生产迁移各维护一套持续时间。
- 共享核心新增 Manifest v1、安全相对资源路径和旧 `desktop-pet-settings.json` 三字段兼容层；非法旧字段仍会在写回时被过滤。
- 新增现有资源契约门禁：仓库 25 个宠物必须全部被原生 manifest 解析接受、spritesheet 路径安全且四类气泡均非空。
- 四类气泡的 manifest 优先级、generic fallback、清静/日常/活泼节奏、近期文案去重和 cooldown 倍率已迁入共享核心；当前 25 个角色继续直接读取各自 `pet.json.bubbleLines`。
- 新增生产 `desktop-pet-app` 宿主层：负责统一用户宠物库、`project:*` 旧选择迁移、失效选择回退和三字段事务写回；坏设置或坏自定义宠物不会阻塞其余角色启动。
- 首次原生启动会从 `%APPDATA%/desktop-pet-mvp` 合并复制现有 Electron 设置、自定义宠物和种子标记到 `%LOCALAPPDATA%/DesktopPet`；原生已有内容优先，旧目录不删除，保证切换后状态延续且 Electron 可回滚。
- 原生打包态改为消费式 `pets-seed`：优先移动，失败后 staging 复制，清理只做 best effort；已有同名用户目录不覆盖，玩家之后删除的内置角色不会恢复。核心与应用测试覆盖首次消费、冲突、重复启动和只读源回退。
- 新增 `desktop-pet-render`，原生解码全部 25 个 1536×1872 WebP 图集，并保持自定义 PNG/SVG 图集兼容；按现有四态时间线渲染、缓存缩放帧并用当前帧 alpha 做命中。
- 生产 Win32 宿主已实现 layered `PetWindow`、独立 click-through 气泡 HWND、Per-Monitor V2 DPI、捕获式拖拽、直接缩放、单实例 mutex、HKCU `Run` 自启、托盘和 `%LOCALAPPDATA%` 事件日志。
- 新增完全原生 `PickerWindow`，包含搜索、4×2 分页、真实角色缩略图、预览/确认两阶段选择、自启勾选和打开宠物目录；不引入 Tauri/WebView2，关闭 picker 不结束桌宠。
- 右键菜单保持“选择宠物/退出”，托盘保持“选择宠物/唤醒/退出”；热切宠物先解码图集再持久化，损坏角色不会污染已选状态。
- Rust workspace 统一版本为 `0.1.3`；38 个集成契约测试、全 workspace Clippy `-D warnings`、Windows x64 交叉检查和 production release build 通过。
- 新增 `native/scripts/package-windows.ps1`：强制 25/25 资源、EXE ≤20 MiB、资源 ≤65 MiB、ZIP ≤90 MiB并输出 artifact JSON；Windows workflow 同时上传完整候选和隔离运行证据脚本。
- 生产 workspace 为 `x86_64-pc-windows-msvc` 静态链接 CRT；包脚本和运行证据脚本会拒绝仍导入 `VCRUNTIME140`、`MSVCP140` 或 `ucrtbase` 的便携 EXE，避免全新 Windows 需要另装 VC++ 运行库。
- 2026-07-16 退役 P0 后的 dirty-worktree VM 候选：静态 CRT x86-64 GUI EXE 1,566,208 字节，完整 25 宠物 ZIP 61,976,335 字节；ZIP 结构和完整性通过，SHA256 为 `b9819a607488a0e17dc3c696079d33c81fff02f22feec12cddadf67a0f7afe5e`。它是 macOS `cargo-xwin` 的早期验证包，Windows CI 仍需按同一源码重建并生成正式 artifact JSON。
- 新增隔离运行脚本：使用包副本和临时 `APPDATA`/`LOCALAPPDATA`，备份/恢复真实 Run 值；脚本构造一个旧版自定义宠物和设置，要求原生启动后保留旧源、恢复选择/尺寸、再消费 25 个内置角色，同时检查窗口/托盘/欢迎气泡和重复实例并留下 JSON 证据。
- 原生候选收口后重新运行 Electron `preflight` 与真实开发态 smoke，25 个资源、构建、双窗口、选择持久化和回滚启动路径均通过；Windows 发布入口尚未切换。
- ADR-0007 已从 Tauri/WebView2 候选修订为全 Win32 架构；`docs/windows-native-migration.md` 固化功能对照、VM/实机清单、分阶段发布和 Electron 回滚路径。
- 完整候选落地后删除单角色 P0 crate、生产宿主 P0 身份分支和 P0 artifact；Windows workflow 只验证/打包 `native/` 生产工作区，并新增最终 ZIP 解压、双 SHA、资源、架构、提交 SHA 与 clean-worktree 校验。
- Windows 11 ARM64 UTM 已完成 OOBE 与 Guest Tools 安装；最终 ZIP 在来宾侧核对为 61,976,335 字节、SHA256 `b9819a607488a0e17dc3c696079d33c81fff02f22feec12cddadf67a0f7afe5e`，x64 EXE 可由 Windows 11 ARM64 仿真正常运行。
- 单屏人工验收已通过透明渲染、可见像素点击与 click 气泡、分段拖拽、直接缩放、宠物右键菜单、picker 搜索/分页/预览/确认、管理宠物目录、托盘识别与“唤醒”，并确认 25 个内置宠物加 1 个迁移夹具进入选择器。自启开关可写入并保持勾选。
- 按本轮收口决定停止剩余虚拟机操作；登录后自启再拖动、透明角穿透、重启尺寸恢复、混合 DPI/负坐标多屏和真实 x64 仍是未验证项。ARM64 仿真结果只作为早期证据，不触发 Windows Release 或站点下载入口切换。

## 2026-07-15

### Windows 原生桌宠 P0（代码完成，待 Windows 真机验收）

- 在 `spikes/windows-native-pet/` 新增与 Electron 主线隔离的 Rust/Win32 原型，复用现有 8×9 WebP atlas 契约和一个七秀角色。
- 原生 layered window 使用 premultiplied BGRA 绘制，并按当前帧 alpha 生成 window region；透明像素由系统穿透，可见像素接收交互。
- 拖动统一使用 Win32 capture、物理屏幕光标和单一 `SetWindowPos` 写入；几何逻辑覆盖抓取偏移、负坐标副屏、工作区边界与 96–192 DPI。
- 加入 Per-Monitor V2 DPI、无控制台 GUI subsystem、命名 mutex 单实例、HKCU `Run` 自启安装/移除和 `%LOCALAPPDATA%` 启动日志。
- 新增 Windows workflow，运行格式检查、Windows 单测、release build、SHA256/体积记录，并把单宠物 P0 EXE 预算限定为 15 MiB。
- 新增 PowerShell 证据脚本和真机验收清单；当前 macOS 主机 7 个 atlas/几何单测通过，`x86_64-pc-windows-msvc` 编译与 Clippy 检查零告警通过。
- 本机通过临时 `cargo-xwin` 成功链接静态 CRT 的 x64 Windows GUI EXE；PE 导入表不再依赖 Visual C++ Redistributable，EXE 为 3,267,072 字节，含说明、哈希元数据与证据脚本的测试 ZIP 为 3,019,109 字节。
- ADR-0007 记录候选完整架构、90 MiB 最终 ZIP 预算和功能等价门槛；P0 真机通过前不修改 Electron 发布主线。

## 2026-07-13

### 离线资源包与统一目录去重

- Mac DMG 与 Windows 便携 ZIP 都包含完整 25 个角色，不依赖联网下载或仓库外文件。
- 角色不再进入 `app.asar`，改由 Electron Builder `extraResources` 放入 `resources/pets-seed/`。
- 打包态首次启动把种子目录优先移动到 `userData/pets/`；跨卷或只读来源回退为复制，并尽力删除源资源。
- 一次性初始化标记保留“删除不恢复”语义；已有同名用户角色不会被覆盖。
- 包验证同时检查 app.asar 不含重复角色，以及 Mac/Windows `pets-seed` 与项目 25 个角色完全一致。
- Windows 只发布完整便携 ZIP，不再生成 NSIS 安装器；macOS 继续发布 DMG。

## 2026-07-12

### Windows 拖拽坐标收敛与角色精简

- Windows 拖拽位置统一由主进程 `screen.getCursorScreenPoint()` 驱动，不再与 renderer 的 `event.screenX/Y` 混用，避免 DPI 缩放下左右或斜向累计漂移。
- renderer 继续负责拖拽阈值、左右动画和点击判断，主进程成为窗口位置的唯一坐标真相。
- 删除 `player-01` 至 `player-05` 五个玩家角色，内置资源从 30 个收敛为 25 个；统一用户宠物目录和手动删除管理方式保持不变。
- 独立宠物缩略图列入后续性能优化；轻量安装包和空闲轮询调整暂不实施。

### Windows 首次显示与安装包修复

- Windows 首次显示改为同时监听 `ready-to-show` 与 `did-finish-load`，并保持幂等，避免透明桌宠因单一时序事件未触发而始终不可见。
- Windows 使用主动 `show()`；macOS 等平台继续使用不抢焦点的 `showInactive()`。
- 发布目标新增 NSIS 安装程序，同时保留便携 ZIP；安装程序支持选择目录、桌面与开始菜单快捷方式、安装完成后启动。
- 新增 Windows 发布契约测试并纳入 `preflight`，覆盖安装器配置和首次显示兜底。

## 2026-07-11

### 删除设置并重做宠物选择器

- 控制窗口进一步收缩为只接受 `?surface=control&panel=picker`；settings URL、菜单入口、React 面板、hook、公开 IPC 和 capability 已删除。
- 桌宠不再提供 settings 页面中的大小、透明度或置顶控制；保留角色右下角直接拖拽缩放，透明度固定 100% 且始终置顶。
- 持久化从四字段 settings 改为只写 `selectedPetId` 与 `mascotWidthPx`；为保留旧选择与尺寸继续读取旧文件名，透明度和置顶等字段写回时删除。
- picker 从左右管理面板重做为单任务流：标题与搜索、4×2 宠物陈列、分页、底部预览确认坞；保留“卡片预览、确认后切换”。
- 删除会把桌宠主窗切换成不透明矩形的 `DESKTOP_PET_DEBUG` 分支；主窗现在始终透明、无阴影且不可缩放。正式 smoke 断言 html/body/stage/pet shell 背景均为透明，picker 内 sprite 预览层也不再绘制方形底板。
- 新增 picker-only surface 契约和单字段 selection store 测试；Electron smoke 真实点击卡片和确认按钮，并验证重启恢复、控制窗单例、越权 IPC 与桌宠 bounds。
- ADR-0002 记录了移除 settings 的理由、迁移兼容和恢复能力的决策边界。

### 恢复直接缩放并细化透明穿透

- 恢复角色右下角 24px 拖拽把手，尺寸在 84–228px 之间按 12px 分档调整；缩放不依赖设置窗口，松手后独立持久化。
- 主进程不再用所有动画帧的 alpha 外接矩形强制接管鼠标；窗口内命中完全交给 renderer 当前帧 alpha 像素与真实控件，主进程只在窗口外复位穿透状态。
- 右键与托盘仍不提供设置入口；ADR-0003 记录对 ADR-0002 的局部修订。

### 选择器单框体与视觉修正

- `ControlWindow` 改为无原生标题栏的 frameless 窗口，自定义 picker 铺满窗口；标题区域承担拖动，右上角按钮与 Escape 负责关闭。
- picker 保持不透明背景，避免 macOS 透明控制窗在局部重绘时出现合成伪影。
- gallery 顶部增加 hover 安全区，第一排卡片上浮 2px 时不再被 `overflow` 裁切。
- 底部确认栏先从黑底金黄按钮收敛为浅色方案，随后按下方 Codex 浅色规范统一重做。

### 选择器统一为 Codex 浅色配色

- picker 色彩系统统一为 `#f7f7f8` 页面、纯白卡片、`#e5e5e5` 边界、近黑正文和灰色辅助文字。
- 删除金色、暖米黄、玉灰混搭以及系统暗色覆盖；选择器固定使用浅色 `color-scheme`，避免不同系统主题产生两套不一致视觉。
- `#10a37f` 只用于当前/预览状态、焦点和确认操作，普通 hover 使用中性灰，降低全界面强调色密度。

## 2026-07-10

### MVP 简化收口（自动实施完成，待人工桌面验收）

- 已确认保留 Electron + React、拆分 `PetWindow` / `ControlWindow` 的双窗口路线，并写入 MVP 精简规格、可执行计划和 ADR。
- 已建立只允许 `idle`、`dragging`、`waving`、`jumping` 的四态宠物状态机。
- JX3 reminder 已从 App、settings 契约、模块、测试、命令、preflight 和样式中删除。
- renderer HTTP fallback 已删除；main HTTP server、state API、token 鉴权、辅助脚本和命令也已删除，Electron 只保留 preload/IPC 控制面。
- 外部宠物导入/删除、主动 lifestyle/event queue、开机自启和旧 overlay 几何路径已删除；picker 只读内置资源，并限制同时加载的预览 atlas。
- `PetWindow` 与单例 `ControlWindow` 已拆分；settings/picker 复用同一控制窗，控制窗不会改变桌宠 bounds。
- settings 已收缩为 `selectedPetId`、`mascotWidthPx`、`opacity`、`alwaysOnTopEnabled`，主进程更新会实时广播给两个 renderer。
- IPC 按 pet/control surface 做 capability 隔离，并校验 live sender、可信 URL 与 channel allowlist；控制窗并发打开请求已串行化。
- 真实 Electron smoke 覆盖开发态与打包态，验证四态非法输入、设置同步与持久化、选宠、窗口复用/关闭、越权 IPC 拒绝和并发打开。
- `npm run preflight`、`npm run release:gate` 和 macOS 打包可执行文件 smoke 已通过；Mac/Windows 两个 `app.asar` 均含 30 个健康宠物包，0 error / 0 warning。
- 最终独立复审的 5 个 Important 已清零：失效 `selectedPetId` 启动时写回有效默认值；picker 快速翻页的全局预览并发上限为 9；四态与实际 renderer 动画共用 `status.state` 单一来源；包校验补齐主入口依赖和 JS/CSS 产物；smoke 真实点击宠物卡与确认按钮并检查 DOM 动画状态。
- 自动实施已经完成；仍需按 `docs/release-smoke.md` 在真实桌面人工确认透明像素穿透、拖拽手感、平台窗口外观。macOS 包当前未签名/未公证，且使用默认应用图标。

## 2026-06-05

### 透明窗口交互修复

- 收窄透明悬浮窗命中：只在角色 alpha 可见像素和真实控件上关闭 pointer passthrough，宠物矩形空白区域继续穿透。
- 修复选择器打开后仍停留小窗的问题：Electron preload 改为 sandbox 兼容的 `preload.cjs`，在 `contextIsolation` + `sandbox: true` 下暴露 `window.desktopPet`；picker 打开时窗口扩到 `920x760`，顶部宠物卡完整显示，并保留右上角关闭按钮。
- 修复宠物卡点击不切换：真实 Electron 验证已能从选择器切到 `霸刀 Codex Pet 1`，选择后自动收起回小宠物窗口。
- 修复设置面板遮挡宠物：settings overlay 根据窗口所在屏幕左右半区自动选择 `settings-panel-side-left` / `settings-panel-side-right`，打开时出现在角色侧边。
- 修复拖拽不移动：新增 `window:drag-move` IPC，前端 pointer move 显式把 screen 坐标传给主进程移动透明窗口，并保留原惯性采样。
- 气泡文本改为左对齐，长文本换行后不再居中排版。
- 验证已通过：真实 Electron 拖拽坐标变化、picker 打开/切换/关闭、settings 侧边展示，以及 `npm run preflight`。

### 宠物选择器视觉优化

- 将选择器从普通白色调试面板重做为“宠物图鉴”式陈列面板：顶部标题和数量统计、中央 5 卡陈列台、轻量筛选条、当前宠物资料条和底部资源坞。
- 宠物卡片新增来源、当前选中、门派/分类信息，保留稳定的左右翻页与 hover 卡片交互，不引入弧形滚动等不稳定实验。
- 当前宠物资料不再直接展示英文 manifest 描述，改为中文摘要，例如“内置资源 · 北天药宗 · 资源正常”。
- 本地管理和 Codex 候选导入降级为底部资源坞，视觉上不再抢占主选择区域；暗色模式和小窗口布局同步适配。
- Codex 候选会过滤已经整理进本地资源、已改名或已移除的外部宠物，避免 `明月使`、`纱铃`、`毒灵`、Boss 旧候选等重复出现在选择界面。
- 真实 Electron 已验证：拖拽到屏幕偏右后再打开 picker，窗口仍会被 clamp 到可见范围，面板不出屏；点击卡片仍能切换宠物并自动关闭。
- 验证已通过：`npm run build` 和 `npm run preflight`。

## 2026-06-04

### 玩家与 Boss 宠物资源整理

- 项目本地 `pets/` 从 26 个资源包调整为 30 个资源包：保留 20 个 JX3 门派宠物，玩家资源整理为 `player-01` 到 `player-05`，新增 5 个 Boss 资源 `boss-01` 到 `boss-05`。
- 玩家资源改名：`mingyue-shi` -> `player-01` / 春丽，`snowfeather` -> `player-02` / 星河菜菜子，`xiutai` -> `player-03` / 盐皂，`duling` -> `player-04` / 采风，`wanhua` -> `player-05` / 醋摆摆；`shaling` / 纱铃已从项目本地资源中移除。
- 从 Codex 宠物仓库显式复制 5 个 Boss：唐怀仁、唐醉、柳公子、笑妆娘、阿史那承庆；复制后在项目内使用 `boss-01` 到 `boss-05` 作为 manifest id 和目录名，避免混入 `jx3-*` 门派资源命名。
- 所有玩家包增加 `faction: 玩家` 与 `tags: ["player"]`，所有 Boss 包增加 `faction: Boss` 与 `tags: ["boss"]`，方便 picker 搜索和后续资源分类。
- 验证已通过：`npm run pet:check`、`npm run package:check`、`npm run build`、`npm run preflight`；当前本地 release 产物仍是资源整理前产物，发布前需重新运行 `npm run release:gate`。

### MVP 优化方案

- 新增 `docs/mvp-optimization-plan.md`，把 5 个 subagent 的评分结果收敛成阶段化优化路线。
- 方案按 Phase 0-5 拆解：当前状态收口、Electron 安全边界、代码结构拆分、UI 入口与可访问性、测试/CI/release gate、文档轻量化与外部接手。
- 每个任务包含验收标准、验证命令、依赖、预计触碰文件和规模，方便后续按小步实现而不是一次性重构。
- docs map 增加优化方案入口；后续做系统性优化时优先按该方案推进，并在每个 checkpoint 回填工作日志。
- Phase 0 已收口：P4.1 计划顶部标记为“实现中、未提交、未发布稳定能力”，当前工作区边界仍限定在 `desktop-pet-mvp` 独立仓库内。
- Task 1.1 已完成：本地 state API 写操作新增 `X-Desktop-Pet-Token` 校验，默认使用运行时随机 token，开发可通过 `DESKTOP_PET_API_TOKEN` 固定 token；`npm run preflight` 已通过。
- Task 1.2 已完成：新增可信 renderer URL 判断和窗口安全 helper，主窗口拦截非预期导航/新窗口，IPC handler/send 路径统一做 sender 校验，并启用 Electron `sandbox: true`；开发 Electron 启动、真实 state API token 验证和 `npm run preflight` 已通过。
- Task 1.3 已完成并通过 `npm run preflight`：Codex 宠物导入、本地 `pet:check` 和 `package:verify` 统一执行宠物包 allowlist，只允许 `pet.json` 与 manifest spritesheet，并拒绝额外文件、过量文件或过大 bundle；现有 26 个项目本地宠物包 0 error / 0 warning。
- Task 2.1 已完成：新增 `useDesktopPetSettings`，把 settings 初始化读取、手动更新标记、乐观更新、保存回填、失败 best-effort 和 JX3 reminder patch 归一化从 `App.tsx` 抽出；`npm run test:settings`、`npm run test:jx3-reminders` 和 `npm run build` 已通过。
- Task 2.2 已完成：新增 `useJx3ReminderScheduler`，把 P4.1 due alert timer、mute 等待、sleep/overlay/全局开关门控、fired keys 和 dismissible reminder event 从 `App.tsx` 抽出；新增 `npm run test:jx3-reminder-scheduler` 覆盖调度边界，专项测试和 build 已通过。
- Task 2.3 已完成代码与专项验证：新增 `src/settings/desktopPetSettings.ts` 承接 renderer fallback settings 默认值、解析和 patch 归一化，`desktopPetApi.ts` 复用该契约；新增 `npm run test:settings-contract` 对齐 Electron store 与 renderer fallback 的默认值、缺字段、坏 JSON、合法/非法 patch 和 P4.1 模板规则。
- Task 2.4 已完成：`styles.css` 不改视觉、不移动选择器，仅增加 base overlay、settings、JX3 reminder、speech bubble、picker、导入/本地管理、motion、响应式和 dark mode 功能分段；`npm run build` 通过，picker/settings 两个 URL 入口返回 200。
- Phase 2 阶段门禁已通过：新增 scheduler 与 settings contract 测试进入 `scripts/preflight.mjs`，`npm run preflight` 全绿。
- Task 3.1 已完成代码与文档更新：透明悬浮窗 hover 时显示 `宠物` / `设置` 快捷入口和 `右键菜单` 提示，右键菜单仍保留原生 settings/picker/action 入口；README 与 `docs/release-smoke.md` 已同步，`npm run build` 已通过，完整 Electron 手动冒烟留到后续 UI 阶段统一执行。
- Task 3.2 已完成代码与专项验证：JX3 提醒面板新增“本地自填提醒”说明，显示提醒总开关关闭、静音、sleep、气泡关闭和主动提醒关闭等阻断原因，并把空摘要文案改为“今日没有启用的本地提醒”；`docs/jx3-reminder-mvp-plan.md` 同步当前风险，`npm run test:jx3-reminders` 与 `npm run build` 已通过。
- Task 3.3 已完成代码与文档更新：settings 打开后聚焦关闭按钮，picker 打开后聚焦搜索框；Escape/关闭按钮会关闭 overlay 并把焦点还给触发快捷入口；picker 主要 aria 文案改为中文，`docs/release-smoke.md` 补入键盘与 dismissible reminder bubble 冒烟路径，`npm run build` 已通过。
- Task 3.4 已完成代码验证：CSS 增加 `prefers-reduced-motion: reduce` 规则，关闭 picker、pet card、row 和 speech bubble 的主要动画；提醒面板关键文案字号提升，小窗口下 summary/form 增加防溢出布局；`npm run build` 已通过，小窗口和系统 reduced-motion 人工检查留到最终 Electron smoke。
- Task 4.1 已完成代码侧测试覆盖：`test:jx3-reminder-scheduler` 覆盖 reminder due/future/fired key、sleep、气泡关闭、主动提醒关闭和 overlay open 门控，不启动 Electron 原生窗口；Phase 4 收口后 `npm run preflight` 已通过。
- Task 4.2 已完成自动冒烟：新增 `tests/smoke/electron-smoke.mjs` 和 `npm run smoke:electron`，用临时 userData、固定 token 和随机空闲端口启动真实 Electron，验证 state API auth、settings 写入、状态切换、切宠和 picker window state；`docs/release-smoke.md` 同步该自动检查与人工窗口检查边界。
- Task 4.3 已完成本地与配置侧：新增 `.github/workflows/ci.yml`，在 `main`、`codex/**` 和 PR 上运行 Node 24、`npm ci` 与 `npm run preflight`，不生成 release 包；README 与版本/提交规范说明 CI 边界；本地 `npm ci && npm run preflight` 已通过，远端 workflow 需推送后确认。
- Task 4.4 已完成并真实执行：新增 `scripts/release-gate.mjs` 和 `npm run release:gate`，只清理当前项目 `release/`，依次运行 `preflight`、`dist:all` 与 `package:verify`；本轮生成 mac arm64 / win x64 release 产物，包内验证 2 个 app.asar、26 个宠物、0 error / 0 warning。macOS 当前配置 `identity=null`，日志显示跳过签名，需在 release smoke 的签名/公证表中记录为发布例外或后续项。
- Task 5.1 已完成文档轻量化：README 从 319 行收敛为 5 分钟入口，保留 quick start、当前分层、关键命令、资源边界和发布入口；完整 tree、settings JSON shape、命令分层和资源 allowlist 下沉到 `docs/project-structure.md`。
- Task 5.2 已完成外部模型接手文档：新增 `docs/model-handoff.md`，不依赖本地绝对路径，明确 `desktop-pet-mvp`、`desktop-pet-site`、`petdex` 边界，强调 P4.1 只做本地轻提醒，并列出关键文件、验证命令和重点评审问题。
- Task 5.3 已完成本轮收口回看：`docs/mvp-optimization-plan.md` 保留优化前评分基线，补入本地实现复评估算、Checkpoint A/B/E 完成状态，以及远端 CI、人工 Electron smoke、macOS 签名/公证的剩余风险。
- 文档收口后的最终验证已通过：`npm run preflight`、`npm run smoke:electron`、`npm run package:verify`；其中包内验收检查 2 个 `app.asar`、26 个本地宠物、0 error / 0 warning。
- 本轮 Phase 0-5 代码与文档侧任务已完成；发布前仍需在真实桌面环境执行人工冒烟，并在推送后确认远端 GitHub Actions 通过。

### README 与项目结构图梳理

- README 新增当前项目四层分法：Electron runtime、React renderer、local resources 和 verification，明确本仓库只覆盖桌宠 MVP 核心应用。
- README 的 `Project Structure` 改成仓库级 tree 结构图，覆盖 `electron/`、`src/behavior/`、`src/reminders/`、`pets/`、`scripts/`、`tests/`、`docs/` 和顶层配置文件职责。
- docs map 同步标注 P4.1 剑三轻提醒主线，并把 README 定位为 tree 结构图和项目总览入口。
- 开发检查清单补入 `npm run test:jx3-reminders`，和 `npm run preflight` 的真实执行链路保持一致。

## 2026-06-01

### P4.1 剑三轻提醒 MVP

- 新增 `docs/jx3-reminder-mvp-plan.md`，把 ChatGPT 中的“剑三轻量桌宠提醒功能：最小量级开发计划”落到当前 Electron 桌宠项目的真实文件边界。
- MVP 只做本地模板、自定义提醒、今日三条摘要、静音和现有气泡提示；提醒数据写入本地 settings JSON，不接外部游戏数据、云同步、Agent 状态或任务队列。
- 提醒气泡区别于普通陪伴气泡：停留 12 秒，并支持点击、Enter 或 Space 提前关闭。
- 自定义提醒默认生成提前 15 分钟和提前 1 分钟两次提醒，和攻防模板的临近提醒节奏保持一致。
- 明确不恢复已归档移除的“江湖状态 / 今日状态”重型状态卡，不新增卡片导出、每日运势或旧模块运行时入口。
- README 和 docs map 只补入口、设置草案和使用边界，避免把长报告塞进顶层说明。

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
