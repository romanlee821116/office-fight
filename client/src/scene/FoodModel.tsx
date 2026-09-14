import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, type Object3D } from 'three';
import { WEAPONS } from '@office/shared';

/** 'burger' → /models/food/burger.glb；'gym/dumbbell' → /models/gym/dumbbell.glb */
export function foodUrl(model: string): string {
  const path = model.includes('/') ? `/models/${model}.glb` : `/models/food/${model}.glb`;
  return `${path}?v=${__ASSET_VERSION__}`;
}

/** 預先載入所有武器與投射物模型 */
new Set(WEAPONS.flatMap((w) => [w.model, w.projectileModel ?? w.model])).forEach((m) => useGLTF.preload(foodUrl(m)));

interface FoodModelProps {
  model: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/** 縮放後最大邊長小於此值的食物不投影（省陰影 pass） */
const SHADOW_MIN_SIZE = 0.35;
const sizeCache = new Map<string, number>();
const box = new Box3();

/** Kenney Food Kit 模型（原點在底部中心，1 unit = 1m） */
export function FoodModel({ model, scale = 1, position = [0, 0, 0], rotation = [0, 0, 0] }: FoodModelProps) {
  const { scene } = useGLTF(foodUrl(model));
  const instance = useMemo<Object3D>(() => {
    let maxDim = sizeCache.get(model);
    if (maxDim === undefined) {
      scene.updateMatrixWorld(true);
      box.setFromObject(scene, true);
      maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
      sizeCache.set(model, maxDim);
    }
    const castShadow = maxDim * scale >= SHADOW_MIN_SIZE;
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = false;
      }
    });
    return clone;
  }, [scene, model, scale]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={instance} />
    </group>
  );
}
