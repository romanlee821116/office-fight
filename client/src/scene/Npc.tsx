import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { DoubleSide } from 'three';
import { NPC, NPC_CATCH_LINE, NPC_HAZARDS, POND, getAvatar, type AnimState } from '@office/shared';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';
import { FireFX } from './FireFX';
import { SpeechBubble } from './SpeechBubble';
import { SplashFX } from './SplashFX';
import { local, npcTarget, remoteTargets } from './runtime';

const SNAP_DISTANCE = 4;
/** 掙扎抖動的角速度（rad/s） */
const STRUGGLE_OMEGA = (Math.PI * 2000) / NPC.struggleMs;
/**
 * 被押住時整個人被倒提過來、頭朝下。把身體繞 X 軸前傾 NPC.pinPitch 之後，
 * 頭頂會跑到 (0, headY·cos, headY·sin)，所以再用這組位移把它推回群組原點正上方，
 * 頭就正好壓在危險區的檯面／水面上。
 */
const PIN_HEAD_Z = -Math.sin(NPC.pinPitch) * NPC.headY;
const PIN_HEAD_Y = -Math.cos(NPC.pinPitch) * NPC.headY;
/**
 * 被拖著時同樣繞 X 軸前傾，但只傾到 NPC.dragPitch：腳拖在地上、上半身被提著。
 * 一樣把頭推回群組原點正上方，群組原點就是「拖的人手抓著的那一點」。
 */
const DRAG_HEAD_Z = -Math.sin(NPC.dragPitch) * NPC.headY;
const DRAG_HEAD_Y = Math.cos(NPC.dragPitch) * NPC.headY;

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
  // 頭被壓下去或人被拖著躺平時，名牌與泡泡要跟著頭降下來才對得上人
  const tagY = npc.pinnedAt ? NPC_HAZARDS[npc.pinnedAt].headY + 0.75 : npc.carrierId ? DRAG_HEAD_Y + 0.75 : NPC.tagHeight;
  return (
    <Html position={[0, tagY, 0]} center distanceFactor={14} zIndexRange={[45, 0]} style={{ pointerEvents: 'none' }}>
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
 * 丁oe 正前方的視線範圍：貼地的半圓（180°、半徑 NPC.visionRange）。
 * 走進去就會被抓回辦公室，所以永遠畫出來讓人有機會繞到他背後。
 * 剛抓到人的那幾秒轉成紅色，看得出來是誰惹的禍。
 */
function VisionFan() {
  const bubble = useGame((s) => s.bubbles[NPC.id]);
  const alert = bubble?.text === NPC_CATCH_LINE;
  const color = alert ? '#ef4444' : '#f59e0b';
  return (
    <group>
      {/* 半圓從 θ=π 到 2π：轉平之後正好蓋住群組的 +Z（也就是他面朝的方向） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[NPC.visionRange, 48, Math.PI, Math.PI]} />
        <meshBasicMaterial color={color} transparent opacity={alert ? 0.3 : 0.12} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[NPC.visionRange - 0.1, NPC.visionRange, 48, 1, Math.PI, Math.PI]} />
        <meshBasicMaterial color={color} transparent opacity={alert ? 0.75 : 0.4} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * 辦公室路人：伺服端 AI 驅動，前端只做插補與動畫。
 * 借用玩家的角色模型與 AnimState，所以動作直接交給 Avatar 播。
 * 被拖著時躺在拖的人身後（跟本地位置插補比等伺服端同步順），
 * 被押進爐火／水池時則釘在危險區上左右掙扎。
 */
export function Npc() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const animRef = useRef<AnimState>('idle');
  const avatar = getAvatar(NPC.avatarId);
  const onFire = useGame((s) => s.npc.onFire);
  const pinnedAt = useGame((s) => s.npc.pinnedAt);
  const down = useGame((s) => s.npc.anim === 'dead');
  // 火與水花掛在沒被旋轉的 group 上，才不會跟著倒栽蔥的身體一起翻過去
  const carried = useGame((s) => s.npc.carrierId !== '');
  const headPos: [number, number, number] = pinnedAt
    ? [0, NPC_HAZARDS[pinnedAt].headY, 0]
    : carried
      ? [0, DRAG_HEAD_Y, 0]
      : [0, 1.72, 0];

  useFrame((state, dt) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;

    if (npcTarget.fresh) {
      g.position.set(npcTarget.x, 0, npcTarget.z);
      g.rotation.y = npcTarget.rotY;
      npcTarget.fresh = false;
    }

    const meId = useGame.getState().me?.sessionId;
    const carrier = npcTarget.carrierId ? (npcTarget.carrierId === meId ? local : remoteTargets.get(npcTarget.carrierId)) : undefined;
    const pinned = npcTarget.pinnedAt;
    const k = 1 - Math.exp(-dt * 12);

    if (carrier && !pinned) {
      // 被拖著：頭跟在拖的人正後方（跟著本地位置插補，比等伺服端同步順）
      const kc = 1 - Math.exp(-dt * 18);
      const tx = carrier.x - Math.sin(carrier.rotY) * NPC.dragDist;
      const tz = carrier.z - Math.cos(carrier.rotY) * NPC.dragDist;
      g.position.x += (tx - g.position.x) * kc;
      g.position.z += (tz - g.position.z) * kc;
      g.rotation.y = lerpAngle(g.rotation.y, carrier.rotY, kc);
    } else {
      const dx = npcTarget.x - g.position.x;
      const dz = npcTarget.z - g.position.z;
      // 被打倒後會在別處重新站起來，距離太遠就直接 snap，不要用滑的
      if (Math.hypot(dx, dz) > SNAP_DISTANCE) {
        g.position.x = npcTarget.x;
        g.position.z = npcTarget.z;
      } else {
        g.position.x += dx * k;
        g.position.z += dz * k;
      }
      g.rotation.y = lerpAngle(g.rotation.y, npcTarget.rotY, k);
    }

    // 人一律貼著地面，倒提／拖行的高度全交給身體自己的姿勢
    g.position.y += (0 - g.position.y) * k;

    if (pinned) {
      // 倒提過來、頭壓進檯面／水面，同時左右掙扎
      b.rotation.x = NPC.pinPitch;
      b.position.z = PIN_HEAD_Z;
      b.position.y = NPC_HAZARDS[pinned].headY + PIN_HEAD_Y;
      b.position.x = Math.sin(state.clock.elapsedTime * STRUGGLE_OMEGA) * NPC.struggleAmp;
    } else if (carrier) {
      // 被拖著：腳拖在地上，上半身被提著
      b.rotation.x = NPC.dragPitch;
      b.position.set(0, 0, DRAG_HEAD_Z);
    } else if (b.rotation.x !== 0 || b.position.lengthSq() !== 0) {
      b.rotation.x = 0;
      b.position.set(0, 0, 0);
    }

    animRef.current = npcTarget.anim;
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <Avatar avatar={avatar} animRef={animRef} />
      </group>
      {!down && !carried && <VisionFan />}
      {onFire && <FireFX position={headPos} scale={0.55} rate={26} />}
      {pinnedAt === 'pond' && <SplashFX position={[0, POND.headY + 0.2, 0]} scale={1.1} />}
      <NpcTag />
    </group>
  );
}
