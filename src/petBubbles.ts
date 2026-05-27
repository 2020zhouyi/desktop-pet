import type { PetOption } from "./types";

export type BubbleScene = "welcome" | "idle" | "click" | "drag";

type BubbleLines = Record<BubbleScene, string[]>;

const fallbackLines: BubbleLines = {
  welcome: ["我上线啦，今天也陪你一会儿。"],
  idle: ["安静待机中，需要我就点一下。"],
  click: ["我在呢。"],
  drag: ["慢点慢点，我跟上。"],
};

const linesBySect: Record<string, BubbleLines> = {
  段氏: {
    welcome: ["扇面开，桌面有风。"],
    idle: ["洱海风起，适合摸鱼。"],
    click: ["别点，我在算距离。"],
    drag: ["君子动口不动手……把我放回去。"],
  },
  万灵山庄: {
    welcome: ["小兽到齐，桌面安全。"],
    idle: ["别吵，我在和小兽开会。"],
    click: ["它说你吓到它了。"],
    drag: ["小伙伴们，跟上搬家。"],
  },
  刀宗: {
    welcome: ["出刀之前，先开机。"],
    idle: ["今天只练一件事：别倒。"],
    click: ["出招前先报招？"],
    drag: ["别拎，我自己会走。"],
  },
  北天药宗: {
    welcome: ["药炉已热，情绪待煎。"],
    idle: ["别急，情绪先煎三碗。"],
    click: ["别点，先喝药。"],
    drag: ["药罐要洒了，慢点！"],
  },
  衍天宗: {
    welcome: ["星盘已开，今日宜谨慎。"],
    idle: ["今日宜摸鱼，忌嘴硬开荒。"],
    click: ["我算到你会点我。"],
    drag: ["卦象失控，先放手。"],
  },
  凌雪阁: {
    welcome: ["我在，不必声张。"],
    idle: ["低调，是我的置顶模式。"],
    click: ["别点，暴露了。"],
    drag: ["放手，我要回阴影里。"],
  },
  蓬莱: {
    welcome: ["海风上线，心情轻一点。"],
    idle: ["今日海风适合开摆。"],
    click: ["风向不对，别点。"],
    drag: ["我会飞，不会被拎。"],
  },
  霸刀: {
    welcome: ["刀在，人也在。"],
    idle: ["能站着，就不算躺。"],
    click: ["有事说事，别戳刀。"],
    drag: ["刀鞘很重，别拖。"],
  },
  长歌: {
    welcome: ["起调，桌面安静。"],
    idle: ["今日BGM：摸鱼小调。"],
    click: ["别打断，我刚起调。"],
    drag: ["琴谱散了，等等！"],
  },
  苍云: {
    welcome: ["巡逻开始，桌面安全。"],
    idle: ["别怕，我在前排。"],
    click: ["手令呢？"],
    drag: ["盾还在，别拖太远。"],
  },
  丐帮: {
    welcome: ["江湖开张，先来一口。"],
    idle: ["义气先行，桌面开张。"],
    click: ["先喝一口再说。"],
    drag: ["君山岛不包邮！"],
  },
  明教: {
    welcome: ["日月初明，潜伏开始。"],
    idle: ["今日宜夜行，忌被点名。"],
    click: ["谁点亮我了？"],
    drag: ["影子被你拽长了。"],
  },
  唐门: {
    welcome: ["机关已部署，别乱走。"],
    idle: ["远程看热闹，也是一门艺术。"],
    click: ["手请放远一点。"],
    drag: ["零件掉了，赔！"],
  },
  五毒: {
    welcome: ["小虫到齐，今日平安。"],
    idle: ["今天蛛蛛心情不错。"],
    click: ["它说别戳。"],
    drag: ["虫虫搬家中，慢点。"],
  },
  藏剑: {
    welcome: ["剑匣已开，体面上线。"],
    idle: ["今日宜擦剑，忌乱点。"],
    click: ["别急，我换把剑。"],
    drag: ["剑匣太重，拖不动。"],
  },
  天策: {
    welcome: ["整队！桌面巡防开始。"],
    idle: ["今日训练：不踩红圈。"],
    click: ["将令何在？"],
    drag: ["被拖也要保持队形。"],
  },
  纯阳: {
    welcome: ["气场已开，心先静。"],
    idle: ["顺其自然，但别站红圈。"],
    click: ["贫道在挂机。"],
    drag: ["气场被你拖歪了。"],
  },
  少林: {
    welcome: ["阿弥陀佛，桌面安稳。"],
    idle: ["随缘，但不是随便躺。"],
    click: ["施主，手速很急。"],
    drag: ["坐垫被拖走了。"],
  },
  七秀: {
    welcome: ["转身上线，花瓣就位。"],
    idle: ["花瓣就位，美丽且困。"],
    click: ["别碰发型。"],
    drag: ["水袖要打结了。"],
  },
  万花: {
    welcome: ["问诊开始，桌面请安静。"],
    idle: ["今日问诊：精神状态不佳。"],
    click: ["别乱动，扎歪了。"],
    drag: ["病历本散了，等等。"],
  },
};

const sectAliases: Record<string, string> = {
  毒灵: "五毒",
  秀太: "七秀",
  Wanhua: "万花",
  wanhua: "万花",
};

export const bubbleSectNames = Object.keys(linesBySect);
export const bubbleScenes: BubbleScene[] = ["welcome", "idle", "click", "drag"];

export function bubbleTextForPet(pet: PetOption | null, scene: BubbleScene): string {
  const lines = linesForPet(pet);
  return chooseLine(lines[scene] ?? fallbackLines[scene], pet?.id ?? "fallback", scene);
}

export function bubbleSectForPet(pet: PetOption | null): string | null {
  if (!pet) return null;
  const haystack = `${pet.displayName} ${pet.id}`;

  for (const [alias, sect] of Object.entries(sectAliases)) {
    if (haystack.includes(alias)) return sect;
  }

  return bubbleSectNames.find((sect) => haystack.includes(sect)) ?? null;
}

function linesForPet(pet: PetOption | null): BubbleLines {
  const sect = bubbleSectForPet(pet);
  return sect ? linesBySect[sect] : fallbackLines;
}

function chooseLine(lines: string[], petId: string, scene: BubbleScene): string {
  if (lines.length === 0) return fallbackLines[scene][0];
  const hash = Array.from(`${petId}:${scene}`).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
  return lines[hash % lines.length];
}
