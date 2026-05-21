import type { DailyStatusSkin, MenpaiId } from "./types";

const sharedGoodFor = ["轻点戳", "看风向", "收拾桌面", "慢慢开工"];
const sharedAvoid = ["过度弹窗", "强度暗示", "乱用图标"];

export const dailyStatusSkins: DailyStatusSkin[] = [
  skin("duanshi", "段氏", "小熊猫", "red-panda", "扇", ["小熊猫摇扇", "竹影翻肚", "洱海醒风"], ["风大，先把扇子打开。", "今天先听水声。", "竹叶动了，心也稳了。", "我翻个肚，马上就好。", "慢慢来，洱海不催。", "扇子一开，江湖见面。"], "#A94B3B", "#2E7D7A", "#D7A64A", "#F6EEE7", ["折扇", "竹叶", "水纹"]),
  skin("wanling", "万灵山庄", "乘黄", "mythic-deer", "灵", ["乘黄巡林", "百兽靠近", "鹰影听风"], ["今天万物有灵，先听风。", "林子醒了，我也醒了。", "别急，兽群会带路。", "树影说今天不错。", "轻一点，别惊动叶子。", "我闻到一点好消息。"], "#3D7152", "#9E7A3F", "#D6B154", "#F0F4EA", ["叶片", "兽爪", "弓弦"]),
  skin("daozong", "刀宗", "鹦鹉", "parrot", "刀", ["鹦鹉试刃", "孤锋歇羽", "海风醒刀"], ["话不多，先把刀擦亮。", "海风正好，适合收锋。", "我只重复重要的话。", "羽毛不乱，刀也不乱。", "今天锋口很安静。", "先别催，我在看刃。"], "#2D3D4D", "#8B3431", "#C6B8A2", "#EEF0F0", ["横刀", "海浪", "羽毛"]),
  skin("beitian-yaozong", "北天药宗", "狍子", "roe-deer", "狍", ["狍狍采草", "雪地发呆", "百草回春"], ["别急，我先闻闻这味药。", "雪有点凉，草刚刚好。", "我发会儿呆就懂了。", "药签轻轻响了一下。", "今日宜温一点。", "草叶说先休息一下。"], "#789B86", "#A97B45", "#E2C982", "#F3F2E8", ["草药", "雪粒", "药签"]),
  skin("yantian", "衍天宗", "幻狐", "fox", "狐", ["幻狐观星", "魂灯微亮", "天机打盹"], ["卦象说，今天宜从心。", "星盘转到小吉处。", "我看见一点亮光。", "天机困了，别追问。", "魂灯稳着呢。", "先听心，再落子。"], "#263A59", "#6E5AA6", "#D4B25C", "#EEF0F7", ["星盘", "魂灯", "符线"]),
  skin("lingxue", "凌雪阁", "雪豹", "leopard", "豹", ["雪豹潜行", "黑影收爪", "链刃静伏"], ["我在，只是不想出声。", "雪痕很浅，刚刚好。", "今天适合安静出手。", "爪子收好了。", "风声归我，动静归你。", "别找，我就在旁边。"], "#23272F", "#8F2434", "#C8D6DE", "#EEF2F4", ["链刃", "雪痕", "暗纹"]),
  skin("penglai", "蓬莱", "海獭", "otter", "獭", ["海獭抱伞", "海雕借风", "浪花打盹"], ["风向不错，适合轻轻飘走。", "伞骨响了一声。", "浪花今天很乖。", "我抱着伞看一会儿。", "海风替你开路。", "今天宜顺风。"], "#2D7B88", "#B99052", "#E3F0F0", "#EDF6F5", ["伞骨", "海浪", "贝壳"]),
  skin("badao", "霸刀", "闪电貂", "ferret", "貂", ["貂貂抱刀", "太行立雪", "双刀磨爪"], ["刀先放这，谁动谁知道。", "貂爪今天很稳。", "雪落下来，也不急。", "抱刀睡会儿。", "今日宜硬气一点。", "我看着呢。"], "#534A42", "#A23C2F", "#C9A45B", "#F3EEE7", ["刀鞘", "山石", "貂爪"]),
  skin("changge", "长歌", "咕咕", "songbird", "咕", ["咕咕调弦", "鹿鸣入曲", "千岛听雨"], ["今天的弦，听起来有点想摸鱼。", "咕一下，调准了。", "雨声很合拍。", "琴弦不急，人也不急。", "我听见一点轻快。", "这一拍留给你。"], "#5D7FA2", "#8A6B9D", "#D7C59A", "#EEF3F6", ["琴弦", "书页", "湖波"]),
  skin("cangyun", "苍云", "盾龟", "turtle", "盾", ["铁龟举盾", "玄甲打盹", "盾背晒阳"], ["我先举盾，你慢慢来。", "盾背今天很暖。", "风沙过来，我挡着。", "玄甲睡醒了。", "先稳住，再动身。", "别慌，阵还在。"], "#3F4B55", "#8B2E2E", "#B7BEC4", "#F0F1F1", ["盾纹", "甲片", "雪沙"]),
  skin("gaibang", "丐帮", "小隼", "falcon", "隼", ["小隼巡酒", "竹杖赶风", "葫芦醒神"], ["有事先喝口水，没事也喝。", "竹杖敲了个好节奏。", "小隼绕桌一圈。", "今天风里有酒香。", "先松快，再出门。", "葫芦说可以。"], "#8B5B32", "#2F6B56", "#D8A744", "#F5EFE5", ["酒葫芦", "竹杖", "羽痕"]),
  skin("mingjiao", "明教", "夜喵", "cat", "喵", ["夜喵伏光", "沙海伸懒", "日月瞳开"], ["我没消失，我只是躲起来了。", "日月光刚刚好。", "沙子很暖，适合伸懒腰。", "喵一下就出手。", "暗处也能看清路。", "别眨眼，我会出现。"], "#4A2F66", "#B95D37", "#D5B45C", "#F4EEF4", ["日月", "沙纹", "猫爪"]),
  skin("tangmen", "唐门", "机关猪", "pig", "机", ["机关猪巡逻", "铜铃打盹", "机括咔哒"], ["别碰那个机关，真的。", "咔哒一声，状态好了。", "铜钉今天很亮。", "机关猪巡到桌边。", "我先检查一下安全。", "小心，别乱按。"], "#37516B", "#8A5B35", "#C9A45F", "#EEF2F5", ["齿轮", "弩箭", "铜钉"]),
  skin("wudu", "五毒", "孔雀", "peacock", "蛊", ["孔雀收尾", "蛊虫排队", "苗银摇亮"], ["好看归好看，别乱摸。", "银饰响得很轻。", "小虫排队经过。", "孔雀尾巴收好了。", "今天宜漂亮一点。", "放心，毒也有分寸。"], "#2E8A73", "#6E4B95", "#D6C36B", "#EFF5EF", ["孔雀羽", "苗银", "虫纹"]),
  skin("cangjian", "藏剑", "小黄鸡", "chick", "叽", ["黄叽晒剑", "西湖扑扑", "重剑压羽"], ["剑很重，但我很会扑腾。", "黄叽晒到太阳了。", "西湖风轻轻吹。", "羽毛压住，剑也压住。", "今天先扑腾两下。", "轻剑快，心情也快。"], "#D3A21C", "#426F5A", "#F0D26A", "#F8F2D7", ["剑穗", "西湖水", "鸡爪印"]),
  skin("tiance", "天策", "幼狼", "wolf", "狼", ["幼狼巡营", "东都醒早", "马蹄催风"], ["集合！我先替你站岗。", "营旗动了，可以出发。", "幼狼绕了一圈。", "马蹄声很稳。", "今天适合早一点。", "枪缨已经精神了。"], "#A33D31", "#333D48", "#D8C4A5", "#F4ECE7", ["枪缨", "马蹄", "营旗"]),
  skin("chunyang", "纯阳", "小羊", "sheep", "咩", ["小羊坐云", "仙鹤拂雪", "气场咩开"], ["莫急，气场会自己转。", "云坐稳了。", "今天宜清静，不宜乱戳。", "雪粒轻轻落下。", "咩一下，心就顺了。", "先站进气场里。"], "#E9ECEF", "#4F718A", "#C6A96A", "#F6F7F2", ["云纹", "太极", "雪粒"]),
  skin("shaolin", "少林", "灵猴", "monkey", "猴", ["灵猴敲木鱼", "禅心打盹", "棍影收圆"], ["先静心，再动手。", "木鱼敲得刚刚好。", "灵猴坐得很稳。", "今天少说，多稳。", "棍影收住了。", "一呼一吸，江湖安静。"], "#B88742", "#6A4A2C", "#D8C079", "#F5F0E4", ["木鱼", "莲纹", "棍影"]),
  skin("qixiu", "七秀", "垂耳兔", "rabbit", "兔", ["垂兔转袖", "湖心轻跳", "绣球贴贴"], ["别戳耳朵，袖子会乱。", "兔耳听见风了。", "水袖绕了一圈。", "湖心亮了一下。", "今天宜轻轻贴贴。", "花瓣落得很准。"], "#E58A9F", "#6D9DBA", "#F2D6E0", "#FFF0F4", ["水袖", "花瓣", "兔耳"]),
  skin("wanhua", "万花", "松鼠", "squirrel", "花", ["松鼠抱笔", "盆栽开花", "青岩闻药"], ["先写病历，再说你没事。", "松鼠抱住了笔。", "盆栽今天有精神。", "草药味很安心。", "先观察，再下结论。", "坚果和墨都备好了。"], "#5C7F52", "#394B3E", "#C6965B", "#F0F4EA", ["毛笔", "草药", "坚果"]),
];

export const defaultMenpai: MenpaiId = "qixiu";

const skinByMenpai = new Map(dailyStatusSkins.map((skinItem) => [skinItem.menpai, skinItem]));

export function dailyStatusSkinForMenpai(menpai: MenpaiId): DailyStatusSkin {
  return skinByMenpai.get(menpai) ?? skinByMenpai.get(defaultMenpai)!;
}

export function inferMenpaiForPetId(petId: string, displayName = ""): MenpaiId {
  const raw = `${petId} ${displayName}`.toLowerCase();
  const match = menpaiMatchers.find(([pattern]) => pattern.test(raw));
  return match?.[1] ?? defaultMenpai;
}

function skin(
  menpai: MenpaiId,
  displayName: string,
  animalAnchor: string,
  mascot: DailyStatusSkin["mascot"],
  glyph: string,
  titlePool: string[],
  linePool: string[],
  primary: string,
  secondary: string,
  accent: string,
  paper: string,
  motifs: string[],
): DailyStatusSkin {
  return {
    skinId: `daily-skin-${menpai}-v1`,
    skinVersion: "v1",
    menpai,
    displayName,
    animalAnchor,
    mascot,
    glyph,
    colors: {
      primary,
      secondary,
      accent,
      paper,
      ink: "#352A22",
    },
    motifs,
    titlePool,
    linePool,
    goodForPool: sharedGoodFor,
    avoidPool: sharedAvoid,
  };
}

const menpaiMatchers: Array<[RegExp, MenpaiId]> = [
  [/6bb5|段氏|duanshi/, "duanshi"],
  [/4e07-u7075|万灵|wanling/, "wanling"],
  [/5200-u5b97|刀宗|daozong/, "daozong"],
  [/5317-u5929-u836f|药宗|yaozong/, "beitian-yaozong"],
  [/884d-u5929|衍天|yantian/, "yantian"],
  [/51cc-u96ea|凌雪|lingxue/, "lingxue"],
  [/84ec-u83b1|蓬莱|penglai/, "penglai"],
  [/9738-u5200|霸刀|badao/, "badao"],
  [/957f-u6b4c|长歌|changge/, "changge"],
  [/82cd-u4e91|苍云|cangyun/, "cangyun"],
  [/4e10-u5e2e|丐帮|gaibang/, "gaibang"],
  [/660e-u6559|明教|mingjiao/, "mingjiao"],
  [/5510-u95e8|唐门|tangmen/, "tangmen"],
  [/4e94-u6bd2|五毒|wudu/, "wudu"],
  [/85cf-u5251|藏剑|cangjian/, "cangjian"],
  [/5929-u7b56|天策|tiance/, "tiance"],
  [/7eaf-u9633|纯阳|chunyang/, "chunyang"],
  [/5c11-u6797|少林|shaolin/, "shaolin"],
  [/4e03-u79c0|七秀|qixiu|xiutai/, "qixiu"],
  [/4e07-u82b1|万花|wanhua/, "wanhua"],
];
