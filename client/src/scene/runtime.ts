import { Vector3 } from 'three';
import {
  CAMERA,
  EMOTE_DURATION_MS,
  FIGHT,
  SPAWN_POINT,
  getWeapon,
  type AnimState,
  type DanceId,
  type EmoteId,
  type PetAnim,
  type ProjectileEvent,
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
  /** 格鬥 */
  fightMode: false,
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

/** 本地玩家嘗試攻擊；回傳是否真的送出（冷卻中則否）。冷卻與動畫依手上武器決定 */
export function canAttack(now: number): boolean {
  if (!local.fightMode || local.dead || local.seatId || local.knockback) return false;
  local.exercise = null;
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
export function applyKnockback(toX: number, toZ: number, faceX: number, faceZ: number): void {
  const now = performance.now();
  local.knockback = { x0: local.x, z0: local.z, x1: toX, z1: toZ, start: now, end: now + FIGHT.knockbackMs };
  local.staggerUntil = now + FIGHT.staggerMs;
  local.rotY = Math.atan2(faceX, faceZ);
  local.emote = null;
  local.dance = null;
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
  local.x = SPAWN_POINT.x;
  local.z = SPAWN_POINT.z;
  local.rotY = 0;
  local.anim = 'idle';
  local.seatId = '';
  local.emote = null;
  local.emoteUntil = 0;
  local.dance = null;
  local.exercise = null;
  local.fightMode = false;
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
