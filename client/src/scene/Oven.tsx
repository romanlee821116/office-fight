import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshBasicMaterial, PointLight } from 'three';
import { OVEN, getWeapon } from '@office/shared';
import { useGame } from '../store/useGame';
import { FoodModel } from './FoodModel';

/** 烤箱門（正面 +X）上的發光面板尺寸 */
const DOOR_W = 0.6;
const DOOR_H = 0.34;
/** 門面稍微離開家具表面，避免與模型 z-fighting */
const DOOR_X = 0.46;

const BAKING_COLOR = '#F07A1E';
const DONE_COLOR = '#7FC96B';

/** 廚房烤箱的運作光效與出爐的食物（狀態由伺服端驅動） */
export function Oven() {
  const oven = useGame((s) => s.oven);
  const glow = useRef<Mesh>(null);
  const lamp = useRef<PointLight>(null);
  const food = useRef<Group>(null);
  const phase = useRef(0);

  const baking = oven.stage === 'baking';
  const done = oven.stage === 'done';
  const weapon = done && oven.foodId ? getWeapon(oven.foodId) : undefined;

  useFrame((_s, dt) => {
    phase.current += dt;
    // 烤製中爐火忽明忽暗；出爐後改為穩定的亮綠燈
    const flicker = baking ? 0.75 + Math.sin(phase.current * 9) * 0.12 + Math.sin(phase.current * 23) * 0.06 : 1;
    if (glow.current) (glow.current.material as MeshBasicMaterial).opacity = flicker * (done ? 0.9 : 0.85);
    if (lamp.current) lamp.current.intensity = baking ? flicker * 2.4 : 0;
    const g = food.current;
    if (g) {
      g.position.y = Math.sin(phase.current * 2) * 0.05;
      g.rotation.y = phase.current * 0.7;
    }
  });

  return (
    <group position={[OVEN.x, 0, OVEN.z]}>
      {(baking || done) && (
        <>
          <mesh ref={glow} position={[DOOR_X, OVEN.doorY, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[DOOR_W, DOOR_H]} />
            <meshBasicMaterial color={done ? DONE_COLOR : BAKING_COLOR} transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <pointLight ref={lamp} position={[DOOR_X + 0.35, OVEN.doorY, 0]} color={BAKING_COLOR} intensity={0} distance={2.2} decay={2} />
        </>
      )}
      {weapon && (
        <Suspense fallback={null}>
          <group position={[0, OVEN.showY, 0]}>
            {/* 內層才做上下浮動與旋轉，外層保留出爐高度 */}
            <group ref={food}>
              <FoodModel model={weapon.model} scale={weapon.scale} />
            </group>
          </group>
        </Suspense>
      )}
    </group>
  );
}
