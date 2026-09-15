import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { NPC, getAvatar, type AnimState } from '@office/shared';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { SpeechBubble } from './SpeechBubble';
import { npcTarget } from './runtime';

const SNAP_DISTANCE = 4;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/** 路人頭上的名牌、對話泡泡與血條（血條只在受傷時顯示） */
function NpcTag() {
  const npc = useGame((s) => s.npc);
  const bubble = useGame((s) => s.bubbles[NPC.id]);
  return (
    <Html position={[0, NPC.tagHeight, 0]} center distanceFactor={14} zIndexRange={[45, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-1 select-none" style={{ transform: 'translateY(-100%)' }}>
        {bubble && <SpeechBubble text={bubble.text} />}
        <div className="rounded-full bg-white/85 px-2.5 py-0.5 text-[12px] font-medium text-ink shadow whitespace-nowrap">{NPC.name}</div>
        {npc.hp < NPC.maxHp && npc.hp > 0 && (
          <div className="h-1 w-14 overflow-hidden rounded-full bg-black/30">
            <div
              className={'h-full rounded-full transition-[width] duration-200 ' + (npc.hp > 50 ? 'bg-emerald-400' : 'bg-red-500')}
              style={{ width: `${(npc.hp / NPC.maxHp) * 100}%` }}
            />
          </div>
        )}
      </div>
    </Html>
  );
}

/**
 * 辦公室路人：伺服端 AI 驅動，前端只做插補與動畫。
 * 借用玩家的角色模型與 AnimState，所以動作直接交給 Avatar 播。
 */
export function Npc() {
  const group = useRef<Group>(null);
  const animRef = useRef<AnimState>('idle');
  const avatar = getAvatar(NPC.avatarId);

  useFrame((_state, dt) => {
    const g = group.current;
    if (!g) return;

    if (npcTarget.fresh) {
      g.position.set(npcTarget.x, 0, npcTarget.z);
      g.rotation.y = npcTarget.rotY;
      npcTarget.fresh = false;
    }

    const dx = npcTarget.x - g.position.x;
    const dz = npcTarget.z - g.position.z;
    // 被打倒後會在別處重新站起來，距離太遠就直接 snap，不要用滑的
    if (Math.hypot(dx, dz) > SNAP_DISTANCE) {
      g.position.set(npcTarget.x, 0, npcTarget.z);
    } else {
      const k = 1 - Math.exp(-dt * 12);
      g.position.x += dx * k;
      g.position.z += dz * k;
    }
    g.rotation.y = lerpAngle(g.rotation.y, npcTarget.rotY, 1 - Math.exp(-dt * 12));
    animRef.current = npcTarget.anim;
  });

  return (
    <group ref={group}>
      <Avatar avatar={avatar} animRef={animRef} />
      <NpcTag />
    </group>
  );
}
