import bossBubbleCopy from "./bossBubbleCopy.json" with { type: "json" };
import playerBubbleCopy from "./playerBubbleCopy.json" with { type: "json" };
import type { PetOption } from "./types";

export const bubbleScenes = ["welcome", "click", "drag", "petSwitch"] as const;
export type BubbleScene = (typeof bubbleScenes)[number];
export type BubbleCadence = "quiet" | "normal" | "lively";

export type BubbleTextOptions = {
  cadence?: BubbleCadence;
  recentTexts?: readonly string[];
};

type RequiredBubbleLines = Record<BubbleScene, string[]>;
type BubbleLines = Partial<RequiredBubbleLines>;
type CharacterBubbleCopyEntry = {
  copyKey: string;
  aliases: string[];
  lines: Record<string, unknown>;
};
type CharacterBubbleProfile = {
  aliases: string[];
  lines: BubbleLines;
};

const fallbackLines: RequiredBubbleLines = {
  welcome: ["我上线啦，今天也陪你一会儿。"],
  click: ["我在呢。"],
  drag: ["慢点慢点，我跟上。"],
  petSwitch: ["换好啦，我来接班。"],
};

const cadenceLines: Record<BubbleCadence, BubbleLines> = {
  quiet: {
    welcome: ["我来啦。"],
    click: ["在。"],
    drag: ["慢慢来。"],
    petSwitch: ["换好了。"],
  },
  normal: {},
  lively: {
    welcome: ["我来啦，桌面今日营业！"],
    click: ["收到！"],
    drag: ["换个地方继续陪你。"],
    petSwitch: ["交接完成，下一位上场。"],
  },
};

const linesByCharacter = Object.fromEntries(
  ([...bossBubbleCopy, ...playerBubbleCopy] as CharacterBubbleCopyEntry[]).map(
    ({ aliases, copyKey, lines }) => [
      copyKey,
      { aliases, lines: coreBubbleLines(lines) },
    ],
  ),
) as Record<string, CharacterBubbleProfile>;

const linesBySect: Record<string, BubbleLines> = {
  段氏: {
    welcome: ["周天一转，扇风到桌面。"],
    click: ["别点，我在算一阳指距离。"],
    drag: ["扇面乱了，把我放回风里。"],
  },
  万灵山庄: {
    welcome: ["乘黄到位，百兽也点名了。"],
    click: ["轻点，它以为要出发。"],
    drag: ["别拽，乘黄已经跟上来了。"],
  },
  刀宗: {
    welcome: ["横刀出鞘，先看破绽。"],
    click: ["破绽不是这么点出来的。"],
    drag: ["游风步会走，别硬拎。"],
  },
  北天药宗: {
    welcome: ["百草卷开，先看气色。"],
    click: ["别急，药性还没中和。"],
    drag: ["药箱会晃，慢点搬。"],
    petSwitch: ["药箱收好，换我来守。"],
  },
  衍天宗: {
    welcome: ["魂灯亮了，今日开盘。"],
    click: ["我算到你会手欠。"],
    drag: ["奇门乱位，先放我下来。"],
  },
  凌雪阁: {
    welcome: ["我在，别声张。"],
    click: ["别点，位置暴露了。"],
    drag: ["放手，我要回雪影里。"],
    petSwitch: ["交接无声，已到位。"],
  },
  蓬莱: {
    welcome: ["伞开了，海风也到了。"],
    click: ["风向乱了，别戳伞面。"],
    drag: ["我会荡伞，不会被拎。"],
  },
  霸刀: {
    welcome: ["双刀归鞘，人也归位。"],
    click: ["别戳，刀鞘很记仇。"],
    drag: ["这鞘很重，拖不动也正常。"],
  },
  长歌: {
    welcome: ["起调，桌面安静。"],
    click: ["别打断，我刚进拍子。"],
    drag: ["琴谱散了，咕咕也慌了。"],
  },
  苍云: {
    welcome: ["玄甲巡防，桌面安全。"],
    click: ["手令呢？没有就排队。"],
    drag: ["别拖，盾壳方向乱了。"],
  },
  丐帮: {
    welcome: ["君山开张，先来一口。"],
    click: ["轻点，我差一掌亢龙。"],
    drag: ["打狗棒不包邮，慢点搬。"],
    petSwitch: ["换人看摊，江湖继续。"],
  },
  明教: {
    welcome: ["日月初明，喵影潜行。"],
    click: ["谁把我隐身点掉了？"],
    drag: ["影子被你拽长了，喵。"],
  },
  唐门: {
    welcome: ["千机匣开，机关就位。"],
    click: ["手放远点，追命要瞄准。"],
    drag: ["零件掉了，田螺都急了。"],
  },
  五毒: {
    welcome: ["小虫到齐，蛊也睡醒了。"],
    click: ["它说别戳，会记仇。"],
    drag: ["虫虫搬家中，慢点走。"],
    petSwitch: ["小伙伴换岗，继续守着。"],
  },
  藏剑: {
    welcome: ["剑匣已开，叽叽上线。"],
    click: ["别急，我换把剑。"],
    drag: ["剑匣太重，叽不动了。"],
  },
  天策: {
    welcome: ["整队！桌面巡防开始。"],
    click: ["将令何在？没有就别戳。"],
    drag: ["被拖也要保持队形，汪。"],
  },
  纯阳: {
    welcome: ["气场已开，咩咩归位。"],
    click: ["贫道在挂机，气场别乱点。"],
    drag: ["生太极被你拖歪了。"],
    petSwitch: ["气场交接，稳住。"],
  },
  少林: {
    welcome: ["阿弥陀佛，桌面安稳。"],
    click: ["施主，手速很急。"],
    drag: ["坐垫被拖走，小灯泡也晃了。"],
  },
  七秀: {
    welcome: ["水袖一转，花瓣就位。"],
    click: ["别碰发型，也别乱点剑舞。"],
    drag: ["水袖要打结了，慢一点。"],
    petSwitch: ["换装完成，花瓣接力。"],
  },
  万花: {
    welcome: ["问诊开始，毛笔归位。"],
    click: ["别乱动，针会扎歪。"],
    drag: ["病历本散了，盆栽也倒了。"],
    petSwitch: ["病历交接，换我来看。"],
  },
};

const sectAliases: Record<string, string> = {
  毒灵: "五毒",
  秀太: "七秀",
  Snowfeather: "蓬莱",
  snowfeather: "蓬莱",
  星河菜菜子: "蓬莱",
  明月使: "明教",
  "mingyue-shi": "明教",
  Wanhua: "万花",
  wanhua: "万花",
  醋摆摆: "万花",
};

export const bubbleCharacterNames = Object.keys(linesByCharacter);
export const bubbleSectNames = Object.keys(linesBySect);

export function bubbleTextForPet(
  pet: PetOption | null,
  scene: BubbleScene,
  options: BubbleTextOptions = {},
): string {
  if (!isBubbleScene(scene)) {
    throw new Error(`Unsupported bubble scene: ${String(scene)}`);
  }

  const cadence = options.cadence ?? "normal";
  const lines = sceneLinesForPet(pet, scene, cadence);
  return selectBubbleLine(
    lines,
    `${pet?.id ?? "fallback"}:${scene}:${cadence}`,
    options.recentTexts,
    fallbackLines[scene][0],
  );
}

export function bubbleCharacterForPet(pet: PetOption | null): string | null {
  if (!pet) return null;
  const haystack = `${pet.displayName} ${pet.id}`.toLowerCase();
  const match = Object.entries(linesByCharacter).find(([, profile]) =>
    profile.aliases.some((alias) => haystack.includes(alias.toLowerCase())),
  );
  return match?.[0] ?? null;
}

export function bubbleSectForPet(pet: PetOption | null): string | null {
  if (!pet) return null;
  const haystack = `${pet.displayName} ${pet.id}`;

  for (const [alias, sect] of Object.entries(sectAliases)) {
    if (haystack.includes(alias)) return sect;
  }

  return bubbleSectNames.find((sect) => haystack.includes(sect)) ?? null;
}

function coreBubbleLines(lines: Record<string, unknown>): BubbleLines {
  const result: BubbleLines = {};
  for (const scene of bubbleScenes) {
    const values = lines[scene];
    if (!Array.isArray(values)) continue;
    const validLines = values.filter(
      (line): line is string => typeof line === "string" && line.trim().length > 0,
    );
    if (validLines.length > 0) result[scene] = validLines;
  }
  return result;
}

function isBubbleScene(value: unknown): value is BubbleScene {
  return typeof value === "string" && (bubbleScenes as readonly string[]).includes(value);
}

function linesForPet(pet: PetOption | null): BubbleLines {
  const manifestLines = coreBubbleLines(pet?.bubbleLines ?? {});
  const character = bubbleCharacterForPet(pet);
  if (character) return { ...linesByCharacter[character]?.lines, ...manifestLines };

  const sect = bubbleSectForPet(pet);
  return { ...(sect ? linesBySect[sect] : fallbackLines), ...manifestLines };
}

export function bubbleLinesForPet(pet: PetOption | null): RequiredBubbleLines {
  const lines = linesForPet(pet);
  return Object.fromEntries(
    bubbleScenes.map((scene) => [scene, lines[scene] ?? fallbackLines[scene]]),
  ) as RequiredBubbleLines;
}

function sceneLinesForPet(
  pet: PetOption | null,
  scene: BubbleScene,
  cadence: BubbleCadence,
): string[] {
  const lines = linesForPet(pet);
  const baseLines = lines[scene] ?? fallbackLines[scene];
  const cadenceSpecific = cadenceLines[cadence][scene] ?? [];

  if (cadence === "quiet") {
    return cadenceSpecific.length > 0 ? cadenceSpecific : baseLines.slice(0, 1);
  }

  if (cadence === "lively") {
    return [...baseLines, ...cadenceSpecific];
  }

  return baseLines;
}

export function selectBubbleLine(
  lines: readonly string[],
  seed: string,
  recentTexts: readonly string[] = [],
  fallbackText = "",
): string {
  const pool = lines.length > 0 ? [...lines] : fallbackText ? [fallbackText] : [];
  if (pool.length === 0) return "";

  const startIndex = hashString(seed) % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const line = pool[(startIndex + offset) % pool.length];
    if (!recentTexts.includes(line)) return line;
  }

  return pool[startIndex];
}

export function addRecentBubbleText(
  recentTexts: readonly string[],
  text: string,
  limit = 4,
): string[] {
  if (limit <= 0 || text.length === 0) return [];
  return [text, ...recentTexts.filter((recent) => recent !== text)].slice(0, limit);
}

export function bubbleCooldownMultiplierForCadence(cadence: BubbleCadence): number {
  if (cadence === "quiet") return 1.6;
  if (cadence === "lively") return 0.75;
  return 1;
}

function hashString(seed: string): number {
  return Array.from(seed).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
}
