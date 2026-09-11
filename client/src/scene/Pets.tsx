import { Suspense, useMemo, useRef } from 'react';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { LoopRepeat, Mesh, type Group } from 'three';
import { PET, PETS, getPet, type PetAnim } from '@office/shared';
import { useGame } from '../store/useGame';
import { toLit } from './Avatar';
import { petTargets } from './runtime';

export function petUrl(model: string): string {
  return `/models/pets/${model}.glb`;
}
PETS.forEach((p) => useGLTF.preload(petUrl(p.model)));

const CLIP_BY_ANIM: Record<PetAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  dance: 'dance',
  hit: 'gesture-negative',
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
  return (
    <Html position={[0, PET.tagHeight, 0]} center distanceFactor={14} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-1 select-none" style={{ transform: 'translateY(-100%)' }}>
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

  useFrame((_state, dt) => {
    const g = group.current;
    const b = body.current;
    const t = petTargets.get(id);
    if (!g || !b || !t) return;

    if (t.fresh) {
      g.position.set(t.x, 0, t.z);
      g.rotation.y = t.rotY;
      t.fresh = false;
    }

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
      <group ref={body} scale={PET.scale}>
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
