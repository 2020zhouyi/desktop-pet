# Pet Manifest v1

每个宠物文件夹包含 `pet.json` 和一张 spritesheet。最小 manifest：

```json
{
  "id": "jx3-qixiu-01",
  "displayName": "七秀",
  "spritesheetPath": "spritesheet.webp"
}
```

## 必填字段

- `id`：非空、稳定、唯一。运行时选择记录使用该 ID，不依赖文件夹名称。
- `displayName`：选择器显示的角色名称，也用于整理用户宠物文件夹名称。
- `spritesheetPath`：宠物文件夹内的安全相对路径；拒绝绝对路径和 `..` 穿越。

## 可选字段

```json
{
  "description": "角色说明",
  "author": "作者",
  "version": "1.0.0",
  "tags": ["jx3", "七秀"],
  "faction": "七秀",
  "recommendedScale": 1.15,
  "accentColor": "#10a37f",
  "behaviorProfile": "watchful",
  "bubbleLines": {
    "welcome": ["我来啦。"],
    "click": ["我在。"],
    "drag": ["慢点搬。"],
    "petSwitch": ["换我接班。"]
  }
}
```

- 字符串元数据必须非空。
- `tags` 必须是非空字符串数组。
- `recommendedScale` 范围为 `0.5` 到 `2`。
- `accentColor` 接受 `#rgb` 或 `#rrggbb`。
- `bubbleLines` 只接受 `welcome`、`click`、`drag`、`petSwitch`；每项是至少包含一个非空字符串的数组。

角色 manifest 的 `bubbleLines` 优先于源码内置回退，因此普通玩家可以直接编辑用户宠物目录中的 JSON，无需重新构建应用。

## 资源边界

每个宠物目录只允许：

```text
pet.json
<spritesheetPath>
```

图集固定为透明 `1536 × 1872` 的 `8 × 9` atlas，每格 `192 × 208`。额外文件、符号链接、重复 ID、危险路径和过大资源会被健康检查拒绝。

## 两级目录

- `./pets/`：随安装包发布的初始种子资源，只用于首次初始化与打包校验。
- Electron `userData/pets/`：运行时唯一宠物库，内置和自定义宠物都在这里由用户管理。

首次运行只复制一次内置种子。之后用户删除的文件夹不会自动恢复。运行时根据 manifest `id` 识别宠物，根据 `displayName` 整理文件夹名称。

验证：

```sh
npm run pet:check
npm run test:pet-library
npm run test:bubbles
```
