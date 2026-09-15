import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import {
  Box3,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GROUND_Y } from './themes/layout';
import type { PropGroup } from './themes/types';

/** 'nyc/city/building-a' → /models/scenes/nyc/city/building-a.glb（貼圖由 GLB 以相對路徑自行載入） */
export function sceneryUrl(model: string): string {
  return `/models/scenes/${model}.glb?v=${__ASSET_VERSION__}`;
}

interface Loaded {
  themeId: string;
  scene: Object3D;
  /** 換色後的材質副本，key = 原材質 uuid + 目標色 */
  clones: Map<string, Material>;
}

/** 已載入的 GLB（依 URL），切換主題時整批釋放 */
const loaded = new Map<string, Loaded>();
/**
 * 同一個 kit 資料夾內同名材質共用同一張貼圖：Kenney 每個 GLB 都各自引用 Textures/colormap.png，
 * 13 棟大樓就會上傳 13 張一模一樣的貼圖，這裡只留第一張。
 */
const sharedTextures = new Map<string, { texture: Texture; themeId: string }>();

const UP = new Vector3(0, 1, 0);
const box = new Box3();
const mInst = new Matrix4();
const mCenter = new Matrix4();
const mOut = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();

function disposeTexture(t: Texture): void {
  t.dispose();
  const img = t.image as { close?: () => void } | undefined;
  img?.close?.();
}

/** Kenney GLB 只會出現這兩種：有光照的 Standard，或 KHR_materials_unlit 轉出的 Basic */
type KitMaterial = MeshStandardMaterial | MeshBasicMaterial;

function isKitMaterial(m: Material): m is KitMaterial {
  return m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial;
}

function prepareMaterial(src: Material, group: PropGroup, kitDir: string, entry: Loaded): Material {
  if (!isKitMaterial(src)) return src;
  // nature kit 匯出時 metallicFactor=1，場景沒有環境貼圖會整個變黑，一律當非金屬
  if (src instanceof MeshStandardMaterial) src.metalness = 0;
  if (src.map) {
    const key = `${kitDir}|${src.name}`;
    const hit = sharedTextures.get(key);
    if (!hit) sharedTextures.set(key, { texture: src.map, themeId: entry.themeId });
    else if (hit.texture !== src.map) {
      const orphan = src.map;
      src.map = hit.texture;
      disposeTexture(orphan);
    }
  }
  const to = group.recolor?.[src.name] ?? group.tint;
  if (!to) return src;
  const key = `${src.uuid}|${to}`;
  let m = entry.clones.get(key);
  if (!m) {
    const c = src.clone() as KitMaterial;
    c.color.set(to);
    entry.clones.set(key, c);
    m = c;
  }
  return m;
}

/**
 * 把一個 GLB 的每個 mesh 各建一組 InstancedMesh：draw call 數只跟模型內的 mesh 數有關，
 * 與實例數無關。模型以 bounding box 的 XZ 中心對齊實例座標，Y 維持模型原點（nature kit 的
 * 底座會埋進地面，城市建物原點本來就在地面）。
 */
function buildInstances(group: PropGroup, scene: Object3D, url: string): InstancedMesh[] {
  const themeId = group.model.slice(0, group.model.indexOf('/'));
  const kitDir = group.model.slice(0, group.model.lastIndexOf('/'));
  let entry = loaded.get(url);
  if (!entry) {
    entry = { themeId, scene, clones: new Map() };
    loaded.set(url, entry);
  }
  scene.updateMatrixWorld(true);
  box.setFromObject(scene, true);
  mCenter.makeTranslation(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);

  const n = group.items.length;
  const out: InstancedMesh[] = [];
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const material = prepareMaterial(Array.isArray(obj.material) ? obj.material[0] : obj.material, group, kitDir, entry);
    const im = new InstancedMesh(obj.geometry, material, n);
    // 背景不投影、不受影（陰影相機只涵蓋浮島），實例散佈整圈所以不做視錐剔除
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    im.matrixAutoUpdate = false;
    for (let i = 0; i < n; i++) {
      const it = group.items[i];
      pos.set(it.x, it.y ?? GROUND_Y, it.z);
      quat.setFromAxisAngle(UP, it.rotY ?? 0);
      scl.setScalar(it.scale);
      mInst.compose(pos, quat, scl);
      mOut.multiplyMatrices(mInst, mCenter).multiply(obj.matrixWorld);
      im.setMatrixAt(i, mOut);
    }
    im.instanceMatrix.needsUpdate = true;
    out.push(im);
  });
  return out;
}

/**
 * 釋放非當前主題的所有 GLB：幾何、材質、貼圖與 useGLTF 快取。
 * 各主題的模型放在各自的資料夾，彼此不共用檔案，所以整批 dispose 是安全的。
 */
export function releaseScenery(keepThemeId: string): void {
  for (const [url, e] of loaded) {
    if (e.themeId === keepThemeId) continue;
    const mats = new Set<Material>(e.clones.values());
    e.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    for (const m of mats) m.dispose();
    loaded.delete(url);
    useGLTF.clear(url);
  }
  for (const [key, t] of sharedTextures) {
    if (t.themeId === keepThemeId) continue;
    disposeTexture(t.texture);
    sharedTextures.delete(key);
  }
}

/** 一組合批的背景模型 */
export function PropGroupMesh({ group }: { group: PropGroup }) {
  const url = sceneryUrl(group.model);
  const { scene } = useGLTF(url);
  const meshes = useMemo(() => buildInstances(group, scene, url), [group, scene, url]);
  // 卸載時釋放 instanceMatrix。延後一拍再判斷，StrictMode 在開發模式會先卸再掛一次，
  // 直接 dispose 會讓仍在畫的 InstancedMesh 指到已刪除的 buffer（WebGL INVALID_OPERATION）
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
