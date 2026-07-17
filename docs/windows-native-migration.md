# Windows 原生迁移与验收

日期：2026-07-18

状态：代码候选已完成，并于 2026-07-18 完成选择器视觉、窗口层级、确认关闭、缩放把手可达性和紧凑气泡修正；这些修正已通过自动测试与 Windows x64 交叉编译，但尚未在真实 Windows 上做视觉复验。此前 Windows 11 ARM64 来宾中的 x64 单屏结果仅覆盖旧候选；登录自启复测、混合 DPI/多屏、真实 x64 和发布切换仍待发布前完成。当前公开 Windows 发布仍以 Electron ZIP 为回滚真相。

## 迁移目标

Windows 端从 Electron + React + renderer IPC 改为 Rust + Win32，解决开机自启后拖不动、透明命中不稳定、DPI/跨屏坐标漂移和 200 MiB 级运行包体，同时保持精简版功能不变：

- 25 个离线宠物和原 `pet.json` / 8×9 atlas；内置 WebP 与自定义 WebP、PNG、SVG 都保持兼容；
- idle、左右跑步、挥手、跳跃和四类气泡；
- 逐像素透明穿透、直接拖拽、右下角分档缩放、始终置顶；
- picker-only 控制窗的搜索、4×2 分页、真实预览和确认切换；
- 当前角色、桌宠宽度、开机自启三字段持久化；
- 首次切换时保留现有 Electron 自定义宠物、选择、尺寸和自启偏好；
- 右键菜单、托盘、单实例、管理宠物目录和登录启动。

不恢复 settings、提醒、本地 HTTP 服务、应用内宠物 CRUD 或主动行为。

## 当前架构

| 组件 | 职责 | 平台依赖 |
| --- | --- | --- |
| `native/desktop-pet-core` | 状态、动画、几何、manifest、气泡、picker、设置、宠物库 | 无 |
| `native/desktop-pet-render` | WebP/PNG/SVG 解码、缩放缓存、alpha 命中 | 无 |
| `native/desktop-pet-app` | Electron 旧数据合并、可写目录、消费式种子、选择与设置事务 | 文件系统 |
| `native/desktop-pet-windows` | Pet/Picker/Bubble 三类 HWND、托盘、自启、单实例、日志 | Win32 |

早期单角色 P0 已完成架构验证并退出源码和 CI；当前只有 `native/` 生产工作区这一条 Windows 运行入口。

高频拖拽链路只有一个坐标真相：`SetCapture -> GetCursorPos -> desktop-pet-core geometry -> SetWindowPos`。Web renderer、IPC 和 WebView 不参与窗口移动。

## 功能等价证据

| 能力 | 自动证据 | Windows 运行证据 | 当前状态 |
| --- | --- | --- | --- |
| 25 个宠物/资源安全 | `existing_pet_library`、`render_contract`、包脚本 25/25 检查 | 选择器显示 25 个内置宠物与 1 个迁移夹具 | 自动通过，ARM64 早期通过 |
| 四态和时间线 | `runtime_contract`、`render_contract` | 点击、横拖、切宠观察与日志 | 自动通过，点击/拖拽/切宠早期通过 |
| 拖拽/负坐标/DPI 几何 | `runtime_contract` | 100%–200%、负坐标、多屏人工检查 | 单屏拖拽通过，混合 DPI/多屏待验 |
| alpha 穿透 | renderer alpha 命中测试 | 透明角点击后方窗口 | 透明渲染通过，角落穿透待验 |
| 缩放 | 84–228 / 12px、alpha 外接区域与把手锚点测试 | 从角色 alpha 区连续移动到把手、拖拽与重启恢复 | 旧候选直接缩放通过；2026-07-18 可达性修正待 Windows 复验 |
| 气泡 | `bubble_contract`、紧凑尺寸约束测试 | welcome/click/drag/petSwitch 的实际尺寸与换行 | 120×44–240×92 动态布局自动通过；Windows 视觉待验 |
| picker | `picker_contract`、Windows x64 编译 | 自绘主题、搜索、分页、预览、确认关闭、管理目录层级、Escape | 旧候选基本流程通过；2026-07-18 视觉与窗口行为修正待 Windows 复验 |
| 资源消费 | core/app 首启、冲突、只读源测试 | 包副本 `pets-seed` 消失、用户目录保留 | 自动通过，来宾目录可见，完整证据待取 |
| Electron 旧数据迁移 | app 合并、冲突、只执行一次测试 | 隔离 `%APPDATA%` fixture 导入且旧源保留 | 自动通过，迁移夹具可见，证据 JSON 未取 |
| 单实例/托盘/自启 | Windows 编译与日志点 | 重复启动、托盘、注销/重启 | 托盘与开关通过，重复实例/登录复测待验 |

自动测试不能证明真实 HWND 输入和 Windows 登录会话行为；表中任何 “VM/实机待验” 都不能用编译成功代替。

## 构建和包体门禁

Windows x64 本机：

```powershell
cd .\native
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
.\scripts\package-windows.ps1
.\scripts\verify-windows-package.ps1 `
  -ArchivePath .\target\package\DesktopPet-Windows-x64.zip `
  -MetadataPath .\target\package\DesktopPet-Windows-x64.artifact.json
```

包脚本输出：

```text
native\target\package\DesktopPet-Windows-x64.zip
native\target\package\DesktopPet-Windows-x64.artifact.json
```

硬门禁：生产 EXE ≤ 20 MiB、宠物资源 ≤ 65 MiB、完整 ZIP ≤ 90 MiB、manifest/spritesheet 各 25 个且无额外文件；EXE 必须静态链接 MSVC CRT，不得要求额外安装 `VCRUNTIME140`、`MSVCP140` 或 `ucrtbase`。成品校验脚本会重新解压 ZIP，核对唯一根目录、双 SHA256、资源计数、体积、架构、提交 SHA 和 clean-worktree 标记。当前候选数字以本地 artifact JSON 为准；其 SHA256 只对当前 dirty-worktree 快照有效，Windows CI 必须按同一源码重建正式候选。

macOS 可用 `cargo xwin` 做 x64 PE 早期编译，但不能在 macOS 直接证明 Windows 运行行为。最终候选必须由 Windows workflow 再构建一次。

2026-07-18 本轮 dirty-worktree 交叉构建位于 `native/target/package-20260718-p4-final/`：EXE 1,498,624 字节，25 个宠物资源 61,220,593 字节，ZIP 61,957,695 字节，ZIP SHA256 `33c09d863b0c877704aae9a1d9b63e065ba48a15b789032da6f1d390c9188d21`。该路径与哈希仅用于本机核对，不是 GitHub Release 资产；发布前须从 clean commit 在 Windows workflow 重建并以 workflow artifact JSON 为准。

## VM 自动证据

前置：Windows 已完成 OOBE，UTM Guest Tools/QEMU Guest Agent 已安装，且没有正在运行的 Desktop Pet。把 ZIP 和验证脚本传入来宾后执行：

```powershell
Expand-Archive .\DesktopPet-Windows-x64.zip -DestinationPath .\candidate -Force
Set-ExecutionPolicy -Scope Process Bypass
.\verify-windows-runtime.ps1 `
  -PackageDirectory .\candidate\DesktopPet-Windows-x64 `
  -KeepProcessRunning
```

脚本会复制候选包并使用隔离的临时 `APPDATA`/`LOCALAPPDATA`，保留原包和真实用户数据；运行前后会备份并恢复 `HKCU\...\Run\DesktopPet`。隔离 `APPDATA` 中会生成一个旧 Electron 自定义宠物与旧设置，用于证明真实启动迁移。它必须证明：

- 首进程持续存活，日志出现 `process_start`、`bundled_library_ready`、`pet_loaded`、`window_visible`、`tray_ready` 和欢迎气泡；
- 旧目录未删除，旧选择和 180px 尺寸恢复；25 个内置宠物与 1 个旧自定义宠物完整进入隔离用户目录，工作包副本的 `pets-seed` 被消费；
- 第二实例在 5 秒内正常退出，日志出现 `duplicate_instance_rejected`；
- 没有 `fatal_error`，并生成 `runtime-evidence.json`。

### 2026-07-16 ARM64 早期验收记录

- 来宾：Windows 11 ARM64，运行 x64 候选；这不是发布所需的真实 x64 环境。
- 候选 ZIP：61,976,335 字节，SHA256 `b9819a607488a0e17dc3c696079d33c81fff02f22feec12cddadf67a0f7afe5e`；来宾侧传输后哈希一致。
- 已观察通过：透明桌宠可见、点击与 click 气泡、分段拖拽无回弹、右下角直接缩放、宠物右键菜单、picker 搜索/分页/预览/确认、管理宠物目录、托盘菜单与唤醒、自启开关写入。
- picker 显示 26 个伙伴，包括 25 个内置宠物和自动验证脚本生成的 `Migration Fixture`；自动脚本已启动隔离候选并保留运行进程，但本轮没有取回 `runtime-evidence.json`，因此不把它记为完整自动通过。
- 按用户收口决定，停止后续 VM 操作；登录后自启再拖动、透明角穿透、重启持久化、混合 DPI/负坐标多屏和真实 x64 继续保留为发布阻断项。

### 2026-07-18 交互回归复验项

本轮源码修正晚于上面的 ARM64 候选，因此发布前必须在新包上重新检查：

1. 从角色身体缓慢移向右下角缩放图标，中途经过透明像素时图标不消失；进入图标后出现 NW-SE 光标并可立即按下缩放。
2. 选择器正文不再显示默认 Windows 按钮或复选框皮肤；搜索框、宠物卡、状态标签、自启开关、分页和确认按钮在 100%、150%、200% DPI 下无裁切或重叠。
3. 点击非当前宠物只更新预览；点击“确认使用”后，切换成功且选择器立即关闭。若资源损坏导致切换失败，选择器保留并记录 `pet_switch_error`。
4. 点击“管理宠物”后，资源管理器出现在选择器前方且能立即操作；返回选择器后会重新载入用户宠物目录。
5. 短气泡接近单行内容尺寸，不再固定占用 300×96px；较长中文或英文文案在最大 240×92px 内换行且不截断常规内置文案。

## Windows 人工验收

在脚本保留的进程上逐项记录通过/失败、Windows 缩放和屏幕布局：

1. 可见像素按下后拖动；首次移动不跳变，连续横拖不反向、不累计漂移。
2. 透明角落点击能到达后方窗口；身体、头部等非透明像素仍可拖动。
3. 单击播放挥手和 click 气泡；横拖显示左右跑步，松手回 idle 并显示 drag 气泡。
4. 鼠标从角色连续移动到 alpha 可见区域右下方的把手时，把手保持可点；按 12px 档位在 84–228px 缩放，退出重开后恢复。
5. 右键只能打开选择器或退出；托盘可打开选择器、唤醒桌宠和退出。
6. picker 自绘主题、搜索、4×2 分页、真实缩略图、预览/已确认区分均正常；确认切换成功后窗口自动关闭，Escape 也可关闭，且关闭 picker 不退出桌宠。
7. “管理宠物”打开的资源管理器位于 picker 上方且可直接操作；返回 picker 后新增或删除的目录能刷新。
8. 切宠后进入 jumping、显示尺寸紧凑的 petSwitch 气泡并在重启后恢复选择。
9. 勾选开机自启后检查 Run 值；注销或重启后日志出现 `source=autostart` 和 `window_visible`，且桌宠仍可拖动。取消勾选后 Run 值消失。
10. 在 100%、125%、150%、200% 缩放下拖到四边；桌宠与气泡留在当前工作区内。
11. 副屏置于主屏左侧或上方形成负坐标，并使用混合 DPI；跨屏后尺寸更新、抓取点不漂移、仍可继续拖动。

ARM64 Windows 的 x64 仿真可验证大部分交互，但第 9–11 项在发布前还要用 Windows x64 硬件或等价环境复核。

## 发布与回滚

发布采用可逆分阶段切换：

1. Windows CI 生成带 artifact JSON 的原生候选，Electron Windows ZIP 不删除。
2. VM 和真实 x64 全项通过后，把原生包作为单独 canary 资产发布，不立即覆盖站点 latest 链接。
3. canary 无启动、拖拽、自启、资源丢失或安全软件异常后，再把 Windows 下载入口切到原生 ZIP。
4. 至少保留一个发布周期的 Electron Windows ZIP；macOS 继续使用 Electron，不受本次迁移影响。

以下任一情况立即回滚下载入口：无法启动/可见、开机启动后不能拖动、用户资源被覆盖或恢复、透明窗口大面积拦截点击、单实例失效、DPI/多屏导致窗口不可达。回滚只需恢复站点和 Release 指向上一版 Electron ZIP；两条实现共用 `pet.json`、`desktop-pet-settings.json` 和用户宠物目录，不需要数据降级。

只有自动门禁、VM、真实 x64、发布资产、下载链接和回滚演练全部有证据后，才能删除 Windows Electron 打包路径或把迁移标记为完成。
