# 工作日志

## 2026-05-20

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
- 实现 CSS sprite atlas 渲染，支持 idle、running-left、running-right、waving、jumping、failed、waiting、running、review 状态。
- idle 动画按 Codex 方式放慢处理；左右跑步支持连续循环。
- 实现角色拖拽、拖拽方向动画、点击挥手、右键菜单、缩放手柄。
- 实现主进程窗口拖拽和松手惯性移动。
- 实现 alpha 像素命中检测：透明区域点击穿透，角色可见区域才响应。
- 根据所有动画帧 alpha 边界计算可视 insets，让角色拖到屏幕边缘时更贴近可见轮廓。
- 扫描 `sample-pets/`、`~/.desktop-pet-mvp/pets/`、`~/.codex/pets/` 三类宠物目录。
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
