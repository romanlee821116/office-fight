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
  POKER_SEATS,
  RUN_SPEED,
  SEAT_INTERACT_DISTANCE,
  SEATS,
  SEAT_BY_ID,
  SNOWFIGHT,
  STOVE,
  SYNC_INTERVAL_MS,
  WALK_SPEED,
  clampToSnowArena,
  findNearestSeat,
  findNpcHazard,
  getAvatar,
  getWeapon,
  moveWithCollision,
  nearestSnowPile,
  rideBoardable,
  rideSeatAt,
  snowConfined,
  type AnimState,
  type SnowTeam,
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
  sendPokerSit,
  sendSit,
  sendSnowJoin,
  sendSnowReload,
  sendStand,
  sendStovePlace,
  sendStoveTake,
  sendSwing,
} from '../net/client';
import { useGame } from '../store/useGame';
import { AimGuide } from './AimGuide';
import { Avatar } from './Avatar';
import { FireFX } from './FireFX';
import { NameTag } from './NameTag';
import { TeamRing } from './TeamRing';
import { canAttack, local, npcTarget, petTargets, remoteTargets, rig, toggleDance, toggleExercise, triggerEmote, triggerSwing } from './runtime';
import { uiCapturingKeys, useKeyboard } from './useKeyboard';

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

/** 站得夠近的雪仗報名點；比賽結算中不提示（等清場） */
/**
 * 最近的空牌桌座位索引，沒有就回 -1。
 * 位子有沒有人看 store 的 poker.seats 而不是座位佔用表——NPC 也會佔位子。
 */
function nearestPokerSeat(x: number, z: number): number {
  const seats = useGame.getState().poker.seats;
  let best = -1;
  let bestDist = SEAT_INTERACT_DISTANCE;
  for (const [index, seat] of POKER_SEATS.entries()) {
    if (seats[index]?.id) continue;
    const d = Math.hypot(seat.x - x, seat.z - z);
    if (d < bestDist) {
      best = index;
      bestDist = d;
    }
  }
  return best;
}

function nearestSnowSlot(x: number, z: number): SnowTeam | null {
  if (useGame.getState().snow.status === 'over') return null;
  const dRed = Math.hypot(x - SNOWFIGHT.slotRed.x, z - SNOWFIGHT.slotRed.z);
  const dBlue = Math.hypot(x - SNOWFIGHT.slotBlue.x, z - SNOWFIGHT.slotBlue.z);
  if (dRed <= SNOWFIGHT.joinRange && dRed <= dBlue) return 'red';
  if (dBlue <= SNOWFIGHT.joinRange) return 'blue';
  return null;
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
  // 設施跑到一半就不提示上車（伺服端也會擋，這裡只是別讓提示閃出來）
  const now = Date.now();
  for (const seat of SEATS) if (seat.ride && !rideBoardable(seat, now)) set.add(seat.id);
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
      if (isTyping(e.target) || uiCapturingKeys() || e.repeat) return;
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
        // 站在隊旗上：報名分隊（自由模式的人也可以，這是從自由模式轉進比賽的入口）
        if (state.nearSnowSlot) {
          sendSnowJoin(state.nearSnowSlot);
          return;
        }
        // 雪仗模式下剩下能做的只有補雪球；場地裡沒有其他可互動的東西
        if (local.snowMode) {
          if (state.nearSnowPile) sendSnowReload();
          return;
        }
        if (local.seatId) {
          sendStand();
          standPending.current = true;
        } else if (carriedPetId(state.me?.sessionId)) {
          sendPetDrop(); // 抱著寵物時 E 是輕輕放下
        } else if (npcTarget.carrierId && npcTarget.carrierId === state.me?.sessionId) {
          sendNpcDrop(); // 拖著路人時 E 是放開他
        } else if (state.nearCourtSlot && !inCourtMatch(state.me?.sessionId)) {
          sendCourtJoin(state.nearCourtSlot);
        } else if (state.nearPokerSeat >= 0) {
          sendPokerSit(state.nearPokerSeat);
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

    // 傾角每幀先歸零，真的在搭乘時下面才會設回去。
    // 倒地與擊退都會提前 return，所以不能只在座位分支裡重設，
    // 否則在雲霄飛車上跳車摔死後，復活也會一直是傾倒的。
    if (tilt.current) tilt.current.rotation.x = 0;

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
      }
      g.rotation.y = local.rotY;
      useGame.getState().setNearSeat(null);
      return;
    }
    standPending.current = false;

    let anim: AnimState = 'idle';
    const staggered = now < local.staggerUntil;
    // 被丁oe逮到，他念完之前動不了（伺服端也會擋下這段時間的移動）
    const frozen = now < local.frozenUntil;

    if (moving && !staggered && !frozen) {
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
      local.rotY = lerpAngle(local.rotY, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 14));
      const step = Math.min(dt, 0.05) * speed;
      const next = moveWithCollision({ x: local.x, z: local.z }, dirX * step, dirZ * step, undefined, obstaclePlayers());
      // 分隊比賽中走不出場地（伺服端也會夾一次，兩邊用同一條式子）；自由模式想走就走
      const bounded = snowConfined(local.snowMode, local.snowTeam) ? clampToSnowArena(next.x, next.z) : next;
      local.x = bounded.x;
      local.z = bounded.z;

      local.emote = null;
      local.dance = null;
      local.exercise = null;
      local.eatUntil = 0;
    } else if (staggered) {
      anim = 'hit';
    } else if (frozen) {
      anim = 'idle';
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
      // 被他逮到的那兩秒動不了，自然也拖不動他
      const npcReachable =
        !npcTarget.carrierId &&
        npcTarget.anim !== 'dead' &&
        now >= local.frozenUntil &&
        Math.hypot(local.x - npcTarget.x, local.z - npcTarget.z) <= NPC.pickupRange;
      useGame.getState().setNearNpc(npcReachable);
      useGame.getState().setNearHazard(draggingNpc ? findNpcHazard(local.x, local.z) : null);
      // 爐子與烤箱只隔 2.6m，站在冰箱前會同時進到兩者範圍；只認比較近的那一台，提示才不會打架
      const dStove = Math.hypot(local.x - STOVE.x, local.z - STOVE.z);
      const dOven = Math.hypot(local.x - OVEN.x, local.z - OVEN.z);
      useGame.getState().setNearStove(dStove <= STOVE.range && dStove <= dOven);
      useGame.getState().setNearOven(dOven <= OVEN.range && dOven < dStove);
      // 雪仗：場上時掃雪堆補彈點。報名點在場地內，而走進場地就會自動進入自由模式，
      // 所以這裡不能用 snowMode 擋——只有「已經有隊伍」的人才不需要再提示報名
      useGame.getState().setNearSnowPile(local.snowMode && nearestSnowPile(local.x, local.z, SNOWFIGHT.pileRange) !== null);
      useGame.getState().setNearSnowSlot(local.snowTeam ? null : nearestSnowSlot(local.x, local.z));
      const court = useGame.getState().court;
      const nearA = Math.hypot(local.x - COURT.slotA.x, local.z - COURT.slotA.z) <= COURT.joinRange;
      const nearB = Math.hypot(local.x - COURT.slotB.x, local.z - COURT.slotB.z) <= COURT.joinRange;
      const slot = nearA && !court.aId ? 'A' : nearB && !court.bId ? 'B' : null;
      useGame.getState().setNearCourtSlot(court.status === 'over' ? null : slot);
      // 牌桌：找最近的空位；已經坐著的人不需要提示
      useGame.getState().setNearPokerSeat(local.seatId ? -1 : nearestPokerSeat(local.x, local.z));
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
  const snowTeam = useGame((s) => (me ? (s.players[me.sessionId]?.snowTeam ?? '') : ''));
  const snowMode = useGame((s) => (me ? (s.players[me.sessionId]?.snowMode ?? false) : false));
  const fightMode = useGame((s) => (me ? (s.players[me.sessionId]?.fightMode ?? false) : false));
  const crowned = useGame((s) => (me ? (s.players[me.sessionId]?.npcSlayer ?? false) : false));
  const hatId = useGame((s) => (me ? (s.players[me.sessionId]?.hatId ?? '') : ''));
  const outfitId = useGame((s) => (me ? (s.players[me.sessionId]?.outfitId ?? '') : ''));
  const faceUrl = useGame((s) => (me ? (s.players[me.sessionId]?.faceUrl ?? '') : ''));
  if (!me) return null;
  const avatar = getAvatar(me.avatarId);

  return (
    <group ref={group}>
      <group ref={tilt}>
        <Avatar avatar={avatar} animRef={animRef} weaponId={weaponId} carrying={carrying} crowned={crowned} hatId={hatId} outfitId={outfitId} faceUrl={faceUrl} />
      </group>
      {onFire && <FireFX position={[0, 1.72, 0]} scale={0.55} rate={26} />}
      {/* 拿著遠程武器且進入戰鬥狀態時，把命中判定畫在地上 */}
      {(fightMode || snowMode) && <AimGuide weaponId={weaponId} />}
      <NameTag sessionId={me.sessionId} isMe />
      {/* 腳下標示圈；分隊打雪仗時外圈再加一道隊伍色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.46, 32]} />
        <meshBasicMaterial color={avatar.color} transparent opacity={0.7} />
      </mesh>
      {snowTeam && <TeamRing team={snowTeam as SnowTeam} out={!snowMode} />}
    </group>
  );
}
