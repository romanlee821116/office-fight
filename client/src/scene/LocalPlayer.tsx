import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  DANCES,
  EMOTES,
  PICKUPS,
  RUN_SPEED,
  SEAT_BY_ID,
  SYNC_INTERVAL_MS,
  WALK_SPEED,
  findNearestSeat,
  getAvatar,
  getWeapon,
  moveWithCollision,
  type AnimState,
} from '@office/shared';
import { sendAttack, sendDrop, sendMove, sendPickup, sendSit, sendStand } from '../net/client';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { NameTag } from './NameTag';
import { canAttack, local, remoteTargets, rig, toggleDance, toggleExercise, triggerEmote } from './runtime';
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
  return set;
}

export function LocalPlayer() {
  const me = useGame((s) => s.me);
  const group = useRef<Group>(null);
  const keys = useKeyboard();
  const animRef = useRef<AnimState>('idle');
  const lastSent = useRef(0);
  const lastPayload = useRef({ x: NaN, z: NaN, rotY: NaN, anim: '' as string });
  const frame = useRef(0);
  /** 已送出 stand、等待伺服端回應 */
  const standPending = useRef(false);

  useEffect(() => {
    if (group.current) {
      group.current.position.set(local.x, 0, local.z);
      group.current.rotation.y = local.rotY;
    }
  }, []);

  // E：撿武器 / 坐下 / 起身；空白鍵：攻擊；Q：丟下武器；數字鍵：表情
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        // 非格鬥模式：手上是運動器材就做運動（啞鈴彎舉）
        const exercise = getWeapon(local.weaponId)?.exercise;
        if (!local.fightMode && exercise) {
          toggleExercise(exercise);
          return;
        }
        if (canAttack(performance.now())) sendAttack();
        return;
      }
      if (e.code === 'KeyQ') {
        if (!local.dead && local.weaponId) sendDrop();
        return;
      }
      if (e.code === 'KeyE') {
        if (local.dead) return;
        const { nearSeatId, nearPickupId } = useGame.getState();
        local.dance = null;
        if (local.seatId) {
          sendStand();
          standPending.current = true;
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      const seatAnim = SEAT_BY_ID.get(local.seatId)?.anim ?? 'sit';
      local.anim = seatAnim;
      animRef.current = seatAnim;
      g.position.set(local.x, 0, local.z);
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
    } else if (staggered) {
      anim = 'hit';
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
  if (!me) return null;
  const avatar = getAvatar(me.avatarId);

  return (
    <group ref={group}>
      <Avatar avatar={avatar} animRef={animRef} weaponId={weaponId} />
      <NameTag sessionId={me.sessionId} isMe />
      {/* 腳下標示圈 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.46, 32]} />
        <meshBasicMaterial color={avatar.color} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
