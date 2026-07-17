# ADR-0007：先验证 Windows 原生桌宠窗口，再迁移主线

## 状态

Accepted for staged migration：完整原生候选已取代 P0 源码入口；Windows VM / x64 实机验收后才能切换发布主线

## 日期

2026-07-15

## 背景

当前精简版以 Electron + React 实现透明桌宠。Windows 拖拽仍跨越 renderer pointer event、alpha 命中、IPC、主进程定时移动和 Electron 窗口坐标，多处共同持有交互状态；登录启动又缺少单实例和可核验的系统自启状态。这样的链路已经多次出现“手动启动可用、开机自启后不可拖动”以及 DPI/跨屏拖动偏移。

当前 Windows 便携 ZIP 约 174 MiB，解压后的主 EXE 约 201 MiB；25 个 WebP 宠物资源本身约 59 MiB，React/Vite 与 `app.asar` 不是主要体积来源。仅继续压缩 Electron 前端无法解决主要体积和原生输入可靠性问题。

## 决策

- 暂不改写 Electron 主线，先在 `spikes/windows-native-pet/` 建立可独立删除的 Rust/Win32 P0。
- P0 的 `PetWindow` 使用 layered `HWND`、premultiplied BGRA 和动态 alpha window region；透明像素由 Windows 窗口形状直接穿透。
- 拖动只使用 `SetCapture`、`GetCursorPos` 和 `SetWindowPos`，窗口位置只有一个原生写入者。
- Windows 原生层同时拥有 Per-Monitor V2 DPI、负坐标工作区约束、单实例 mutex、HKCU `Run` 自启和 `%LOCALAPPDATA%` 启动日志。
- P0 保持现有 8×9 WebP atlas 契约，以一个现有角色验证 idle 动画，不在此阶段复制 picker、气泡和全部宠物功能。
- P0 的 Windows 宿主只有在真实 Windows 的登录启动、拖动、透明穿透、混合 DPI 与单实例检查全部通过后，才可替换发布主线。
- 可提前抽取完全平台无关、已有测试可证明等价的共享核心（状态机、动画、几何、manifest 与三字段设置），但不得因此移除或改写 Electron 发布能力。

P0 验证层完成后，生产候选继续复用同一 Win32 宿主，而不是另起一套窗口实现。Electron 仍作为可回滚发布主线保留，直到下述全部门禁有真实 Windows 证据。

## 已实现的完整架构

最终实现按职责拆分：

1. `desktop-pet-core` 负责状态机、动画时间线、拖拽/DPI 几何、气泡选择、manifest、三字段设置、宠物库和 picker 状态。
2. `desktop-pet-render` 解码 1536×1872 WebP/PNG/SVG atlas，缓存缩放帧并提供逐像素 alpha 命中。
3. `desktop-pet-app` 负责统一用户宠物库、可消费种子、旧选择迁移和设置事务写回。
4. `desktop-pet-windows` 负责 layered `PetWindow`、独立 `PickerWindow`、气泡窗、托盘、单实例、HKCU `Run` 自启与日志。

单角色 P0 的职责已经被完整候选覆盖，因此其包装 crate、独立身份分支和 CI 产物已删除。历史结论保留在本 ADR 与工作日志中，生产源码只维护 `native/desktop-pet-windows`。

实现阶段放弃了 Tauri/WebView2 picker：当前 picker 只有搜索、4×2 分页、预览确认、自启开关和打开目录，使用 Win32 HWND 与 GDI 自绘即可完整覆盖。正文区使用自有语义色、圆角卡片、按钮和 toggle，只有搜索输入保留原生 `EDIT` 以承接中文输入法和键盘语义；这样既不暴露默认 Windows 控件皮肤，也不需要随包携带 WebView 前端或依赖目标机 WebView2 状态，并避免再次把输入、窗口生命周期和配置分散到 Rust/JS 两侧。现有 React picker 仍保留在 Electron 回滚主线中，不要求玩家资源迁移。

完整 Windows 离线包仍保留当前 25 个宠物。体积预算按来源拆分：原生宿主与控制 UI 不超过 20 MiB，宠物资源不超过 65 MiB，最终 ZIP 目标不超过 90 MiB。便携 EXE 静态链接 MSVC CRT，包门禁拒绝动态 VC++ 运行库依赖。若未来改为基础角色加按需宠物包，可另行降低首次下载体积，但不属于本次功能等价迁移。

2026-07-16 退役 P0 后的未发布 macOS `cargo-xwin` VM 候选为：静态 CRT EXE 1,566,208 字节、资源 61,220,593 字节、完整 ZIP 61,976,335 字节。候选包随代码变化立即失效，实际发布以同一提交在 Windows CI 生成的 artifact JSON 和 SHA256 为准。

同日 Windows 11 ARM64 来宾的 x64 仿真完成单屏早期验收：启动、透明渲染、点击、拖拽、直接缩放、picker、管理目录和托盘可用，自启开关可写入。按本轮收口决定未继续登录自启复测、alpha 角落穿透、混合 DPI/负坐标多屏或真实 x64；这些仍是发布门禁，早期 VM 结果不改变 Electron 回滚主线。

## 功能等价门槛

主线切换前必须覆盖当前精简版的全部用户能力：

- 25 个现有宠物及现有资源契约。
- idle、dragging、waving、jumping 四态和当前节奏。
- alpha 透明穿透、直接拖动、右下角缩放、始终置顶。
- 当前四类基础气泡及角色文案路由。
- picker-only 控制窗、搜索、分页、预览确认和选择持久化。
- 右键选择宠物/退出、单实例、开机自启与系统状态一致。

迁移采用并行实现和功能对照，不在 Electron 主线中逐块拆除后再等待原生版本补齐。共享核心位于 `native/desktop-pet-core/`；P0 阶段曾直接复用它，完整候选落地后删除原型入口，避免长期维护两套身份和发布产物。

## 验证与止损

- 自动：共享 workspace 的 41 个契约测试覆盖 25 个资源、三类图集、四态、动画、气泡、picker、alpha 外接区域与缩放锚点、几何、设置、Electron 旧数据导入、统一宠物库与渲染；Clippy 使用 `-D warnings`；Windows CI 运行生产 MSVC build，并执行 20/65/90 MiB 三级体积预算与最终 ZIP 完整性校验。
- VM：`native/scripts/verify-windows-runtime.ps1` 在隔离的 `LOCALAPPDATA` 和包副本中检查首启、25 个资源消费、窗口/托盘/欢迎气泡日志和重复实例；人工验证拖拽、alpha、缩放、picker、自启、DPI 与跨屏。
- 实机：ARM64 Windows 中的 x64 仿真只做早期验证；主线切换前仍需真实 Windows x64 或等价 x64 CI/硬件完成登录启动、混合 DPI 和多屏检查。
- 通过：把原生 Windows ZIP 作为独立 canary 资产发布；观察通过后再让站点 Windows 下载入口指向原生包。
- 未通过：停止原生 rollout，站点和 GitHub Release 继续使用已验证的 Electron Windows ZIP；共享 `pet.json`、设置和用户宠物目录不需要回滚或转换。

完整步骤和证据格式见 [../windows-native-migration.md](../windows-native-migration.md)。

## 取舍

- 增加了 Rust/Win32 专用代码和 Windows CI，维护者需要能检查少量 unsafe FFI。
- `PetWindow` 与 picker 都不依赖 WebView，包体和窗口状态更可控；选择器正文由 GDI 自绘以避免默认控件皮肤，但仍保留系统标题栏和原生输入框，因此与 Electron frameless picker 存在平台外观差异，功能契约不变。
- 首次启动会把可写包副本中的 `pets-seed` 移到用户目录；只读安装位置回退为复制并忽略源清理失败。
- 当前候选尚未经过 Windows VM 全项验收、真实 x64 多屏验收或代码签名，因此不能替代当前 Electron 公开安装包。
