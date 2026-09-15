import { Suspense } from 'react';
import { STOVE, getWeapon } from '@office/shared';
import { useGame } from '../store/useGame';
import { FireFX } from './FireFX';
import { FoodModel } from './FoodModel';

/** 瓦斯爐上的食物與火焰（狀態由伺服端驅動） */
export function Stove() {
  const stove = useGame((s) => s.stove);
  const weapon = stove.foodId ? getWeapon(stove.foodId) : undefined;

  return (
    <group position={[STOVE.x, 0, STOVE.z]}>
      {weapon && (
        <Suspense fallback={null}>
          <group position={[0, STOVE.topY, 0]} rotation={[0, Math.PI / 2, 0]}>
            <FoodModel model={weapon.model} scale={weapon.scale * 0.9} />
          </group>
        </Suspense>
      )}
      {/* 爐口常駐小火：沒東西燒也看得到有火，被押上來的人就是燒在這裡 */}
      {stove.stage === 'burning' ? (
        <FireFX position={[0, STOVE.topY, 0]} scale={1.1} />
      ) : (
        <FireFX position={[0, STOVE.topY - 0.08, 0]} scale={0.3} rate={14} light={false} />
      )}
    </group>
  );
}
