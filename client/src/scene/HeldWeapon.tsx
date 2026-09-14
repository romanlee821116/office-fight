import { Suspense } from 'react';
import { createPortal } from '@react-three/fiber';
import type { Object3D } from 'three';
import { getWeapon } from '@office/shared';
import { FoodModel } from './FoodModel';

interface HeldWeaponProps {
  weaponId: string;
  /** 角色的右手臂節點（模型內名為 arm-right） */
  hand: Object3D | null;
}

/** 匹克球拍（程式生成：握把 + 圓拍面） */
function Paddle() {
  return (
    <group>
      <mesh position={[0, 0.13, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.26, 10]} />
        <meshStandardMaterial color="#8A6B4F" />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.035, 22]} />
        <meshStandardMaterial color="#3E8ED0" />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.19, 0.018, 10, 24]} />
        <meshStandardMaterial color="#F5F5F0" />
      </mesh>
    </group>
  );
}

/** 把武器模型掛到角色右手臂節點底下，跟著手臂動畫擺動 */
export function HeldWeapon({ weaponId, hand }: HeldWeaponProps) {
  const weapon = getWeapon(weaponId);
  if (!weapon || !hand) return null;
  return createPortal(
    weapon.id === 'paddle' ? (
      <group position={weapon.grip.position} rotation={weapon.grip.rotation} scale={weapon.grip.scale}>
        <Paddle />
      </group>
    ) : (
      <Suspense fallback={null}>
        <FoodModel model={weapon.model} scale={weapon.grip.scale} position={weapon.grip.position} rotation={weapon.grip.rotation} />
      </Suspense>
    ),
    hand,
  );
}
