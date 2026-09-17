import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';

const CROWN_URL = `/models/props/crown.glb?v=${__ASSET_VERSION__}`;
useGLTF.preload(CROWN_URL);

/**
 * 皇冠掛在角色的 head 節點底下。那個節點的局部座標裡頭頂在 y=8、頭寬 8，
 * 所以皇冠縮到比頭略寬一點、底部坐在 y=7.2（往下埋一點才像扣在頭上）。
 * 模型本身的尺寸與朝向不預設（Sketchfab 匯出把 Z-up 轉正與 0.01 縮放都寫在
 * 節點 matrix 裡），一律從實際 bounding box 反推縮放與置中位移。
 */
const CROWN_WIDTH = 8.8;
const CROWN_BASE_Y = 7.2;

/** 打倒過丁oe的人頭上的皇冠：跟著頭的動畫一起動 */
export function Crown({ head }: { head: Object3D | null }) {
  const { scene } = useGLTF(CROWN_URL);
  const { model, scale, position } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = false;
      // glTF 沒寫 metallicFactor 就是全金屬，場景沒有環境貼圖會黑成一團
      const source = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as MeshStandardMaterial;
      const mat = source.clone();
      mat.metalness = 0.3;
      mat.roughness = Math.max(0.3, mat.roughness);
      obj.material = mat;
    });
    clone.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const s = CROWN_WIDTH / (size.x || 1);
    return {
      model: clone,
      scale: s,
      position: [-center.x * s, CROWN_BASE_Y - box.min.y * s, -center.z * s] as [number, number, number],
    };
  }, [scene]);

  if (!head) return null;
  return createPortal(
    <group position={position} scale={scale}>
      <primitive object={model} />
    </group>,
    head,
  );
}
