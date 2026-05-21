export type MenpaiId =
  | "duanshi"
  | "wanling"
  | "daozong"
  | "beitian-yaozong"
  | "yantian"
  | "lingxue"
  | "penglai"
  | "badao"
  | "changge"
  | "cangyun"
  | "gaibang"
  | "mingjiao"
  | "tangmen"
  | "wudu"
  | "cangjian"
  | "tiance"
  | "chunyang"
  | "shaolin"
  | "qixiu"
  | "wanhua";

export type DailyStatusMetrics = {
  momentum: number;
  heart: number;
  social: number;
};

export type DailyStatusMascot =
  | "red-panda"
  | "mythic-deer"
  | "parrot"
  | "roe-deer"
  | "fox"
  | "leopard"
  | "otter"
  | "ferret"
  | "songbird"
  | "turtle"
  | "falcon"
  | "cat"
  | "pig"
  | "peacock"
  | "chick"
  | "wolf"
  | "sheep"
  | "monkey"
  | "rabbit"
  | "squirrel";

export type DailyStatusSkin = {
  skinId: string;
  skinVersion: string;
  menpai: MenpaiId;
  displayName: string;
  animalAnchor: string;
  mascot: DailyStatusMascot;
  glyph: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    paper: string;
    ink: string;
  };
  motifs: string[];
  titlePool: string[];
  linePool: string[];
  goodForPool: string[];
  avoidPool: string[];
};

export type DailyJianghuStatus = {
  date: string;
  petId: string;
  menpai: MenpaiId;
  skinId: string;
  skinVersion: string;
  animalAnchor: string;
  glyph: string;
  title: string;
  summary: string;
  metrics: DailyStatusMetrics;
  goodFor: string[];
  avoid: string[];
  petLine: string;
  actionId: "daily.reveal.generic";
};

export type DailyStatusCacheRecord = {
  cacheKey: string;
  status: DailyJianghuStatus;
  seenAt: string | null;
  dismissedAt: string | null;
};

export type DailyStatusRequest = {
  date: string;
  petId: string;
  menpai: MenpaiId;
};
