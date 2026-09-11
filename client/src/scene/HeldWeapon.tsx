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

/** 把武器模型掛到角色右手臂節點底下，跟著手臂動畫擺動 */
export function HeldWeapon({ weaponId, hand }: HeldWeaponProps) {
  const weapon = getWeapon(weaponId);
  if (!weapon || !hand) return null;
  return createPortal(
    <Suspense fallback={null}>
      <FoodModel model={weapon.model} scale={weapon.grip.scale} position={weapon.grip.position} rotation={weapon.grip.rotation} />
    </Suspense>,
    hand,
  );
}
