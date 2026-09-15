export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'emote-yes'
  | 'emote-no'
  | 'wave'
  | 'attack'
  | 'throw'
  | 'hit'
  | 'dead'
  /** 吃掉手上的食物（程式生成動作） */
  | 'eat'
  | 'benchpress'
  | 'benchpress-incline'
  | 'curl'
  | 'squat'
  | 'swing'
  | 'slide'
  | 'swing-ride'
  /** 蹺蹺板兩端傾斜方向相反，因此左右各一個動作 */
  | 'seesaw-a'
  | 'seesaw-b'
  | DanceId;

export type DanceId = 'dance-swing' | 'dance-robot' | 'dance-squat' | 'dance-groove';
export interface DanceDef {
  id: DanceId;
  label: string;
  key: string;
  icon: string;
  bpm: number;
}
/** 程式生成的舞步（Kenney 角色沒有跳舞動畫，由 client 依節拍計算各節點角度） */
export const DANCES: readonly DanceDef[] = [
  { id: 'dance-swing', label: '搖擺', key: '4', icon: '💃', bpm: 120 },
  { id: 'dance-robot', label: '機械', key: '5', icon: '🤖', bpm: 100 },
  { id: 'dance-squat', label: '蹲跳', key: '6', icon: '🐸', bpm: 110 },
  { id: 'dance-groove', label: '熱舞', key: '7', icon: '🙌', bpm: 128 },
];
export const DANCE_IDS = new Set<string>(DANCES.map((d) => d.id));
export function isDance(anim: string): anim is DanceId {
  return DANCE_IDS.has(anim);
}

export const ANIM_STATES: readonly AnimState[] = [
  'idle',
  'walk',
  'run',
  'sit',
  'emote-yes',
  'emote-no',
  'wave',
  'attack',
  'throw',
  'hit',
  'dead',
  'eat',
  'benchpress',
  'benchpress-incline',
  'curl',
  'squat',
  'swing',
  'slide',
  'swing-ride',
  'seesaw-a',
  'seesaw-b',
  ...DANCES.map((d) => d.id),
];

export type EmoteId = Extract<AnimState, 'emote-yes' | 'emote-no' | 'wave'>;
export interface EmoteDef {
  id: EmoteId;
  label: string;
  /** 鍵盤快捷鍵（Digit） */
  key: string;
  icon: string;
}
export const EMOTES: readonly EmoteDef[] = [
  { id: 'emote-yes', label: '點頭', key: '1', icon: '👍' },
  { id: 'emote-no', label: '搖頭', key: '2', icon: '🙅' },
  { id: 'wave', label: '揮手', key: '3', icon: '👋' },
];

/** 可使用的座位 / 器材站（由家具表推導） */
export interface Seat {
  id: string;
  furnitureId: string;
  x: number;
  z: number;
  /** 使用時角色的朝向（與角色 rotY 同義：面向 (sin, cos)） */
  rotY: number;
  /** 使用時的動作：椅子坐下、跑步機跑步、臥推椅臥推、瑜珈墊波比跳 */
  anim: AnimState;
  /** 互動提示文字 */
  label: string;
  /**
   * 指定的起身位置；省略時由 standPointForSeat 從座位後方推算。
   * 溜滑梯要落在滑道盡頭、蹺蹺板要往側邊讓開，都不是「座位正後方」。
   */
  standAt?: { x: number; z: number };
  /** 一次性體驗（溜滑梯）：坐上去幾毫秒後由伺服端自動起身 */
  rideMs?: number;
}

export interface SitPayload {
  seatId: string;
}

/** 客戶端上傳的移動資料 */
export interface MovePayload {
  x: number;
  z: number;
  rotY: number;
  anim: AnimState;
}

/** 加入房間的選項 */
export interface JoinOptions {
  name: string;
  avatarId: string;
  /** 進場密碼（伺服端設定 JOIN_CODE 時必填） */
  joinCode?: string;
}

/** 聊天訊息（S→C） */
export interface ChatMessage {
  id: string;
  senderId: string;
  name: string;
  text: string;
  ts: number;
}

/** 系統訊息（S→C） */
export interface SystemMessage {
  text: string;
  ts: number;
}

/** 前端讀取 Colyseus state 時使用的結構型別（伺服端以 Schema 實作） */
export interface PlayerState {
  id: string;
  name: string;
  avatarId: string;
  x: number;
  z: number;
  rotY: number;
  anim: AnimState;
  status: string;
  /** 目前坐的座位 id，空字串代表站立 */
  seatId: string;
  /** 是否開啟格鬥模式（雙方都開啟才會互相命中） */
  fightMode: boolean;
  /** 血量 0～FIGHT.maxHp，0 代表倒地 */
  hp: number;
  /** 決鬥對手的 sessionId，空字串代表未在決鬥中 */
  duelWith: string;
  /** 手上的武器 id，空字串代表拳頭 */
  weaponId: string;
  /** 射擊類武器剩餘彈藥 */
  ammo: number;
  /** 被爐火燒到，頭上冒火中 */
  onFire: boolean;
  lastSeen: number;
}

/** 武器類型：近戰揮擊 / 整個丟出去 / 發射投射物 */
export type WeaponKind = 'melee' | 'throw' | 'shoot';

export interface WeaponDef {
  id: string;
  name: string;
  /** client/public/models/food/<model>.glb */
  model: string;
  kind: WeaponKind;
  damage: number;
  /** 近戰：判定距離；投擲/射擊：最大飛行距離 */
  range: number;
  knockback: number;
  cooldownMs: number;
  /** shoot 類的彈藥數 */
  ammo?: number;
  /** 投射物速度（m/s） */
  projectileSpeed?: number;
  /** 投射物模型（shoot 類；throw 類飛出去的是武器本身） */
  projectileModel?: string;
  /** 顯示縮放（地上與投射物） */
  scale: number;
  /** 手持時相對右手臂節點的位置 / 旋轉（角色模型單位） */
  grip: { position: [number, number, number]; rotation: [number, number, number]; scale: number };
  /** 是否會隨機生成在地上（預設 true；健身器材只出現在架上） */
  spawnable?: boolean;
  /** 非格鬥模式下按空白鍵的運動動作 */
  exercise?: AnimState;
  /** 是食物：可以吃、可以放上瓦斯爐、可以餵寵物 */
  edible?: boolean;
  /** 吃掉時回復的血量（省略時用 EAT.healHp） */
  heal?: number;
  /** 可以放進烤箱烤，烤好後變成這個武器 id */
  bakesTo?: string;
}

/** 地上可撿的武器 */
export interface PickupState {
  id: string;
  weaponId: string;
  x: number;
  z: number;
  /** 離地高度（放在架上時） */
  y: number;
}

export interface PickupPayload {
  pickupId: string;
}

/** S→C：投射物飛行（客戶端只負責視覺，命中由伺服端決定並另發 hit） */
export interface ProjectileEvent {
  id: string;
  shooterId: string;
  weaponId: string;
  model: string;
  kind: 'throw' | 'shoot';
  fromX: number;
  fromZ: number;
  dirX: number;
  dirZ: number;
  distance: number;
  speed: number;
}

/** S→C：有人被打中 */
export interface HitEvent {
  attackerId: string;
  targetId: string;
  /** 撞擊點（粒子噴出位置） */
  x: number;
  z: number;
  /** 擊退方向（單位向量） */
  dirX: number;
  dirZ: number;
  /** 被擊退後的位置（伺服端已解算碰撞） */
  toX: number;
  toZ: number;
  hp: number;
  killed: boolean;
}

/** C→S：決鬥操作 */
export type DuelAction =
  | { action: 'invite'; targetId: string }
  | { action: 'accept'; fromId: string }
  | { action: 'decline'; fromId: string };

/** S→C：決鬥相關事件 */
export type DuelEvent =
  | { kind: 'invite'; fromId: string; fromName: string; expiresAt: number }
  | { kind: 'sent'; toId: string; toName: string; expiresAt: number }
  | { kind: 'declined'; byId: string; byName: string; reason: 'declined' | 'timeout' | 'busy' }
  | { kind: 'start'; aId: string; bId: string; startsAt: number }
  | { kind: 'end'; winnerId: string; winnerName: string; loserId: string; loserName: string; reason: 'ko' | 'forfeit' };

/** 寵物動作（伺服端 AI 驅動） */
export type PetAnim = 'idle' | 'walk' | 'dance' | 'hit' | 'thrown' | 'eat' | 'dead';

/** 前端讀取寵物 state 的結構型別（伺服端以 Schema 實作） */
export interface PetState {
  id: string;
  petType: string;
  x: number;
  z: number;
  rotY: number;
  anim: PetAnim;
  hp: number;
  /** 抱著牠的玩家 sessionId，空字串代表在地上 */
  carrierId: string;
  /** 被餵了幾次（影響體型） */
  feedCount: number;
}

/**
 * 路人 NPC 的前端讀取結構（伺服端以 Schema 實作）。
 * 動作沿用玩家的 AnimState，所以前端可以直接餵給 Avatar 播同一套動畫。
 */
export interface NpcState {
  x: number;
  z: number;
  rotY: number;
  anim: AnimState;
  hp: number;
}

/** S→C：寵物被丟出去的飛行資訊（命運已由伺服端決定，前端只播飛行視覺） */
export interface PetFlightEvent {
  petId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  durationMs: number;
}

/** 匹克球：報名側別 */
export type CourtSide = 'A' | 'B';

/** C→S：揮拍（aim 為揮拍瞬間的面向向量，用來決定回球往哪個角落） */
export interface SwingPayload {
  aimX: number;
  aimZ: number;
}

/** S→C：一拍球的飛行（所有客戶端各自播同一條拋物線；落地判定在伺服端） */
export interface CourtShotEvent {
  shotId: number;
  byId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  flightMs: number;
  /** 拋物線最高點 */
  arcH: number;
  /** 第一次落地後的反彈段（第二次觸地才算失分） */
  bounceToX: number;
  bounceToZ: number;
  bounceMs: number;
  bounceArcH: number;
}

/** S→C：閒置提醒與自動離開 */
export interface IdleEvent {
  kind: 'warn' | 'kick' | 'clear';
  /** hidden = 分頁在背景過久；inactive = 完全沒有操作過久 */
  reason?: 'hidden' | 'inactive';
  /** kind 為 warn 時，剩餘幾毫秒會被移出房間 */
  remainingMs?: number;
}

/** S→C：倒地者復活 */
export interface RespawnEvent {
  sessionId: string;
  x: number;
  z: number;
}

export interface AvatarDef {
  id: string;
  name: string;
  /** GLB 檔名（client/public/models/characters/<model>.glb） */
  model: string;
  /** 身體主色 */
  color: string;
  /** 配色（頭髮 / 配件） */
  accent: string;
}

export type FurnitureType =
  | 'desk'
  | 'chair'
  | 'cabinet'
  | 'plant'
  | 'sofa'
  | 'table'
  | 'counter'
  | 'fridge'
  | 'rug'
  | 'whiteboard'
  | 'prop'
  | 'partition'
  | 'gymfloor'
  | 'treadmill'
  | 'gymmat'
  | 'bench'
  | 'rack'
  /** 遊戲區設施：只提供碰撞，外觀由 Playground 以 playground.glb 繪製 */
  | 'playground';

export interface FurnitureDef {
  id: string;
  type: FurnitureType;
  /** 中心點 */
  x: number;
  z: number;
  /** 離地高度（放在架子上的物件用） */
  y?: number;
  /** 寬（X）、深（Z）、高（Y） */
  w: number;
  d: number;
  h: number;
  /** 繞 Y 軸旋轉（弧度），僅影響外觀；碰撞使用 w/d 的 AABB */
  rotY?: number;
  color?: string;
  /** 是否參與碰撞（預設 true） */
  solid?: boolean;
  /** 模型配方鍵（覆蓋 type），例如 'meeting-chair'、'trashcan' */
  variant?: string;
}

/** 訊息事件名稱 */
export const Messages = {
  move: 'move',
  setStatus: 'setStatus',
  sit: 'sit',
  stand: 'stand',
  toggleFight: 'toggleFight',
  attack: 'attack',
  hit: 'hit',
  respawn: 'respawn',
  duel: 'duel',
  pickup: 'pickup',
  drop: 'drop',
  projectile: 'projectile',
  visibility: 'visibility',
  idle: 'idle',
  petPickup: 'petPickup',
  petDrop: 'petDrop',
  petThrow: 'petThrow',
  petFlight: 'petFlight',
  npcSay: 'npcSay',
  stovePlace: 'stovePlace',
  stoveTake: 'stoveTake',
  ovenPlace: 'ovenPlace',
  ovenTake: 'ovenTake',
  eat: 'eat',
  feedPet: 'feedPet',
  courtJoin: 'courtJoin',
  courtLeave: 'courtLeave',
  swing: 'swing',
  courtShot: 'courtShot',
  chat: 'chat',
  system: 'system',
} as const;
