import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { AnimState } from '@office/shared';

interface AvatarPrimitiveProps {
  color: string;
  accent: string;
  /** 每幀讀取的可變動畫狀態（避免 re-render） */
  animRef: { current: AnimState };
}

/**
 * 程式生成的低多邊形角色：GLB 載入前的 fallback。模型面向 +Z。
 */
export function AvatarPrimitive({ color, accent, animRef }: AvatarPrimitiveProps) {
  const body = useRef<Group>(null);
  const legL = useRef<Mesh>(null);
  const legR = useRef<Mesh>(null);
  const armL = useRef<Mesh>(null);
  const armR = useRef<Mesh>(null);
  const phase = useRef(Math.random() * Math.PI * 2);

  useFrame((_state, dt) => {
    const anim = animRef.current;
    const speed = anim === 'run' ? 14 : anim === 'walk' ? 9 : 2;
    phase.current += dt * speed;
    const t = phase.current;

    const swing = anim === 'idle' ? 0 : anim === 'run' ? 0.8 : 0.5;
    const bob = anim === 'idle' ? Math.sin(t) * 0.01 : Math.abs(Math.sin(t)) * (anim === 'run' ? 0.06 : 0.035);

    if (legL.current) legL.current.rotation.x = Math.sin(t) * swing;
    if (legR.current) legR.current.rotation.x = -Math.sin(t) * swing;
    if (armL.current) armL.current.rotation.x = -Math.sin(t) * swing * 0.8;
    if (armR.current) armR.current.rotation.x = Math.sin(t) * swing * 0.8;
    if (body.current) {
      body.current.position.y = bob;
      body.current.rotation.x = anim === 'run' ? 0.12 : 0;
    }
  });

  return (
    <group ref={body}>
      {/* 腿 */}
      <mesh ref={legL} position={[-0.12, 0.45, 0]} castShadow>
        <boxGeometry args={[0.16, 0.45, 0.18]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      <mesh ref={legR} position={[0.12, 0.45, 0]} castShadow>
        <boxGeometry args={[0.16, 0.45, 0.18]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      {/* 身體 */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <capsuleGeometry args={[0.26, 0.5, 6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 手臂 */}
      <mesh ref={armL} position={[-0.36, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh ref={armR} position={[0.36, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 頭 */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.3, 20, 16]} />
        <meshStandardMaterial color="#FFE3C6" />
      </mesh>
      {/* 頭髮 */}
      <mesh position={[0, 1.75, -0.04]} castShadow>
        <sphereGeometry args={[0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      {/* 眼睛 */}
      <mesh position={[-0.1, 1.64, 0.26]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#2B3440" />
      </mesh>
      <mesh position={[0.1, 1.64, 0.26]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#2B3440" />
      </mesh>
    </group>
  );
}
