import { Suspense, useMemo, useRef } from 'react';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { LoopRepeat, Mesh, type Group } from 'three';
import { PET, PETS, getPet, petSizeFactor, type PetAnim } from '@office/shared';
import { useGame } from '../store/useGame';
import { toLit } from './Avatar';
import { local, petTargets, remoteTargets } from './runtime';

export function petUrl(model: string): string {
  return `/models/pets/${model}.glb`;
}
PETS.forEach((p) => useGLTF.preload(petUrl(p.model)));

const CLIP_BY_ANIM: Record<PetAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  dance: 'dance',
  hit: 'gesture-negative',
  thrown: 'run', // 飛行中腳亂踢
  eat: 'eat',
  dead: 'idle',
};
const SNAP_DISTANCE = 4;
const FADE_SEC = 0.15;
/** 倒地翻倒速度（弧度/秒） */
const TIP_SPEED = 6;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/** 寵物頭上的名牌與血條（血條只在受傷時顯示） */
function PetTag({ id }: { id: string }) {
  const pet = useGame((s) => s.pets[id]);
  if (!pet) return null;
  const def = getPet(pet.petType);
  const eating = pet.anim === 'eat';
  const tagY = PET.tagHeight * petSizeFactor(pet.feedCount, PET.feedMax);
  return (
    <Html position={[0, tagY, 0]} center distanceFactor={14} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-1 select-none" style={{ transform: 'translateY(-100%)' }}>
        {eating && (
          <div className="relative h-5 w-16">
            {['-28px', '0px', '26px'].map((x, i) => (
              <span
                key={x}
                className="heart-float absolute bottom-0 left-1/2 text-[15px]"
                style={{ marginLeft: x, animationDelay: `${i * 0.4}s` }}
                aria-hidden
              >
                {i === 1 ? '💖' : '❤️'}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-ink shadow whitespace-nowrap">🐾 {def.name}</div>
        {pet.hp < PET.maxHp && pet.hp > 0 && (
          <div className="h-1 w-14 overflow-hidden rounded-full bg-black/30">
            <div
              className={'h-full rounded-full transition-[width] duration-200 ' + (pet.hp > 50 ? 'bg-emerald-400' : 'bg-red-500')}
              style={{ width: `${(pet.hp / PET.maxHp) * 100}%` }}
            />
          </div>
        )}
      </div>
    </Html>
  );
}

function PetModel({ id, petType }: { id: string; petType: string }) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const { scene, animations } = useGLTF(petUrl(getPet(petType).model));

  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      obj.material = Array.isArray(obj.material) ? obj.material.map(toLit) : toLit(obj.material);
    });
    return clone;
  }, [scene]);

  const { actions, mixer } = useAnimations(animations, body);
  const current = useRef<string | null>(null);
  const scaleRef = useRef(PET.scale);

  useFrame((_state, dt) => {
    const g = group.current;
    const b = body.current;
    const t = petTargets.get(id);
    if (!g || !b || !t) return;

    if (t.fresh) {
      g.position.set(t.x, 0, t.z);
      g.rotation.y = t.rotY;
      scaleRef.current = PET.scale * petSizeFactor(t.feedCount, PET.feedMax);
      t.fresh = false;
    }

    // 體型隨餵食次數平滑長大
    const targetScale = PET.scale * petSizeFactor(t.feedCount, PET.feedMax);
    scaleRef.current += (targetScale - scaleRef.current) * (1 - Math.exp(-dt * 3));
    b.scale.setScalar(scaleRef.current);

    // 被丟出去：本地播拋物線（落點由伺服端決定）
    if (t.flight) {
      const f = t.flight;
      const p = Math.min(1, (performance.now() - f.startAt) / f.durationMs);
      g.position.x = f.fromX + (f.toX - f.fromX) * p;
      g.position.z = f.fromZ + (f.toZ - f.fromZ) * p;
      g.position.y = PET.carryY * (1 - p) + Math.sin(Math.PI * p) * PET.throwArc;
      b.rotation.x += dt * 12; // 空中翻滾
      if (p >= 1) {
        t.flight = null;
        b.rotation.x = 0;
        g.position.y = 0;
      }
      return;
    }

    // 被抱著：跟著抱的人，浮在頭頂
    const meId = useGame.getState().me?.sessionId;
    if (t.carrierId) {
      const src = t.carrierId === meId ? local : remoteTargets.get(t.carrierId);
      const k = 1 - Math.exp(-dt * 18);
      if (src) {
        g.position.x += (src.x - g.position.x) * k;
        g.position.z += (src.z - g.position.z) * k;
        g.rotation.y = lerpAngle(g.rotation.y, src.rotY, k);
      }
      g.position.y += (PET.carryY - g.position.y) * k;
      if (b.rotation.z !== 0) b.rotation.z = 0;
      const idleClip = 'idle';
      if (idleClip !== current.current) {
        const to = actions[idleClip];
        if (to) {
          to.setLoop(LoopRepeat, Infinity);
          to.reset().play();
          current.current = idleClip;
        }
      }
      return;
    }
    if (g.position.y !== 0) g.position.y = Math.max(0, g.position.y - dt * 6);

    // 位置與朝向插補（伺服端 10Hz 更新）
    const dx = t.x - g.position.x;
    const dz = t.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SNAP_DISTANCE) {
      g.position.set(t.x, 0, t.z);
    } else {
      const k = 1 - Math.exp(-dt * 10);
      g.position.x += dx * k;
      g.position.z += dz * k;
    }
    g.rotation.y = lerpAngle(g.rotation.y, t.rotY, 1 - Math.exp(-dt * 10));

    // 倒地：停止動畫，往側面翻倒
    if (t.anim === 'dead') {
      if (current.current) {
        mixer.stopAllAction();
        current.current = null;
      }
      b.rotation.z = Math.min(Math.PI / 2, b.rotation.z + dt * TIP_SPEED);
      return;
    }
    if (b.rotation.z !== 0) b.rotation.z = 0;

    const next = CLIP_BY_ANIM[t.anim] ?? 'idle';
    if (next !== current.current) {
      const from = current.current ? actions[current.current] : null;
      const to = actions[next];
      if (to) {
        to.setLoop(LoopRepeat, Infinity);
        to.reset().play();
        if (from && from !== to) from.crossFadeTo(to, FADE_SEC, false);
        current.current = next;
      }
    }
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <primitive object={instance} />
      </group>
      <PetTag id={id} />
    </group>
  );
}

/** 辦公室寵物：伺服端 AI 驅動，前端插補與播放動畫 */
export function Pets() {
  const pets = useGame((s) => s.pets);
  return (
    <>
      {Object.values(pets).map((p) => (
        <Suspense key={p.id} fallback={null}>
          <PetModel id={p.id} petType={p.petType} />
        </Suspense>
      ))}
    </>
  );
}
