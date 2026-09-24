import { useEffect, useMemo, useState } from 'react';
import { createPortal } from '@react-three/fiber';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Group, type Object3D } from 'three';
import { GLTFLoader } from 'three-stdlib';

const loader = new GLTFLoader();
const cache = new Map<string, Group>();

function load(url: string): Promise<Group> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        cache.set(url, gltf.scene);
        resolve(gltf.scene);
      },
      undefined,
      reject,
    );
  });
}

export function preloadHeadProp(url: string): void {
  void load(url).catch(() => {});
}

/**
 * 掛在角色 head 節點下的配件（皇冠、買來的頭飾都走這裡）。
 * 那個節點的局部座標裡頭頂在 y=8、頭寬 8，所以配件縮到指定寬度、
 * 底部坐在 baseY（往下埋一點才像扣在頭上）。
 *
 * 模型尺寸與朝向不預設（各家匯出把轉正與縮放寫在節點 matrix 裡），
 * 一律從實際 bounding box 反推縮放與置中位移。
 *
 * 刻意不用 useGLTF：會 suspend 的元件掛在 CharacterModel 裡時，
 * 角色一 mount 就戴著配件的情況（商店試戴預覽）動畫不會被套上，人會散成 T-pose。
 */
export function HeadProp({ head, url, width, baseY }: { head: Object3D | null; url: string; width: number; baseY: number }) {
  const [scene, setScene] = useState<Group | null>(() => cache.get(url) ?? null);

  useEffect(() => {
    let alive = true;
    void load(url)
      .then((s) => alive && setScene(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  const fitted = useMemo(() => {
    if (!scene) return null;
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
    const s = width / (size.x || 1);
    return {
      model: clone,
      scale: s,
      position: [-center.x * s, baseY - box.min.y * s, -center.z * s] as [number, number, number],
    };
  }, [scene, width, baseY]);

  if (!head || !fitted) return null;
  return createPortal(
    <group position={fitted.position} scale={fitted.scale}>
      <primitive object={fitted.model} />
    </group>,
    head,
  );
}
