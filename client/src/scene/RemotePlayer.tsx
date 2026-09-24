import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { SEAT_BY_ID, getAvatar, rideSeatAt, type AnimState, type SnowTeam } from '@office/shared';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { FireFX } from './FireFX';
import { NameTag } from './NameTag';
import { TeamRing } from './TeamRing';
import { remoteTargets } from './runtime';

interface RemotePlayerProps {
  sessionId: string;
  avatarId: string;
}

const SNAP_DISTANCE = 4;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function RemotePlayer({ sessionId, avatarId }: RemotePlayerProps) {
  const group = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const animRef = useRef<AnimState>('idle');
  const avatar = getAvatar(avatarId);
  const weaponId = useGame((s) => s.players[sessionId]?.weaponId ?? '');
  const carrying = useGame((s) => Object.values(s.pets).some((p) => p.carrierId === sessionId));
  const onFire = useGame((s) => s.players[sessionId]?.onFire ?? false);
  const seatId = useGame((s) => s.players[sessionId]?.seatId ?? '');
  const snowTeam = useGame((s) => s.players[sessionId]?.snowTeam ?? '');
  const crowned = useGame((s) => s.players[sessionId]?.npcSlayer ?? false);
  const hatId = useGame((s) => s.players[sessionId]?.hatId ?? '');
  const outfitId = useGame((s) => s.players[sessionId]?.outfitId ?? '');
  const snowMode = useGame((s) => s.players[sessionId]?.snowMode ?? false);

  useFrame((_state, dt) => {
    const g = group.current;
    const t = remoteTargets.get(sessionId);
    if (!g || !t) return;

    // 旋轉木馬上的人不吃網路插補：用跟伺服端同一條式子直接算，畫面才會平順且與木馬對齊
    const ride = seatId ? rideSeatAt(SEAT_BY_ID.get(seatId)!, Date.now()) : null;
    if (ride) {
      g.position.set(ride.x, ride.y, ride.z);
      g.rotation.y = ride.rotY;
      if (tilt.current) tilt.current.rotation.x = -ride.pitch;
      animRef.current = t.anim;
      t.fresh = true; // 下車時直接 snap 回伺服端位置
      return;
    }
    if (tilt.current && tilt.current.rotation.x !== 0) tilt.current.rotation.x = 0;

    if (t.fresh) {
      g.position.set(t.x, 0, t.z);
      g.rotation.y = t.rotY;
      t.fresh = false;
      return;
    }

    const dx = t.x - g.position.x;
    const dz = t.z - g.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > SNAP_DISTANCE) {
      g.position.set(t.x, 0, t.z);
    } else {
      const k = 1 - Math.exp(-dt * 12);
      g.position.x += dx * k;
      g.position.z += dz * k;
    }
    g.rotation.y = lerpAngle(g.rotation.y, t.rotY, 1 - Math.exp(-dt * 12));

    // 若目標已停但插補尚在移動，仍用伺服端的 anim；避免滑行時看起來像 idle
    animRef.current = dist > 0.05 && t.anim === 'idle' ? 'walk' : t.anim;
    if (t.anim === 'sit' || t.anim === 'benchpress' || t.anim === 'run') g.rotation.y = t.rotY;
  });

  return (
    <group ref={group}>
      <group ref={tilt}>
        <Avatar avatar={avatar} animRef={animRef} weaponId={weaponId} carrying={carrying} crowned={crowned} hatId={hatId} outfitId={outfitId} />
      </group>
      {onFire && <FireFX position={[0, 1.72, 0]} scale={0.55} rate={26} />}
      {snowTeam && <TeamRing team={snowTeam as SnowTeam} out={!snowMode} />}
      <NameTag sessionId={sessionId} />
    </group>
  );
}
