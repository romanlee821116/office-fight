import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Mesh, type Object3D } from 'three';
import { WEAPONS } from '@office/shared';

/** 'burger' → /models/food/burger.glb；'gym/dumbbell' → /models/gym/dumbbell.glb */
export function foodUrl(model: string): string {
  return model.includes('/') ? `/models/${model}.glb` : `/models/food/${model}.glb`;
}

/** 預先載入所有武器與投射物模型 */
new Set(WEAPONS.flatMap((w) => [w.model, w.projectileModel ?? w.model])).forEach((m) => useGLTF.preload(foodUrl(m)));

interface FoodModelProps {
  model: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/** Kenney Food Kit 模型（原點在底部中心，1 unit = 1m），開啟投影 */
export function FoodModel({ model, scale = 1, position = [0, 0, 0], rotation = [0, 0, 0] }: FoodModelProps) {
  const { scene } = useGLTF(foodUrl(model));
  const instance = useMemo<Object3D>(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
    return clone;
  }, [scene]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={instance} />
    </group>
  );
}
