# 桌宠四场景气泡文案指南

本文只描述当前 `desktop-pet-mvp` runtime。实现入口是 `src/petBubbles.ts`，直接交互触发位于 `src/App.tsx`。每个宠物自己的可编辑文案位于资源文件夹的 `pet.json.bubbleLines`。

## 当前场景

Runtime 只接受四个 scene：

| Scene | 使用时机 | 文案目标 |
| --- | --- | --- |
| `welcome` | 桌宠首次就绪 | 简短上线与陪伴感 |
| `click` | 单击可见宠物且没有发生拖拽 | 对点击做即时回应 |
| `drag` | 完成一次真实拖拽 | 对移动位置做轻量反馈 |
| `petSwitch` | 确认切换内置宠物 | 角色交接与上场反馈 |

每个角色应为四个 scene 各准备至少一句非空文案。推荐每项 2–3 句，每句尽量短，避免长段设定说明、系统术语和直接复用受版权保护的原台词。

## Runtime 路由

`bubbleTextForPet` 按以下优先级读取文案：

1. 优先读取当前宠物 `pet.json` 的 `bubbleLines`。
2. 缺失的 scene 再按 `displayName` 和稳定 `id` 匹配内置角色或门派文案。
3. 仍未命中时使用通用 fallback。

角色 alias 匹配不区分大小写。`description`、`faction`、`tags`、`behaviorProfile` 不参与角色命中；只修改 manifest 描述不会改变气泡风格。

角色一旦命中，缺失的 scene 会直接回退通用文案，不会继续回退到门派文案。因此角色 JSON 的四个 scene 必须一起验收。

## 角色 pet.json

用户日常编辑只需要修改统一宠物目录中对应角色的 `pet.json`：

```json
{
  "id": "player-example",
  "displayName": "角色名",
  "spritesheetPath": "spritesheet.webp",
  "tags": ["player"],
  "bubbleLines": {
    "welcome": ["我来啦。"],
    "click": ["我在。"],
    "drag": ["慢点搬。"],
    "petSwitch": ["换我接班。"]
  }
}
```

保存后重新聚焦选择窗口或重启桌宠即可重新加载。`id` 应保持稳定；`displayName` 可以修改，资源文件夹会在下次启动时同步为角色名称。

## 内置文案回退

两个 JSON 文件职责相同，数据来源不同：

- `src/playerBubbleCopy.json`：玩家角色的内置回退与迁移来源。
- `src/bossBubbleCopy.json`：Boss 角色的内置回退与迁移来源。

Runtime 实际读取：

```json
{
  "copyKey": "player-example",
  "aliases": ["角色名", "player-00", "stable-slug"],
  "lines": {
    "welcome": ["我来啦。"],
    "click": ["我在。"],
    "drag": ["慢点搬。"],
    "petSwitch": ["换我接班。"]
  }
}
```

边界规则：

- `copyKey` 在 player/boss 两个文件间保持唯一且稳定。
- `aliases` 至少覆盖可见角色名和稳定资源 ID；避免过短、过宽或互相重叠的 alias。
- `lines` 的四个当前 scene 都应是非空字符串数组。
- `roleName`、`category`、`voice`、`motifs`、`avoid` 可作为编写和审阅元数据，但 renderer 不依赖它们完成路由。
- JSON 中残留的历史 scene 键不会进入当前 runtime；新增或维护角色时不需要补写这些键。
- 正常用户编辑直接修改 `pet.json.bubbleLines`；只有维护内置回退模板时才需要修改 alias 文件。

## 当前角色 Alias

### Player

| copyKey | 角色 | aliases |
| --- | --- | --- |
| `player-chunli` | 春丽 | 春丽、player-01、chunli、mingjiao-player、月刃 |
| `player-xinghe-caicaizi` | 星河菜菜子 | 星河菜菜子、player-02、xinghe-caicaizi、caicaizi、Snowfeather、snowfeather |
| `player-yanzao` | 盐皂 | 盐皂、player-03、yanzao、秀太 |
| `player-caifeng` | 采风 | 采风、player-04、caifeng、五毒玩家 |
| `player-cubai` | 醋摆摆 | 醋摆摆、player-05、cubai、醋摆、brush-player |

### Boss

| copyKey | 角色 | aliases |
| --- | --- | --- |
| `boss-tang-huairen` | 唐怀仁 | 唐怀仁、boss-01、tang-huairen、逆天工 |
| `boss-tang-zui` | 唐醉 | 唐醉、boss-02、tang-zui、枯棠隐 |
| `boss-liu-gongzi` | 柳公子 | 柳公子、boss-03、liu-gongzi、魔罗往相 |
| `boss-xiao-zhuangniang` | 笑妆娘 | 笑妆娘、boss-04、xiao-zhuangniang、鬼山会张宿、张宿 |
| `boss-ashina-chengqing` | 阿史那承庆 | 阿史那承庆、boss-05、ashina-chengqing、巫骨金刚 |

如果角色名、资源目录或 manifest ID 变化，必须同步检查 alias。新增 alias 前先搜索两个 JSON，避免角色间误命中。

## 通用 Fallback

| Scene | 当前通用文案 |
| --- | --- |
| `welcome` | 我上线啦，今天也陪你一会儿。 |
| `click` | 我在呢。 |
| `drag` | 慢点慢点，我跟上。 |
| `petSwitch` | 换好啦，我来接班。 |

门派文案仍在 `src/petBubbles.ts` 内作为角色 alias 未命中时的中间层；它也只允许覆盖当前四个 scene。

## 编写步骤

1. 打开角色文件夹里的 `pet.json`。
2. 在 `bubbleLines` 中为四个 scene 各写 1–3 句短文案。
3. 保存 JSON，确保语法正确且每项都是非空字符串数组。
4. 回到选择窗口触发资源刷新，或重启桌宠。

## 验收清单

- 四个 scene 全部存在且至少有一句非空文案。
- `displayName` 或 `id` 能通过预期 alias 命中正确 `copyKey`。
- player/boss 之间没有重复 `copyKey` 或高风险 alias 冲突。
- 未命中角色仍能得到门派或通用 fallback。
- 不支持的 scene 会被拒绝，不会重新进入 runtime。
- 变更没有扩展 settings、状态机或后台调度范围。

验证命令：

```sh
npm run test:bubbles
npm run build
```

合并前使用：

```sh
npm run preflight
```

`desktop-pet-site` 拥有独立的数据副本和构建流程。本仓库 JSON 的修改不会自动同步站点；只有任务明确同时覆盖两边时，才在独立站点仓库做对应更新和验证。
