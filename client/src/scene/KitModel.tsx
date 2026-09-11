import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, type Object3D } from 'three';

/** Kenney Furniture Kit 為半比例（牆高 1.29），放大 2 倍即為公尺 */
export const KIT_SCALE = 2;

/** 'desk' → /models/furniture/desk.glb；'gym/treadmill' → /models/gym/treadmill.glb */
export function kitUrl(name: string): string {
  return name.includes('/') ? `/models/${name}.glb` : `/models/furniture/${name}.glb`;
}

/** 以線性 RGB 比對 GLB 原始顏色，替換為指定 hex */
export interface Recolor {
  from: [number, number, number];
  to: string;
}

export interface KitModelProps {
  model: string;
  position?: [number, number, number];
  rotY?: number;
  scale?: number;
  recolor?: Recolor[];
}

interface Bounds {
  cx: number;
  cz: number;
  minY: number;
}

const boundsCache = new Map<string, Bounds>();
const materialCache = new Map<string, MeshStandardMaterial>();
const box = new Box3();

function getBounds(name: string, scene: Object3D): Bounds {
  const cached = boundsCache.get(name);
  if (cached) return cached;
  scene.updateMatrixWorld(true);
  box.setFromObject(scene, true);
  const b = { cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, minY: box.min.y };
  boundsCache.set(name, b);
  return b;
}

function matches(mat: MeshStandardMaterial, from: [number, number, number]): boolean {
  const c = mat.color;
  return Math.abs(c.r - from[0]) < 0.03 && Math.abs(c.g - from[1]) < 0.03 && Math.abs(c.b - from[2]) < 0.03;
}

function recolored(mat: MeshStandardMaterial, to: string): MeshStandardMaterial {
  const key = `${mat.uuid}:${to}`;
  let m = materialCache.get(key);
  if (!m) {
    m = mat.clone();
    m.color = new Color(to);
    materialCache.set(key, m);
  }
  return m;
}

/**
 * 載入 Kenney GLB，將模型底部中心對齊原點，套用陰影與換色。
 * 原始模型原點在角落（min x / max z），因此需依 bounding box 置中。
 */
export function KitModel({ model, position = [0, 0, 0], rotY = 0, scale = KIT_SCALE, recolor }: KitModelProps) {
  const { scene } = useGLTF(kitUrl(model));
  const bounds = getBounds(model, scene);

  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (recolor && obj.material instanceof MeshStandardMaterial) {
        const mat = obj.material;
        const rule = recolor.find((r) => matches(mat, r.from));
        if (rule) obj.material = recolored(mat, rule.to);
      }
    });
    return clone;
  }, [scene, recolor]);

  return (
    <group position={position} rotation={[0, rotY, 0]} scale={scale}>
      <group position={[-bounds.cx, -bounds.minY, -bounds.cz]}>
        <primitive object={instance} />
      </group>
    </group>
  );
}
