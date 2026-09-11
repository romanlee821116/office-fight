import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { getAvatar, type AnimState } from '@office/shared';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { NameTag } from './NameTag';
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
  const animRef = useRef<AnimState>('idle');
  const avatar = getAvatar(avatarId);
  const weaponId = useGame((s) => s.players[sessionId]?.weaponId ?? '');
  const carrying = useGame((s) => Object.values(s.pets).some((p) => p.carrierId === sessionId));

  useFrame((_state, dt) => {
    const g = group.current;
    const t = remoteTargets.get(sessionId);
    if (!g || !t) return;

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
      <Avatar avatar={avatar} animRef={animRef} weaponId={weaponId} carrying={carrying} />
      <NameTag sessionId={sessionId} />
    </group>
  );
}
