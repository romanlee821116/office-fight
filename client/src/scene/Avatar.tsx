import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Group, type Material, type Object3D } from 'three';
import { AVATARS, DANCES, type AnimState, type AvatarDef } from '@office/shared';
import { AvatarPrimitive } from './AvatarPrimitive';
import { PROCEDURAL_BPM, dancePose, isProcedural } from './dances';
import { HeldWeapon } from './HeldWeapon';

/** Kenney Blocky Characters 高 2.7 單位，縮放後約 1.75m */
export const CHARACTER_SCALE = 0.65;
/** Kenney 模型原始即面向 +Z，與場景慣例一致；若替換其他套件的模型可在此校正 */
const FACING_FIX = 0;
const FADE_SEC = 0.15;

const CLIP_BY_ANIM: Partial<Record<AnimState, string>> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  sit: 'sit',
  'emote-yes': 'emote-yes',
  'emote-no': 'emote-no',
  wave: 'interact-right',
  attack: 'attack-melee-right',
  throw: 'holding-right-shoot',
  hit: 'pick-up',
  dead: 'die',
};
const IDLE_CLIP = 'idle';
/** 手上有武器時的站立姿勢 */
const HOLDING_IDLE = 'holding-right';
const DANCE_BPM = new Map<string, number>([...DANCES.map((d) => [d.id, d.bpm] as [string, number]), ...Object.entries(PROCEDURAL_BPM)]);

/** 跳舞時由程式控制的節點 */
interface DanceNodes {
  root: Object3D;
  torso: Object3D;
  head: Object3D;
  armL: Object3D;
  armR: Object3D;
  legL: Object3D;
  legR: Object3D;
}

function findDanceNodes(root: Object3D): DanceNodes | null {
  const get = (name: string) => root.getObjectByName(name);
  const nodes = {
    root: get('root'),
    torso: get('torso'),
    head: get('head'),
    armL: get('arm-left'),
    armR: get('arm-right'),
    legL: get('leg-left'),
    legR: get('leg-right'),
  };
  return Object.values(nodes).every(Boolean) ? (nodes as DanceNodes) : null;
}

function resetDanceNodes(n: DanceNodes): void {
  n.root.position.set(0, 0, 0);
  n.root.rotation.set(0, 0, 0);
  for (const node of [n.torso, n.head, n.armL, n.armR, n.legL, n.legR]) node.rotation.set(0, 0, 0);
}
/** 播完自動回 idle 的一次性動作與重複次數（表情播兩輪讓幅度明顯） */
const ONE_SHOT: Record<string, number> = {
  'emote-yes': 2,
  'emote-no': 2,
  'interact-right': 2,
  'attack-melee-right': 1,
  'holding-right-shoot': 1,
  'pick-up': 1,
};
/** 播到最後一幀後保持姿勢 */
const HOLD_LAST_FRAME = new Set<string>(['sit', 'die']);

export function characterUrl(model: string): string {
  return `/models/characters/${model}.glb`;
}

interface AvatarProps {
  avatar: AvatarDef;
  /** 每幀讀取的可變動畫狀態（避免 re-render） */
  animRef: { current: AnimState };
  /** 手上的武器 id（空字串為拳頭） */
  weaponId?: string;
}

const litCache = new Map<string, MeshStandardMaterial>();

/** Kenney 模型為 KHR_materials_unlit → MeshBasicMaterial，轉成受光材質以吃場景光與陰影 */
export function toLit(mat: Material): Material {
  if (!(mat instanceof MeshBasicMaterial)) return mat;
  let lit = litCache.get(mat.uuid);
  if (!lit) {
    lit = new MeshStandardMaterial({ map: mat.map, color: mat.color, roughness: 0.85, metalness: 0 });
    litCache.set(mat.uuid, lit);
  }
  return lit;
}

function CharacterModel({ avatar, animRef, weaponId = '' }: AvatarProps) {
  const { scene, animations } = useGLTF(characterUrl(avatar.model));
  const group = useRef<Group>(null);
  const [hand, setHand] = useState<Object3D | null>(null);

  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = false;
      obj.material = Array.isArray(obj.material) ? obj.material.map(toLit) : toLit(obj.material);
    });
    return clone;
  }, [scene]);

  const danceNodes = useRef<DanceNodes | null>(null);
  const dancing = useRef(false);

  useEffect(() => {
    setHand(instance.getObjectByName('arm-right') ?? null);
    danceNodes.current = findDanceNodes(instance);
  }, [instance]);

  const weaponRef = useRef(weaponId);
  weaponRef.current = weaponId;
  /** idle 依是否持武器切換 */
  const idleClip = () => (weaponRef.current ? HOLDING_IDLE : IDLE_CLIP);

  const { actions, mixer } = useAnimations(animations, group);
  /** 目前播放中的 clip */
  const current = useRef<string | null>(null);
  /** 最後一次依 animRef 切換到的 clip（一次性動作播完回 idle 後仍保留，避免重複觸發） */
  const requested = useRef<string | null>(null);

  const playClip = (next: string) => {
    const from = current.current ? actions[current.current] : null;
    const to = actions[next];
    if (!to) return;
    if (ONE_SHOT[next]) {
      to.setLoop(LoopOnce, 1);
      to.repetitions = ONE_SHOT[next];
      to.clampWhenFinished = false;
    } else if (HOLD_LAST_FRAME.has(next)) {
      to.setLoop(LoopOnce, 1);
      to.clampWhenFinished = true;
    } else {
      to.setLoop(LoopRepeat, Infinity);
      to.clampWhenFinished = false;
    }
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, FADE_SEC, false);
    current.current = next;
  };

  useEffect(() => {
    playClip(idleClip());
    requested.current = idleClip();
    const onFinished = (e: { action: { getClip(): { name: string } } }) => {
      if (dancing.current) return;
      if (ONE_SHOT[e.action.getClip().name] && current.current === e.action.getClip().name) {
        playClip(idleClip());
      }
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, mixer]);

  useFrame(() => {
    const anim = animRef.current;

    // 跳舞 / 器材動作：暫停動畫混合器，直接由程式設定節點角度；所有客戶端用牆上時鐘算節拍以對拍
    if (isProcedural(anim)) {
      const nodes = danceNodes.current;
      if (!nodes) return;
      if (!dancing.current) {
        mixer.stopAllAction();
        current.current = null;
        requested.current = anim;
        dancing.current = true;
      }
      const beat = (Date.now() / 1000) * ((DANCE_BPM.get(anim) ?? 120) / 60);
      const pose = dancePose(anim, beat);
      nodes.root.position.set(0, pose.rootY, pose.rootZ ?? 0);
      nodes.root.rotation.set(pose.rootRotX ?? 0, pose.rootRotY, 0);
      nodes.torso.rotation.set(...pose.torso);
      nodes.head.rotation.set(...pose.head);
      nodes.armL.rotation.set(...pose.armL);
      nodes.armR.rotation.set(...pose.armR);
      nodes.legL.rotation.set(pose.legL, 0, 0);
      nodes.legR.rotation.set(pose.legR, 0, 0);
      return;
    }
    if (dancing.current) {
      dancing.current = false;
      if (danceNodes.current) resetDanceNodes(danceNodes.current);
      current.current = null;
      requested.current = null;
    }

    const next = anim === 'idle' ? idleClip() : (CLIP_BY_ANIM[anim] ?? idleClip());
    if (next === requested.current) return;
    requested.current = next;
    if (next !== current.current) playClip(next);
  });

  return (
    <group ref={group} scale={CHARACTER_SCALE} rotation={[0, FACING_FIX, 0]}>
      <primitive object={instance} />
      <HeldWeapon weaponId={weaponId} hand={hand} />
    </group>
  );
}

/**
 * 角色：Kenney Blocky Characters GLB（含 idle / walk / sprint 動畫），
 * 載入前以程式生成幾何顯示。對外朝向為 +Z。
 */
AVATARS.forEach((a) => useGLTF.preload(characterUrl(a.model)));

export function Avatar({ avatar, animRef, weaponId = '' }: AvatarProps) {
  return (
    <Suspense fallback={<AvatarPrimitive color={avatar.color} accent={avatar.accent} animRef={animRef} />}>
      <CharacterModel avatar={avatar} animRef={animRef} weaponId={weaponId} />
    </Suspense>
  );
}
