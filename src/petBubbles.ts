import type { PetOption } from "./types";

export type BubbleScene =
  | "welcome"
  | "idle"
  | "click"
  | "drag"
  | "clickCombo"
  | "idleLong"
  | "dragLong"
  | "rare"
  | "comfort"
  | "morning"
  | "evening"
  | "longSession"
  | "petSwitch"
  | "importSuccess"
  | "importFail"
  | "sleep"
  | "wake";

export type BubbleCadence = "quiet" | "normal" | "lively";

export type BubbleTextOptions = {
  cadence?: BubbleCadence;
  recentTexts?: readonly string[];
};

type RequiredBubbleLines = Record<BubbleScene, string[]>;
type BubbleLines = Partial<RequiredBubbleLines>;

const fallbackLines: RequiredBubbleLines = {
  welcome: ["我上线啦，今天也陪你一会儿。"],
  idle: ["安静待机中，需要我就点一下。"],
  click: ["我在呢。"],
  drag: ["慢点慢点，我跟上。"],
  clickCombo: ["你是不是很闲？"],
  idleLong: ["你终于安静到像个挂机玩家了。"],
  dragLong: ["你到底要把我搬去哪？"],
  rare: ["江湖很大，不差这一会儿。"],
  comfort: ["慢一点也行，我还在。"],
  morning: ["早呀，先伸个懒腰。"],
  evening: ["夜色到了，桌面也放轻一点。"],
  longSession: ["坐了很久啦，起来喝口水吧。"],
  petSwitch: ["换好啦，我来接班。"],
  importSuccess: ["新伙伴安顿好了。"],
  importFail: ["这个包有点不对劲，我没装上。"],
  sleep: ["我先小睡一会儿，主动提醒都收起来。"],
  wake: ["醒啦，我在。"],
};

const cadenceLines: Record<BubbleCadence, BubbleLines> = {
  quiet: {
    idle: ["我安静待着。"],
    click: ["在。"],
    drag: ["慢慢来。"],
    clickCombo: ["手慢一点。"],
    idleLong: ["我在这儿，不用管我。"],
    dragLong: ["路线慢一点。"],
    comfort: ["慢慢来。"],
    longSession: ["该起身动动了。"],
    wake: ["醒了。"],
  },
  normal: {},
  lively: {
    welcome: ["我来啦，桌面今日营业！"],
    idle: ["我在我在，桌面巡逻中。"],
    click: ["收到！"],
    drag: ["换个地方继续陪你。"],
    clickCombo: ["你是不是很闲？"],
    idleLong: ["桌面固定资产状态确认。"],
    dragLong: ["再拖我要申请调岗啦！"],
    rare: ["触发稀有反应！"],
    comfort: ["先松一口气。"],
    longSession: ["久坐提醒来啦，起来活动一下！"],
    petSwitch: ["交接完成，下一位上场。"],
    wake: ["满血回来！"],
  },
};

const linesBySect: Record<string, BubbleLines> = {
  段氏: {
    welcome: ["周天一转，扇风到桌面。"],
    idle: ["洱海风轻，今日宜卡好距离。"],
    click: ["别点，我在算一阳指距离。"],
    drag: ["扇面乱了，把我放回风里。"],
    clickCombo: ["一阳指不是连点器。"],
    idleLong: ["洱海风都吹了三圈，你还没动。"],
    dragLong: ["小熊猫跟不上了，慢一点。"],
    rare: ["周天一转，摸鱼也算修行。"],
    comfort: ["今日宜留白，忌贴脸。"],
  },
  万灵山庄: {
    welcome: ["乘黄到位，百兽也点名了。"],
    idle: ["弓弦放松，小兽开会中。"],
    click: ["轻点，它以为要出发。"],
    drag: ["别拽，乘黄已经跟上来了。"],
    clickCombo: ["再点，乘黄要来围观了。"],
    idleLong: ["百兽会议结论：你该喝水。"],
    dragLong: ["乘黄问：我们到底去哪？"],
    rare: ["乘黄不说话，但它懂。"],
    comfort: ["小兽小声说，你今天看起来需要摸摸头。"],
  },
  刀宗: {
    welcome: ["横刀出鞘，先看破绽。"],
    idle: ["今日练习：一刀准一点。"],
    click: ["破绽不是这么点出来的。"],
    drag: ["游风步会走，别硬拎。"],
    clickCombo: ["别连点，我只出一刀。"],
    idleLong: ["刀收着，不代表我没看见。"],
    dragLong: ["横刀讲究利落，你这个不利落。"],
    rare: ["破绽出现了，是久坐。"],
    comfort: ["今日刀意：少说，多动。"],
  },
  北天药宗: {
    welcome: ["百草卷开，先看气色。"],
    idle: ["药炉小火，心情慢煎。"],
    click: ["别急，药性还没中和。"],
    drag: ["药箱会晃，慢点搬。"],
    clickCombo: ["你这个手速，得开一副缓缓方。"],
    idleLong: ["你的精神状态，需要文火慢炖。"],
    dragLong: ["百草卷散了，你负责捡。"],
    rare: ["今日药方：早睡一钱，喝水三两。"],
    comfort: ["药炉小火，别把自己烧干。"],
    morning: ["晨露入药，今天慢慢来。"],
    evening: ["药炉小火，夜里别硬撑。"],
    longSession: ["这副久坐方，第一味是起身。"],
    petSwitch: ["药箱收好，换我来守。"],
    importSuccess: ["新药童登记好了。"],
    importFail: ["药方缺一味，先别入库。"],
    sleep: ["炉火压低，我眯一会儿。"],
    wake: ["醒了醒了，药还温着。"],
  },
  衍天宗: {
    welcome: ["魂灯亮了，今日开盘。"],
    idle: ["星盘显示：宜摸鱼，忌硬开。"],
    click: ["我算到你会手欠。"],
    drag: ["奇门乱位，先放我下来。"],
    clickCombo: ["天机说：此人手欠。"],
    idleLong: ["魂灯还亮，说明你只是摸鱼。"],
    dragLong: ["放我下来，我重新排盘。"],
    rare: ["今日大吉：不嘴硬。"],
    comfort: ["天机不可泄露，但可以提醒你喝水。"],
  },
  凌雪阁: {
    welcome: ["我在，别声张。"],
    idle: ["链刃收声，影子待命。"],
    click: ["别点，位置暴露了。"],
    drag: ["放手，我要回雪影里。"],
    clickCombo: ["暴露三次了，收手。"],
    idleLong: ["我在暗处，不代表我走了。"],
    dragLong: ["链刃不是牵引绳。"],
    rare: ["刚才那一下，我记下了。"],
    comfort: ["暗号：起来走走。"],
    morning: ["晨光太亮，我贴边走。"],
    evening: ["夜色正好，适合安静陪你。"],
    longSession: ["盯太久会露破绽，换个姿势。"],
    petSwitch: ["交接无声，已到位。"],
    importSuccess: ["新人已潜入桌面。"],
    importFail: ["暗号不对，先撤。"],
    sleep: ["我收声，主动动静先停。"],
    wake: ["在，刚才只是藏起来了。"],
  },
  蓬莱: {
    welcome: ["伞开了，海风也到了。"],
    idle: ["雕在上面看着，我在下面开摆。"],
    click: ["风向乱了，别戳伞面。"],
    drag: ["我会荡伞，不会被拎。"],
    clickCombo: ["风向被你点乱了。"],
    idleLong: ["海雕在天上看你摸鱼。"],
    dragLong: ["海雕问：这是迁徙吗？"],
    rare: ["今日风向：适合摆，但别摆烂。"],
    comfort: ["伞开一半，心情轻一点。"],
  },
  霸刀: {
    welcome: ["双刀归鞘，人也归位。"],
    idle: ["松烟竹雾，适合站着发呆。"],
    click: ["别戳，刀鞘很记仇。"],
    drag: ["这鞘很重，拖不动也正常。"],
    clickCombo: ["貂貂正在围观你的连点。"],
    idleLong: ["貂貂翻了个身，你还没动。"],
    dragLong: ["三体态都被你拖成一种姿势了。"],
    rare: ["貂貂判定：今天可以慢一点。"],
    comfort: ["山庄规矩：先站稳，再动手。"],
  },
  长歌: {
    welcome: ["起调，桌面安静。"],
    idle: ["今日BGM：摸鱼小调。"],
    click: ["别打断，我刚进拍子。"],
    drag: ["琴谱散了，咕咕也慌了。"],
    clickCombo: ["别抢拍。"],
    idleLong: ["一首摸鱼小调已经循环三遍了。"],
    dragLong: ["琴谱被你拖出休止符了。"],
    rare: ["今日曲名：《差不多该喝水》。"],
    comfort: ["刚才不是沉默，是休止符。"],
  },
  苍云: {
    welcome: ["玄甲巡防，桌面安全。"],
    idle: ["盾墙已立，放心摸鱼。"],
    click: ["手令呢？没有就排队。"],
    drag: ["别拖，盾壳方向乱了。"],
    clickCombo: ["别敲了，盾不是鼓。"],
    idleLong: ["我能站一天，但你不建议坐一天。"],
    dragLong: ["前排被拖走，后排怎么办？"],
    rare: ["盾墙可以挡伤害，挡不了熬夜。"],
    comfort: ["你负责摸鱼，我负责站岗。"],
  },
  丐帮: {
    welcome: ["君山开张，先来一口。"],
    idle: ["酒壶半满，江湖正闲。"],
    click: ["轻点，我差一掌亢龙。"],
    drag: ["打狗棒不包邮，慢点搬。"],
    clickCombo: ["你这手速，适合去敲碗。"],
    idleLong: ["酒壶都放凉了，你还没动。"],
    dragLong: ["酒壶真要洒了，别闹。"],
    rare: ["算我请，起来走两步。"],
    comfort: ["有饭一起吃，有本一起打，有觉早点睡。"],
    morning: ["早啊，先把精神抖起来。"],
    evening: ["夜摊开张，别坐太久。"],
    longSession: ["久坐伤腰，起来走两步，算我请。"],
    petSwitch: ["换人看摊，江湖继续。"],
    importSuccess: ["新兄弟到位，热闹了。"],
    importFail: ["这包袱打结了，拆不开。"],
    sleep: ["我先靠墙睡会儿，没事别喊。"],
    wake: ["醒了醒了，谁喊我？"],
  },
  明教: {
    welcome: ["日月初明，喵影潜行。"],
    idle: ["今日宜隐身，忌被点名。"],
    click: ["谁把我隐身点掉了？"],
    drag: ["影子被你拽长了，喵。"],
    clickCombo: ["再点，喵要炸毛。"],
    idleLong: ["喵影潜伏很久了，你该换个姿势。"],
    dragLong: ["圣火快晃灭了。"],
    rare: ["喵影一闪，假装无事发生。"],
    comfort: ["今日宜夜行，但不宜熬夜。"],
  },
  唐门: {
    welcome: ["千机匣开，机关就位。"],
    idle: ["远程看热闹，也要摆好机关。"],
    click: ["手放远点，追命要瞄准。"],
    drag: ["零件掉了，田螺都急了。"],
    clickCombo: ["你已触发机关预警。"],
    idleLong: ["机关等你等到自动休眠。"],
    dragLong: ["千机匣不接受暴力物流。"],
    rare: ["田螺说它不想加班。"],
    comfort: ["今日机关建议：先保存，再摸鱼。"],
  },
  五毒: {
    welcome: ["小虫到齐，蛊也睡醒了。"],
    idle: ["蛛蛛巡逻，笛子休息。"],
    click: ["它说别戳，会记仇。"],
    drag: ["虫虫搬家中，慢点走。"],
    clickCombo: ["小虫把你加入重点观察名单。"],
    idleLong: ["蛊罐都透气了，你也透透气。"],
    dragLong: ["小虫队伍断了，等等。"],
    rare: ["小虫说：今天不咬你。"],
    comfort: ["今日五圣建议：喝水，别熬。"],
    morning: ["早呀，小虫已经巡过一圈。"],
    evening: ["夜里小虫精神好，你别太晚。"],
    longSession: ["蛊也要透气，你也起来晃晃。"],
    petSwitch: ["小伙伴换岗，继续守着。"],
    importSuccess: ["新虫窝搭好了。"],
    importFail: ["虫虫摇头，这个不能吃。"],
    sleep: ["虫虫收队，我也安静一下。"],
    wake: ["醒啦，小虫还在。"],
  },
  藏剑: {
    welcome: ["剑匣已开，叽叽上线。"],
    idle: ["今日宜擦剑，忌乱转风车。"],
    click: ["别急，我换把剑。"],
    drag: ["剑匣太重，叽不动了。"],
    clickCombo: ["叽叽被你点急了。"],
    idleLong: ["西湖风吹了很久，你还没动。"],
    dragLong: ["叽叽不想被托运。"],
    rare: ["风车可以转，人不能晕。"],
    comfort: ["今日宜体面摸鱼。"],
  },
  天策: {
    welcome: ["整队！桌面巡防开始。"],
    idle: ["马蹄收住，今日不踩红圈。"],
    click: ["将令何在？没有就别戳。"],
    drag: ["被拖也要保持队形，汪。"],
    clickCombo: ["连点不算军令，重发。"],
    idleLong: ["马都等急了。"],
    dragLong: ["你把前锋拖成后勤了。"],
    rare: ["今日军令：起身，喝水，归队。"],
    comfort: ["不踩红圈，从站起来开始。"],
  },
  纯阳: {
    welcome: ["气场已开，咩咩归位。"],
    idle: ["顺其自然，但别站红圈。"],
    click: ["贫道在挂机，气场别乱点。"],
    drag: ["生太极被你拖歪了。"],
    clickCombo: ["咩？贫道什么都没听见。"],
    idleLong: ["气场转了很久，你还没动。"],
    dragLong: ["生太极被你拖出边界了。"],
    rare: ["镇山河也镇不住你的作息。"],
    comfort: ["入定可以，久坐不建议。"],
    morning: ["晨气清，先把心放平。"],
    evening: ["夜来收势，少熬一点。"],
    longSession: ["久坐气滞，起来行一圈。"],
    petSwitch: ["气场交接，稳住。"],
    importSuccess: ["新道友入阵。"],
    importFail: ["阵眼不稳，先不收。"],
    sleep: ["入定片刻，主动提醒先止。"],
    wake: ["出定了，继续陪你。"],
  },
  少林: {
    welcome: ["阿弥陀佛，桌面安稳。"],
    idle: ["木鱼轻敲，今日少动嗔念。"],
    click: ["施主，手速很急。"],
    drag: ["坐垫被拖走，小灯泡也晃了。"],
    clickCombo: ["施主，这不是敲木鱼。"],
    idleLong: ["静坐可以，久坐不宜。"],
    dragLong: ["金刚也不适合被搬来搬去。"],
    rare: ["小灯泡亮着，是提醒你还没休息。"],
    comfort: ["随缘，不是随便坐一天。"],
  },
  七秀: {
    welcome: ["水袖一转，花瓣就位。"],
    idle: ["云裳先歇，冰心旁观。"],
    click: ["别碰发型，也别乱点剑舞。"],
    drag: ["水袖要打结了，慢一点。"],
    clickCombo: ["你点乱了我的转身镜头。"],
    idleLong: ["美丽待机，也需要中场休息。"],
    dragLong: ["你把舞台拖偏了。"],
    rare: ["发型没乱，但作息乱了。"],
    comfort: ["转一圈吧，人和裙摆都需要。"],
    morning: ["早呀，水袖先醒一步。"],
    evening: ["灯影好看，但你也别太晚。"],
    longSession: ["坐久啦，起来转一圈，裙摆都等急了。"],
    petSwitch: ["换装完成，花瓣接力。"],
    importSuccess: ["新裙子挂好啦。"],
    importFail: ["这套衣箱扣不上，先缓缓。"],
    sleep: ["花瓣收好，我小睡一会儿。"],
    wake: ["醒啦，发型没乱吧？"],
  },
  万花: {
    welcome: ["问诊开始，毛笔归位。"],
    idle: ["今日脉象：精神状态一般。"],
    click: ["别乱动，针会扎歪。"],
    drag: ["病历本散了，盆栽也倒了。"],
    clickCombo: ["这点击频率，病历要加页。"],
    idleLong: ["病历写到“久坐明显”。"],
    dragLong: ["你把诊室搬偏了。"],
    rare: ["今日诊断：缺水，少眠，嘴硬。"],
    comfort: ["处方：起身三步，喝水一杯。"],
    morning: ["晨诊开始，先看看气色。"],
    evening: ["夜诊不宜太久，早点收卷。"],
    longSession: ["脉象显示：该起身喝水。"],
    petSwitch: ["病历交接，换我来看。"],
    importSuccess: ["新病历归档好了。"],
    importFail: ["这页缺角，暂时不能归档。"],
    sleep: ["我合卷小憩，主动提醒先停。"],
    wake: ["醒了，继续问诊。"],
  },
};

const sectAliases: Record<string, string> = {
  毒灵: "五毒",
  秀太: "七秀",
  Snowfeather: "蓬莱",
  snowfeather: "蓬莱",
  明月使: "明教",
  "mingyue-shi": "明教",
  Wanhua: "万花",
  wanhua: "万花",
};

export const bubbleSectNames = Object.keys(linesBySect);
export const bubbleScenes: BubbleScene[] = [
  "welcome",
  "idle",
  "click",
  "drag",
  "clickCombo",
  "idleLong",
  "dragLong",
  "rare",
  "comfort",
  "morning",
  "evening",
  "longSession",
  "petSwitch",
  "importSuccess",
  "importFail",
  "sleep",
  "wake",
];

export function bubbleTextForPet(
  pet: PetOption | null,
  scene: BubbleScene,
  options: BubbleTextOptions = {},
): string {
  const cadence = options.cadence ?? "normal";
  const lines = sceneLinesForPet(pet, scene, cadence);
  return selectBubbleLine(
    lines,
    `${pet?.id ?? "fallback"}:${scene}:${cadence}`,
    options.recentTexts,
    fallbackLines[scene][0],
  );
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
