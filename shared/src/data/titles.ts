/**
 * 稱號：不能用錢買，只能靠特定情境解鎖。
 * 解開之後可以在福利社挑一個戴在名牌上，一次一個。
 */
export interface TitleDef {
  id: string;
  name: string;
  /** 取得方式，顯示在福利社讓人知道要怎麼拿 */
  how: string;
}

export const TITLES: TitleDef[] = [
  { id: 'npc-slayer', name: '勞工楷模', how: '打倒丁oe' },
  { id: 'work-3h', name: '初級社畜', how: '在電腦桌前累計工作滿 3 小時' },
  { id: 'work-24h', name: '高級社畜', how: '在電腦桌前累計工作滿 24 小時' },
  { id: 'triple-kill', name: '葬送的呂秀蓮', how: '同一條命內打倒三個人' },
  { id: 'barehand', name: '原住民', how: '空手（沒拿武器）打倒一個人' },
  { id: 'caught-10', name: '摸魚大師', how: '被丁oe抓回辦公室滿 10 次' },
  { id: 'deaths-50', name: '廢物', how: '累計倒地 50 次' },
  { id: 'ship-death', name: '航海大師', how: '被海盜船撞到倒地' },
  { id: 'druid', name: '德魯伊', how: '擁有 5 隻不同的寵物' },
  { id: 'feed-20', name: '鏟屎官', how: '餵寵物吃東西滿 20 次' },
  { id: 'coaster-death', name: '跳傘大師', how: '在雲霄飛車上跳車摔死' },
  { id: 'gym-30m', name: '陳之漢', how: '累計健身滿 30 分鐘' },
  { id: 'dance-30m', name: '羅志祥', how: '累計跳舞滿 30 分鐘' },
  { id: 'food-kill', name: '超派鐵拳', how: '用食物打倒一個人' },
  { id: 'court-win', name: '匹克球大師', how: '贏一場匹克球' },
  { id: 'snow-win', name: '努努', how: '贏一場打雪仗' },
  { id: 'bake-10', name: '陳建章', how: '烤十次可頌' },
];

export const TITLE_BY_ID = new Map(TITLES.map((t) => [t.id, t]));

export function getTitle(id: string): TitleDef | null {
  return TITLE_BY_ID.get(id) ?? null;
}

/** 各種累計統計的門檻，伺服端達標時解鎖對應稱號 */
export const TITLE_THRESHOLDS = {
  /** 工作秒數 */
  work3h: 3 * 60 * 60,
  work24h: 24 * 60 * 60,
  /** 同一條命內的擊倒數 */
  tripleKill: 3,
  /** 被丁oe抓回辦公室的次數 */
  caught: 10,
  /** 倒地次數 */
  deaths: 50,
  /** 擁有的寵物種類數 */
  pets: 5,
  /** 餵食次數 */
  feeds: 20,
  /** 健身秒數 */
  gym: 30 * 60,
  /** 跳舞秒數 */
  dance: 30 * 60,
  /** 烤可頌次數 */
  bakes: 10,
};
