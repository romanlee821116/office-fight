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
  /**
   * 會移動的座位（旋轉木馬）：x / z 只是上車點，實際位置每刻由 rideSeatAt() 算出來。
   * 前後端用同一條式子，所以不必為了同步多傳任何狀態。
   */
  ride?: { kind: 'carousel' | 'coaster' | 'ship'; index: number };
  /**
   * 不走一般的「走近按 E 坐下」流程，由各自的玩法自己處理入座。
   * 牌桌就是這種：入座要先確認身分、從帳號金幣扣買入，不能被 findNearestSeat 隨手抓到。
   */
  manual?: boolean;
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

/** 已登入會員的資料（GET / PUT /api/me） */
/** 商店商品類型：頭飾掛在頭上、服裝換角色貼圖 */
export type ShopItemKind = 'hat' | 'outfit' | 'weapon' | 'pet';

export interface ShopItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  price: number;
  /** hat：models/<asset>.glb；outfit：characters/Textures/<asset>.png */
  asset: string;
  /** hat 專用：戴在頭上的寬度與底部高度（頭節點局部座標） */
  fit?: { width: number; baseY: number };
}

/** 購買商品（C→S） */
export interface BuyPayload {
  itemId: string;
}

/** 穿戴（C→S）；空字串代表脫下 */
export interface EquipPayload {
  hatId: string;
  outfitId: string;
  /** 隨身武器的商品 id */
  weaponId: string;
  /** 跟班寵物的商品 id */
  petId: string;
}

/** 幫某隻買過的寵物取名（C→S）；不必是目前帶著的那隻 */
export interface RenamePetPayload {
  /** 寵物的商品 id */
  itemId: string;
  name: string;
}

/** 幫某隻買過的寵物染色（C→S）；每次染色都要付費 */
export interface TintPetPayload {
  itemId: string;
  tint: string;
}

/** 配戴稱號（C→S）；空字串代表取下 */
export interface WearTitlePayload {
  titleId: string;
}

/** 解鎖了新稱號（S→C） */
export interface TitleEarnedEvent {
  titleId: string;
}

/** 購買 / 染色的結果（S→C） */
export interface ShopEvent {
  /** 這則回覆對應哪個動作 */
  kind: 'buy' | 'tint';
  ok: boolean;
  itemId: string;
  /** kind 為 tint 且成功時，染上的顏色 id */
  tint?: string;
  /** 失敗原因（ok 為 false 時才有） */
  reason?: string;
}

export interface AuthMe {
  email: string;
  name: string;
  avatarId: string;
  /** 帳號累積的金幣 */
  coins: number;
  /** 已購買的商品 id */
  ownedItems: string[];
  hatId: string;
  outfitId: string;
  weaponId: string;
  petId: string;
  /** 每隻買過的寵物各自的名字（商品 id → 名字） */
  petNames: Record<string, string>;
  /** 每隻買過的寵物各自的染色（商品 id → 染色 id） */
  petTints: Record<string, string>;
  /** 自訂臉部照片的網址，空字串代表沒上傳 */
  faceUrl: string;
  /** 已解鎖的稱號 id */
  titles: string[];
  /** 配戴中的稱號 id */
  titleId: string;
}

/** 加入房間的選項 */
export interface JoinOptions {
  name: string;
  avatarId: string;
  /** 進場密碼（伺服端設定 JOIN_CODE 時必填） */
  joinCode?: string;
  /**
   * 會員進場票：向 /api/auth/ticket 換來的短期簽章，伺服端驗完才認得出這是哪個帳號。
   * 訪客沒有票，進場後不會累積金幣。
   */
  ticket?: string;
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
  /** 是否在打雪仗模式（手上只有雪球、只能在雪仗場地移動） */
  snowMode: boolean;
  /**
   * 打雪仗隊伍：'' | 'red' | 'blue'。'' 代表自由打雪仗（沒分隊）。
   * 有隊伍但 snowMode 為 false，代表這場比賽已經出局（比賽結束才清空）。
   */
  snowTeam: string;
  lastSeen: number;
  /** 打倒過丁oe，頭上戴皇冠 */
  npcSlayer: boolean;
  /** 是否為登入會員（只有會員能上班賺錢） */
  member: boolean;
  /** 目前擁有的金幣；訪客恆為 0 */
  coins: number;
  /** 戴著的頭飾商品 id，空字串代表沒戴 */
  hatId: string;
  /** 穿著的服裝商品 id，空字串代表角色原本的外觀 */
  outfitId: string;
  /** 裝備欄的武器商品 id，空字串代表沒裝備 */
  gearId: string;
  /** 跟班寵物的商品 id，空字串代表沒帶 */
  petGearId: string;
  /** 自訂臉部照片的網址，空字串代表用角色原本的臉 */
  faceUrl: string;
  /** 配戴中的稱號 id，空字串代表沒戴 */
  titleId: string;
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
  /** 裝備欄武器（福利社買來的隨身武器）：不會出現在地上、丟不掉、重生後還在 */
  gear?: boolean;
  /** 投射物模型（shoot 類；throw 類飛出去的是武器本身） */
  projectileModel?: string;
  /** 彈藥用完後仍留在手上（雪球用完要走去雪堆補，手不會空掉） */
  keepWhenEmpty?: boolean;
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
  /** 被雪球打中：粒子噴白色的雪而不是血 */
  snow: boolean;
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
  /** 主人的 sessionId；非空代表這是買來的跟班，不會被攻擊也不會亂跑 */
  ownerId: string;
  /** 主人取的名字，空字串代表用種類名 */
  name: string;
  /** 染色 id（PET_TINTS），空字串代表原色 */
  tint: string;
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
  /** 正在拖他的玩家 sessionId，空字串代表沒人拖 */
  carrierId: string;
  /** 正被押在哪個危險區，空字串代表沒被押著 */
  pinnedAt: NpcHazard | '';
  onFire: boolean;
}

/** 可以把路人押進去的危險區 */
export type NpcHazard = 'stove' | 'pond';

/** C→S：按住／放開「把路人押下去」 */
export interface NpcPinPayload {
  on: boolean;
}

/** S→C：被丁oe的視線逮到，他正在念你，freezeMs 內動不了 */
export interface NpcSpottedEvent {
  freezeMs: number;
}

/** S→C：被丁oe的視線抓到，已經傳回辦公室坐好，lockMs 內起不來 */
export interface NpcCaughtEvent {
  lockMs: number;
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

/** 打雪仗的隊伍 */
export type SnowTeam = 'red' | 'blue';

/** C→S：報名雪仗隊伍（自由模式是走進場地自動進入，不走這條） */
export interface SnowJoinPayload {
  team: SnowTeam;
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
  | 'playground'
  /** 遊樂園設施：只提供碰撞，外觀由 Park 以 park/ 底下的模型繪製 */
  | 'park'
  /** 聖誕小鎮／打雪仗場地：只提供碰撞，外觀由 ChristmasTown 以 holiday/ 底下的模型繪製 */
  | 'xmas';

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

/**
 * 聖誕小鎮的一棟木屋（Kenney Holiday Kit 模組零件）。
 * 兩格寬、len 格長，局部 +Z 為正面；rotY 只用 0 / ±π/2 / π。
 */
export interface CabinDef {
  id: string;
  x: number;
  z: number;
  rotY: number;
  /** 沿屋脊方向的格數 */
  len: number;
  /** 雪白屋頂或原色屋頂 */
  roof: 'snow' | 'plain';
  /** 大門開在正面哪一格（-0.5 或 0.5），另一格開窗 */
  doorX: number;
  /** 煙囪長在屋脊的哪一端（-1 / 1），省略代表沒有煙囪 */
  chimneyEnd?: -1 | 1;
  /** 側牆掛花圈 */
  wreath?: boolean;
}

/** 訊息事件名稱 */
/** 入座牌桌（C→S）；seatIndex 為 POKER_SEATS 的索引 */
export interface PokerSitPayload {
  seatIndex: number;
}

/** 要不要讓 NPC 陪打（C→S）。關掉之後桌上的 NPC 會在這一手結束時離席 */
export interface PokerNpcsPayload {
  enabled: boolean;
}

/** 牌桌動作（C→S）。raise 的 amount 是「本輪下注總額」，不是加注的增量 */
export interface PokerActPayload {
  action: 'fold' | 'check' | 'call' | 'raise';
  amount: number;
}

/** 攤牌時亮出來的一手牌 */
export interface PokerShowdownEntry {
  seat: number;
  name: string;
  cards: number[];
  /** 牌型中文名，例如「兩對」 */
  hand: string;
}

/**
 * 牌桌事件（S→C）。
 *
 * hole 是私訊給本人的底牌，其餘都是全桌廣播。公開狀態（籌碼、下注、公共牌、
 * 輪到誰）走 schema，這裡只送「剛剛發生了什麼」這種一次性的東西。
 */
export type PokerEventPayload =
  | { kind: 'hole'; cards: number[] }
  | { kind: 'action'; seat: number; text: string }
  | { kind: 'say'; seat: number; text: string }
  | { kind: 'showdown'; entries: PokerShowdownEntry[] }
  | { kind: 'payout'; text: string; winners: { seat: number; name: string; amount: number }[] }
  /** 籌碼輸光被請下桌，只送給當事人；前端據此顯示重新買入的選項 */
  | { kind: 'busted'; text: string }
  /** 入座／動作被拒絕的原因，只送給發起的人 */
  | { kind: 'error'; text: string };

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
  npcPickup: 'npcPickup',
  npcDrop: 'npcDrop',
  npcPin: 'npcPin',
  npcSpotted: 'npcSpotted',
  npcCaught: 'npcCaught',
  stovePlace: 'stovePlace',
  stoveTake: 'stoveTake',
  ovenPlace: 'ovenPlace',
  ovenTake: 'ovenTake',
  eat: 'eat',
  feedPet: 'feedPet',
  snowJoin: 'snowJoin',
  snowLeave: 'snowLeave',
  snowReload: 'snowReload',
  courtJoin: 'courtJoin',
  courtLeave: 'courtLeave',
  swing: 'swing',
  courtShot: 'courtShot',
  chat: 'chat',
  system: 'system',
  buy: 'buy',
  equip: 'equip',
  renamePet: 'renamePet',
  tintPet: 'tintPet',
  faceChanged: 'faceChanged',
  wearTitle: 'wearTitle',
  titleEarned: 'titleEarned',
  shop: 'shop',
  pokerSit: 'pokerSit',
  pokerLeave: 'pokerLeave',
  pokerAct: 'pokerAct',
  pokerNpcs: 'pokerNpcs',
  pokerContinue: 'pokerContinue',
  pokerEvent: 'pokerEvent',
} as const;
