import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  COURT,
  DANCES,
  EMOTES,
  NPC,
  OVEN,
  PET,
  PICKUPS,
  RUN_SPEED,
  SEATS,
  SEAT_BY_ID,
  STOVE,
  SYNC_INTERVAL_MS,
  WALK_SPEED,
  coasterAtStation,
  findNearestSeat,
  findNpcHazard,
  getAvatar,
  getWeapon,
  moveWithCollision,
  rideSeatAt,
  type AnimState,
} from '@office/shared';
import {
  eatHeldFood,
  sendAttack,
  sendCourtJoin,
  sendDrop,
  sendFeedPet,
  sendMove,
  sendNpcDrop,
  sendNpcPickup,
  sendNpcPin,
  sendPetDrop,
  sendPetPickup,
  sendPetThrow,
  sendOvenPlace,
  sendOvenTake,
  sendPickup,
  sendSit,
  sendStand,
  sendStovePlace,
  sendStoveTake,
  sendSwing,
} from '../net/client';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { FireFX } from './FireFX';
import { NameTag } from './NameTag';
import { canAttack, local, npcTarget, petTargets, remoteTargets, rig, toggleDance, toggleExercise, triggerEmote, triggerSwing } from './runtime';
import { useKeyboard } from './useKeyboard';

/** 每隔幾幀掃描一次附近座位 */
const SEAT_SCAN_INTERVAL = 6;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** 我是否在匹克球比賽中 */
function inCourtMatch(meId: string | undefined): boolean {
  if (!meId) return false;
  const c = useGame.getState().court;
  return c.aId === meId || c.bId === meId;
}

/** 我抱著的寵物 id */
function carriedPetId(meId: string | undefined): string | null {
  if (!meId) return null;
  for (const p of Object.values(useGame.getState().pets)) {
    if (p.carrierId === meId) return p.id;
  }
  return null;
}

/** 最近可抱起的寵物（排除被抱走、飛行中與倒地的） */
function nearestPet(x: number, z: number): string | null {
  let best: string | null = null;
  let bestDist = PET.pickupRange;
  for (const [id, t] of petTargets) {
    if (t.carrierId || t.anim === 'dead' || t.anim === 'thrown') continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

/** 最近的地上武器 */
function nearestPickup(x: number, z: number): string | null {
  let best: string | null = null;
  let bestDist = PICKUPS.interactDistance;
  for (const p of Object.values(useGame.getState().pickups)) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDist) {
      best = p.id;
      bestDist = d;
    }
  }
  return best;
}

/** 其他玩家（會擋路的）：排除倒地與坐著的人 */
function obstaclePlayers(): { x: number; z: number }[] {
  const list: { x: number; z: number }[] = [];
  for (const t of remoteTargets.values()) {
    if (t.anim === 'dead' || t.anim === 'sit') continue;
    list.push({ x: t.x, z: t.z });
  }
  return list;
}

/** 其他玩家佔用中的座位 */
function occupiedSeats(meId: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const p of Object.values(useGame.getState().players)) {
    if (p.seatId && p.sessionId !== meId) set.add(p.seatId);
  }
  // 車還在半路上就不提示上車（伺服端也會擋，這裡只是別讓提示閃出來）
  if (!coasterAtStation(Date.now())) for (const seat of SEATS) if (seat.ride?.kind === 'coaster') set.add(seat.id);
  return set;
}

export function LocalPlayer() {
  const me = useGame((s) => s.me);
  const group = useRef<Group>(null);
  /** 搭雲霄飛車時角色要跟著軌道俯仰（名牌掛在外層，不跟著斜） */
  const tilt = useRef<Group>(null);
  const keys = useKeyboard();
  const animRef = useRef<AnimState>('idle');
  const lastSent = useRef(0);
  const lastPayload = useRef({ x: NaN, z: NaN, rotY: NaN, anim: '' as string });
  const frame = useRef(0);
  /** 已送出 stand、等待伺服端回應 */
  const standPending = useRef(false);
  /** 正按著把路人押進危險區（放開／失焦時要記得收手） */
  const pinning = useRef(false);

  useEffect(() => {
    if (group.current) {
      group.current.position.set(local.x, 0, local.z);
      group.current.rotation.y = local.rotY;
    }
  }, []);

  // E：撿武器 / 坐下 / 起身；空白鍵：攻擊；Q：放下武器；R：吃掉食物；數字鍵：表情
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        // 匹克球比賽中：空白鍵是揮拍
        if (inCourtMatch(useGame.getState().me?.sessionId)) {
          if (local.dead) return;
          sendSwing({ aimX: Math.sin(local.rotY), aimZ: Math.cos(local.rotY) });
          triggerSwing();
          return;
        }
        // 抱著寵物：空白鍵把牠丟出去
        if (carriedPetId(useGame.getState().me?.sessionId)) {
          if (!local.dead && !local.seatId) sendPetThrow();
          return;
        }
        // 非格鬥模式：手上是運動器材就做運動（啞鈴彎舉）
        const exercise = getWeapon(local.weaponId)?.exercise;
        if (!local.fightMode && exercise) {
          toggleExercise(exercise);
          return;
        }
        if (canAttack(performance.now())) sendAttack();
        return;
      }
      if (e.code === 'KeyF') {
        // 拿著食物：餵附近的寵物，否則放進烤箱 / 放上瓦斯爐
        if (local.dead || local.seatId) return;
        const st = useGame.getState();
        // 拖著路人：按住 F 把他的頭壓進旁邊的爐火／水池，放開才收手
        if (npcTarget.carrierId && npcTarget.carrierId === st.me?.sessionId) {
          if (!st.nearHazard) return;
          pinning.current = true;
          sendNpcPin(true);
          return;
        }
        if (carriedPetId(st.me?.sessionId)) return; // 抱著寵物時手上的食物先留著
        const weapon = getWeapon(local.weaponId);
        if (!weapon?.edible) return;
        if (st.nearPetId) {
          sendFeedPet(st.nearPetId);
        } else if (st.nearOven && !st.oven.foodId && weapon.bakesTo) {
          sendOvenPlace();
        } else if (st.nearStove && !st.stove.foodId) {
          sendStovePlace();
        }
        return;
      }
      if (e.code === 'KeyR') {
        eatHeldFood();
        return;
      }
      if (e.code === 'KeyQ') {
        if (!local.dead && local.weaponId) sendDrop();
        return;
      }
      if (e.code === 'KeyE') {
        if (local.dead) return;
        const state = useGame.getState();
        const { nearSeatId, nearPickupId, nearPetId } = state;
        local.dance = null;
        if (local.seatId) {
          sendStand();
          standPending.current = true;
        } else if (carriedPetId(state.me?.sessionId)) {
          sendPetDrop(); // 抱著寵物時 E 是輕輕放下
        } else if (npcTarget.carrierId && npcTarget.carrierId === state.me?.sessionId) {
          sendNpcDrop(); // 拖著路人時 E 是放開他
        } else if (state.nearCourtSlot && !inCourtMatch(state.me?.sessionId)) {
          sendCourtJoin(state.nearCourtSlot);
        } else if (nearPetId) {
          sendPetPickup(nearPetId);
        } else if (state.nearNpc) {
          sendNpcPickup();
        } else if (state.nearOven && state.oven.foodId && !local.weaponId) {
          sendOvenTake(); // 空手把烤箱裡的食物拿出來
        } else if (state.nearStove && state.stove.stage === 'cooking' && !local.weaponId) {
          sendStoveTake(); // 空手把煎著的食物拿回來
        } else if (nearPickupId) {
          sendPickup(nearPickupId);
        } else if (nearSeatId) {
          sendSit(nearSeatId);
        }
        return;
      }
      const emote = EMOTES.find((em) => e.key === em.key);
      if (emote) {
        triggerEmote(emote.id);
        return;
      }
      const dance = DANCES.find((d) => e.key === d.key);
      if (dance) toggleDance(dance.id);
    };
    // 放開 F（或切走視窗）就收手；漏送的話伺服端會一直押著扣血
    const release = () => {
      if (!pinning.current) return;
      pinning.current = false;
      sendNpcPin(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') release();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const k = keys.current;
    const now = performance.now();

    let ix = 0;
    let iz = 0;
    if (k.forward) iz += 1;
    if (k.back) iz -= 1;
    if (k.right) ix += 1;
    if (k.left) ix -= 1;
    const moving = ix !== 0 || iz !== 0;

    // 倒地：等待復活，位置鎖定
    if (local.dead) {
      local.anim = 'dead';
      animRef.current = 'dead';
      g.position.set(local.x, 0, local.z);
      g.rotation.y = local.rotY;
      useGame.getState().setNearSeat(null);
      return;
    }

    // 被擊退：依伺服端結果補間，期間不接受輸入、不上傳
    const kb = local.knockback;
    if (kb) {
      const t = Math.min(1, (now - kb.start) / (kb.end - kb.start));
      const ease = 1 - (1 - t) * (1 - t);
      local.x = kb.x0 + (kb.x1 - kb.x0) * ease;
      local.z = kb.z0 + (kb.z1 - kb.z0) * ease;
      if (t >= 1) {
        local.x = kb.x1;
        local.z = kb.z1;
        local.knockback = null;
      }
      local.anim = 'hit';
      animRef.current = 'hit';
      g.position.set(local.x, 0, local.z);
      g.rotation.y = local.rotY;
      return;
    }

    // 坐著：位置由伺服端鎖定；按方向鍵視為起身
    if (local.seatId) {
      if (moving && !standPending.current) {
        sendStand();
        standPending.current = true;
      }
      const seat = SEAT_BY_ID.get(local.seatId);
      const seatAnim = seat?.anim ?? 'sit';
      local.anim = seatAnim;
      animRef.current = seatAnim;
      // 旋轉木馬：位置每幀自己用同一條式子算，才不會跟著 20Hz 的同步一格一格跳。
      // 順手寫回 local，讓相機也跟著轉
      const ride = seat ? rideSeatAt(seat, Date.now()) : null;
      if (ride) {
        local.x = ride.x;
        local.z = ride.z;
        local.rotY = ride.rotY;
        g.position.set(ride.x, ride.y, ride.z);
        if (tilt.current) tilt.current.rotation.x = -ride.pitch;
      } else {
        g.position.set(local.x, 0, local.z);
        if (tilt.current && tilt.current.rotation.x !== 0) tilt.current.rotation.x = 0;
      }
      g.rotation.y = local.rotY;
      useGame.getState().setNearSeat(null);
      return;
    }
    standPending.current = false;

    let anim: AnimState = 'idle';
    const staggered = now < local.staggerUntil;

    if (moving && !staggered) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;

      // 以相機朝向為基準：forward = (-sin yaw, -cos yaw)，right = (cos yaw, -sin yaw)
      const sy = Math.sin(rig.yaw);
      const cy = Math.cos(rig.yaw);
      const dirX = -sy * iz + cy * ix;
      const dirZ = -cy * iz - sy * ix;

      const speed = k.run ? RUN_SPEED : WALK_SPEED;
      anim = k.run ? 'run' : 'walk';
      const step = Math.min(dt, 0.05) * speed;
      const next = moveWithCollision({ x: local.x, z: local.z }, dirX * step, dirZ * step, undefined, obstaclePlayers());
      local.x = next.x;
      local.z = next.z;

      const targetRot = Math.atan2(dirX, dirZ);
      local.rotY = lerpAngle(local.rotY, targetRot, 1 - Math.exp(-dt * 14));
      local.emote = null;
      local.dance = null;
      local.exercise = null;
      local.eatUntil = 0;
    } else if (staggered) {
      anim = 'hit';
    } else if (now < local.eatUntil) {
      anim = 'eat';
    } else if (local.emote && now < local.emoteUntil) {
      anim = local.emote;
    } else if (local.dance) {
      anim = local.dance;
    } else if (local.exercise && getWeapon(local.weaponId)?.exercise === local.exercise) {
      anim = local.exercise;
    } else {
      local.emote = null;
      local.exercise = null;
    }
    // 攻擊動畫優先於走路與表情
    if (now < local.attackUntil) anim = local.attackAnim;

    local.anim = anim;
    animRef.current = anim;
    g.position.set(local.x, 0, local.z);
    g.rotation.y = local.rotY;

    // 附近座位 / 武器掃描
    if (++frame.current % SEAT_SCAN_INTERVAL === 0) {
      const seat = findNearestSeat(local.x, local.z, occupiedSeats(useGame.getState().me?.sessionId));
      useGame.getState().setNearSeat(seat?.id ?? null);
      useGame.getState().setNearPickup(nearestPickup(local.x, local.z));
      useGame.getState().setNearPet(nearestPet(local.x, local.z));
      // 路人：沒被別人拖著、站得夠近才提示拖走；拖著的時候改提示腳邊的危險區
      const meId = useGame.getState().me?.sessionId;
      const draggingNpc = npcTarget.carrierId !== '' && npcTarget.carrierId === meId;
      const npcReachable =
        !npcTarget.carrierId && npcTarget.anim !== 'dead' && Math.hypot(local.x - npcTarget.x, local.z - npcTarget.z) <= NPC.pickupRange;
      useGame.getState().setNearNpc(npcReachable);
      useGame.getState().setNearHazard(draggingNpc ? findNpcHazard(local.x, local.z) : null);
      // 爐子與烤箱只隔 2.6m，站在冰箱前會同時進到兩者範圍；只認比較近的那一台，提示才不會打架
      const dStove = Math.hypot(local.x - STOVE.x, local.z - STOVE.z);
      const dOven = Math.hypot(local.x - OVEN.x, local.z - OVEN.z);
      useGame.getState().setNearStove(dStove <= STOVE.range && dStove <= dOven);
      useGame.getState().setNearOven(dOven <= OVEN.range && dOven < dStove);
      const court = useGame.getState().court;
      const nearA = Math.hypot(local.x - COURT.slotA.x, local.z - COURT.slotA.z) <= COURT.joinRange;
      const nearB = Math.hypot(local.x - COURT.slotB.x, local.z - COURT.slotB.z) <= COURT.joinRange;
      const slot = nearA && !court.aId ? 'A' : nearB && !court.bId ? 'B' : null;
      useGame.getState().setNearCourtSlot(court.status === 'over' ? null : slot);
    }

    // 20Hz 上傳；靜止且無變化時不重複送
    const clockMs = state.clock.elapsedTime * 1000;
    if (clockMs - lastSent.current >= SYNC_INTERVAL_MS) {
      const p = lastPayload.current;
      const changed =
        Math.abs(p.x - local.x) > 1e-4 || Math.abs(p.z - local.z) > 1e-4 || Math.abs(p.rotY - local.rotY) > 1e-3 || p.anim !== anim;
      if (changed) {
        sendMove({ x: local.x, z: local.z, rotY: local.rotY, anim });
        p.x = local.x;
        p.z = local.z;
        p.rotY = local.rotY;
        p.anim = anim;
      }
      lastSent.current = clockMs;
    }
  });

  const weaponId = useGame((s) => (me ? s.players[me.sessionId]?.weaponId : '') ?? '');
  const carrying = useGame((s) => (me ? Object.values(s.pets).some((p) => p.carrierId === me.sessionId) : false));
  const onFire = useGame((s) => (me ? (s.players[me.sessionId]?.onFire ?? false) : false));
  if (!me) return null;
  const avatar = getAvatar(me.avatarId);

  return (
    <group ref={group}>
      <group ref={tilt}>
        <Avatar avatar={avatar} animRef={animRef} weaponId={weaponId} carrying={carrying} />
      </group>
      {onFire && <FireFX position={[0, 1.72, 0]} scale={0.55} rate={26} />}
      <NameTag sessionId={me.sessionId} isMe />
      {/* 腳下標示圈 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.46, 32]} />
        <meshBasicMaterial color={avatar.color} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
