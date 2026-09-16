import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Material, type Object3D } from 'three';

/** 'tree-snow-a' → /models/holiday/tree-snow-a.glb（貼圖由 GLB 以相對路徑自行載入） */
export function holidayUrl(model: string): string {
  return `/models/holiday/${model}.glb?v=${__ASSET_VERSION__}`;
}

/** 一個零件實例：座標為公尺，rotY 為世界朝向 */
export interface HolidayPiece {
  model: string;
  x: number;
  y?: number;
  z: number;
  rotY?: number;
  /** 預設 XMAS_UNIT（2），把半比例的 kit 放大成公尺；三軸陣列為零件自身座標系的非等比縮放 */
  scale?: number | [number, number, number];
}

/**
 * Holiday Kit 的每個 GLB 都只有一個 mesh、一個名為 colormap 的材質，
 * 而且全部指向同一張 Textures/colormap.png。若照原樣載入，30 個模型就會上傳
 * 30 張一模一樣的 512x512 貼圖，所以這裡讓所有模型共用第一個載到的材質。
 */
let shared: MeshStandardMaterial | null = null;

function sharedMaterial(src: Material): Material {
  if (!(src instanceof MeshStandardMaterial)) return src;
  if (!shared) {
    src.metalness = 0;
    src.roughness = 0.85;
    shared = src;
    return src;
  }
  if (src !== shared) {
    // 這一份材質不會再被用到，連同它自己那張貼圖一起釋放
    src.map?.dispose();
    src.dispose();
  }
  return shared;
}

const UP = new Vector3(0, 1, 0);
const mInst = new Matrix4();
const mOut = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();

/**
 * 同一個模型的所有實例合批成一組 InstancedMesh：draw call 只跟模型數有關，
 * 與實例數無關（小鎮有上百個零件，不合批會是上百個 draw call）。
 *
 * 不做 bounding box 置中：模組化的木屋零件（牆、屋頂、屋角柱）就是靠各自的原始原點
 * 才對得起來，一置中就散掉了。單獨擺的樹、雪人等模型原點本來就在底部中心。
 */
function HolidayGroup({ model, items }: { model: string; items: HolidayPiece[] }) {
  const { scene } = useGLTF(holidayUrl(model));
  const meshes = useMemo(() => {
    scene.updateMatrixWorld(true);
    const out: InstancedMesh[] = [];
    scene.traverse((obj: Object3D) => {
      if (!(obj instanceof Mesh)) return;
      const material = sharedMaterial(Array.isArray(obj.material) ? obj.material[0] : obj.material);
      const im = new InstancedMesh(obj.geometry, material, items.length);
      im.castShadow = true;
      im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        pos.set(it.x, it.y ?? 0, it.z);
        quat.setFromAxisAngle(UP, it.rotY ?? 0);
        if (Array.isArray(it.scale)) scl.set(...it.scale);
        else scl.setScalar(it.scale ?? 1);
        mInst.compose(pos, quat, scl);
        mOut.multiplyMatrices(mInst, obj.matrixWorld);
        im.setMatrixAt(i, mOut);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      out.push(im);
    });
    return out;
  }, [scene, items]);

  // 卸載時釋放 instanceMatrix（幾何與共用材質留給 useGLTF 快取）。
  // 延後一拍再判斷：StrictMode 開發模式會先卸再掛，直接 dispose 會讓仍在畫的
  // InstancedMesh 指到已刪除的 buffer（WebGL INVALID_OPERATION）
  useEffect(() => {
    let mounted = true;
    return () => {
      mounted = false;
      setTimeout(() => {
        if (mounted) return;
        for (const m of meshes) m.dispose();
      }, 0);
    };
  }, [meshes]);

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/** 依模型分組後合批繪製 */
export function HolidayProps({ pieces }: { pieces: HolidayPiece[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, HolidayPiece[]>();
    for (const p of pieces) {
      const list = by.get(p.model);
      if (list) list.push(p);
      else by.set(p.model, [p]);
    }
    return [...by];
  }, [pieces]);

  return (
    <Suspense fallback={null}>
      {groups.map(([model, items]) => (
        <HolidayGroup key={model} model={model} items={items} />
      ))}
    </Suspense>
  );
}
