import { Vector3 } from 'three';
import {
  CAMERA,
  EAT,
  EMOTE_DURATION_MS,
  FIGHT,
  SPAWN_POINT,
  getWeapon,
  type AnimState,
  type DanceId,
  type EmoteId,
  type NpcHazard,
  type PetAnim,
  type ProjectileEvent,
  type SnowTeam,
} from '@office/shared';

/** 其他玩家的目標狀態（由網路更新，RemotePlayer 每幀插補） */
export interface RemoteTarget {
  x: number;
  z: number;
  rotY: number;
  anim: AnimState;
  /** 首次收到時直接 snap 到位 */
  fresh: boolean;
}

export const remoteTargets = new Map<string, RemoteTarget>();

/** 寵物的目標狀態（由網路更新，Pets 每幀插補） */
export interface PetTarget {
  x: number;
  z: number;
  rotY: number;
  anim: PetAnim;
  fresh: boolean;
  /** 抱著牠的玩家 sessionId */
  carrierId: string;
  /** 被餵了幾次（影響體型） */
  feedCount: number;
  /** 被丟出去的飛行資訊（前端本地播放拋物線） */
  flight: { fromX: number; fromZ: number; toX: number; toZ: number; startAt: number; durationMs: number } | null;
}

export const petTargets = new Map<string, PetTarget>();

/** 路人 NPC 的目標狀態（場上固定一位，由網路更新，Npc 每幀插補） */
export const npcTarget = {
  x: SPAWN_POINT.x,
  z: SPAWN_POINT.z,
  rotY: 0,
  anim: 'idle' as AnimState,
  /** 正在拖他的玩家 sessionId，空字串代表沒人拖 */
  carrierId: '',
  /** 正被押在哪個危險區（'' | 'stove' | 'pond'） */
  pinnedAt: '' as NpcHazard | '',
  /** 首次收到時直接 snap 到位 */
  fresh: true,
};

/** 本地玩家目前位置（LocalPlayer 寫入，CameraRig 讀取） */
export const local = {
  x: SPAWN_POINT.x,
  z: SPAWN_POINT.z,
  rotY: 0,
  anim: 'idle' as AnimState,
  /** 伺服端確認的座位（空字串為站立） */
  seatId: '',
  /** 進行中的表情與結束時間（performance.now） */
  emote: null as EmoteId | null,
  emoteUntil: 0,
  /** 進行中的舞步（持續到移動 / 攻擊 / 再按一次） */
  dance: null as DanceId | null,
  /** 進行中的運動動作（拿啞鈴彎舉） */
  exercise: null as AnimState | null,
  /** 進食動作的結束時間（performance.now） */
  eatUntil: 0,
  /** 格鬥 */
  fightMode: false,
  /** 打雪仗模式（伺服端同步）：手上只有雪球、只能在雪仗場地移動 */
  snowMode: false,
  /** 打雪仗隊伍（''＝自由模式） */
  snowTeam: '' as SnowTeam | '',
  /** 手上剩幾顆雪球（伺服端同步，本地丟球前先擋一下） */
  snowAmmo: 0,
  dead: false,
  /** 手上的武器（伺服端同步） */
  weaponId: '',
  attackUntil: 0,
  /** 這次攻擊的動畫：近戰揮擊或投擲 */
  attackAnim: 'attack' as AnimState,
  lastAttackAt: 0,
  staggerUntil: 0,
  /** 被擊退的補間（performance.now 基準） */
  knockback: null as { x0: number; z0: number; x1: number; z1: number; start: number; end: number } | null,
};

/** 運動中的動作（例如拿啞鈴彎舉），與舞步一樣持續到移動或再按一次 */
export function toggleExercise(anim: AnimState): void {
  if (local.dead || local.seatId || local.knockback) return;
  local.emote = null;
  local.exercise = local.exercise === anim ? null : anim;
  local.dance = null;
}

/**
 * 開始吃手上的食物；回傳是否真的開始（沒拿食物、倒地、坐著或上一口還沒吃完則否）。
 * 只負責本地動作狀態，送出訊息由 net/client 的 eatHeldFood 處理。
 */
export function startEat(): boolean {
  if (local.dead || local.seatId || local.knockback) return false;
  if (!getWeapon(local.weaponId)?.edible) return false;
  const now = performance.now();
  if (now < local.eatUntil) return false;
  local.emote = null;
  local.dance = null;
  local.exercise = null;
  local.eatUntil = now + EAT.durationMs;
  return true;
}

/**
 * 本地玩家嘗試丟雪球；回傳是否真的送出。
 * 冷卻與動畫都跟著雪球的武器定義走，沒球了就丟不出去（要去雪堆補）。
 */
export function canThrowSnowball(now: number): boolean {
  if (!local.snowMode || local.dead || local.seatId || local.knockback) return false;
  if (local.snowAmmo <= 0) return false;
  const weapon = getWeapon('snowball');
  if (!weapon || now - local.lastAttackAt < weapon.cooldownMs) return false;
  local.lastAttackAt = now;
  local.attackAnim = 'throw';
  local.attackUntil = now + 300;
  local.emote = null;
  local.dance = null;
  local.exercise = null;
  local.eatUntil = 0;
  return true;
}

/** 本地玩家嘗試攻擊；回傳是否真的送出（冷卻中則否）。冷卻與動畫依手上武器決定 */
export function canAttack(now: number): boolean {
  if (local.snowMode) return canThrowSnowball(now);
  if (!local.fightMode || local.dead || local.seatId || local.knockback) return false;
  local.exercise = null;
  local.eatUntil = 0;
  const weapon = getWeapon(local.weaponId);
  const cooldown = weapon?.cooldownMs ?? FIGHT.cooldownMs;
  if (now - local.lastAttackAt < cooldown) return false;
  local.lastAttackAt = now;
  local.dance = null;
  local.attackAnim = weapon && weapon.kind !== 'melee' ? 'throw' : 'attack';
  local.attackUntil = now + (local.attackAnim === 'throw' ? 300 : FIGHT.attackAnimMs);
  local.emote = null;
  return true;
}

/** 揮拍動作（本地立即播放，狀態經 anim 欄位同步給其他人） */
export function triggerSwing(): void {
  if (local.dead || local.seatId) return;
  local.attackAnim = 'swing';
  local.attackUntil = performance.now() + 420;
  local.emote = null;
  local.dance = null;
  local.exercise = null;
}

/** 投射物視覺請求（Projectiles 每幀消化） */
export const projectileQueue: ProjectileEvent[] = [];

/** 匹克球目前這一拍的飛行（CourtBall 每幀讀取） */
export const courtBall = {
  flight: null as {
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    arcH: number;
    startAt: number;
    durationMs: number;
    bounceToX: number;
    bounceToZ: number;
    bounceMs: number;
    bounceArcH: number;
  } | null,
};

/** 套用伺服端的擊退結果 */
/**
 * 擊退的飛行時間跟著距離走：以一般揮拳（FIGHT.knockback 1.5m / knockbackMs 250ms）
 * 的速度為基準，所以近距離擊退的手感完全不變，但被海盜船撞飛十幾公尺時
 * 才不會變成瞬移。上限 1.2 秒，免得飛太久失去控制權。
 */
const KNOCKBACK_SPEED = FIGHT.knockback / FIGHT.knockbackMs;
const KNOCKBACK_MAX_MS = 1200;

export function applyKnockback(toX: number, toZ: number, faceX: number, faceZ: number): void {
  const now = performance.now();
  const dist = Math.hypot(toX - local.x, toZ - local.z);
  const ms = Math.min(KNOCKBACK_MAX_MS, Math.max(FIGHT.knockbackMs, dist / KNOCKBACK_SPEED));
  local.knockback = { x0: local.x, z0: local.z, x1: toX, z1: toZ, start: now, end: now + ms };
  local.staggerUntil = now + FIGHT.staggerMs;
  local.rotY = Math.atan2(faceX, faceZ);
  local.emote = null;
  local.dance = null;
  local.eatUntil = 0;
  local.attackUntil = 0;
}

/** 血液粒子請求（BloodParticles 每幀消化） */
export interface BloodBurst {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** 倒地時噴多一點 */
  heavy: boolean;
  /** 被雪球打中：噴白色的雪而不是血 */
  snow: boolean;
}
export const bloodQueue: BloodBurst[] = [];

/** 觸發表情；坐著、倒地或僵直時忽略（動畫會互相覆蓋） */
export function triggerEmote(id: EmoteId): void {
  if (local.seatId || local.dead || local.knockback) return;
  local.dance = null;
  local.emote = id;
  local.emoteUntil = performance.now() + EMOTE_DURATION_MS;
}

/** 切換舞步：同一支再按一次即停止 */
export function toggleDance(id: DanceId): void {
  if (local.seatId || local.dead || local.knockback) return;
  local.emote = null;
  local.dance = local.dance === id ? null : id;
}

/** 相機狀態 */
export const rig = {
  yaw: CAMERA.yawDefault,
  pitch: CAMERA.pitchDefault,
  distance: CAMERA.distanceDefault,
  target: new Vector3(SPAWN_POINT.x, 1, SPAWN_POINT.z),
  /** 短暫聚焦某玩家（在線名單點擊） */
  focusSessionId: null as string | null,
  focusUntil: 0,
  /**
   * 切換場景主題後把鏡頭平滑抬到觀景角度。玩家一拖曳或縮放就取消，
   * 之後完全交還控制權（不會再強制拉回）。
   */
  tour: null as { pitch: number; distance: number } | null,
};

/** 觀景視角：俯角 10°、距離 22，剛好讓地平線與地標進到畫面上半部 */
export function startSceneTour(): void {
  rig.tour = { pitch: (10 * Math.PI) / 180, distance: 22 };
}

export function focusPlayer(sessionId: string, durationMs = 2500): void {
  rig.focusSessionId = sessionId;
  rig.focusUntil = performance.now() + durationMs;
}

export function resetRuntime(): void {
  remoteTargets.clear();
  petTargets.clear();
  npcTarget.x = SPAWN_POINT.x;
  npcTarget.z = SPAWN_POINT.z;
  npcTarget.rotY = 0;
  npcTarget.anim = 'idle';
  npcTarget.carrierId = '';
  npcTarget.pinnedAt = '';
  npcTarget.fresh = true;
  local.x = SPAWN_POINT.x;
  local.z = SPAWN_POINT.z;
  local.rotY = 0;
  local.anim = 'idle';
  local.seatId = '';
  local.emote = null;
  local.emoteUntil = 0;
  local.dance = null;
  local.exercise = null;
  local.eatUntil = 0;
  local.fightMode = false;
  local.snowMode = false;
  local.snowTeam = '';
  local.snowAmmo = 0;
  local.dead = false;
  local.weaponId = '';
  local.attackUntil = 0;
  projectileQueue.length = 0;
  local.lastAttackAt = 0;
  local.staggerUntil = 0;
  local.knockback = null;
  bloodQueue.length = 0;
  courtBall.flight = null;
  rig.yaw = CAMERA.yawDefault;
  rig.pitch = CAMERA.pitchDefault;
  rig.distance = CAMERA.distanceDefault;
  rig.target.set(SPAWN_POINT.x, 1, SPAWN_POINT.z);
  rig.focusSessionId = null;
  rig.focusUntil = 0;
  rig.tour = null;
}
