import { useGLTF } from '@react-three/drei';
import { Box3, BufferAttribute, BufferGeometry, Mesh, Vector3, type Material, type Object3D } from 'three';
import { PLAYGROUND } from '@office/shared';

/**
 * playground.glb 是一整包 Sketchfab 場景：所有遊具都在同一個檔案裡，各自帶著歪掉的角度，
 * 而且一組設施的所有零件（鞦韆的梯架、繩子、座椅）全部塞在同一個 geometry 裡。
 *
 * 這個模組負責把單一設施取出來、轉正、對齊成「底部中心 = 原點、單位為公尺」，
 * 並依三角形連通性把要擺動的零件（鞦韆座椅、蹺蹺板板身）拆成獨立 geometry。
 * 角度與尺寸的來源見 shared 的 PLAYGROUND 常數。
 */
export function playgroundUrl(): string {
  return `/models/playground/playground.glb?v=${__ASSET_VERSION__}`;
}

/** three 會把 glTF 節點名稱裡的 '.' 去掉，所以檔案裡的 'Cube.020' 在場景中叫 'Cube020' */
export type PlaygroundPartId = 'slide' | 'swing' | 'seesaw' | 'pond' | 'sandbox';

/** 以零件的局部 X 範圍圈選（範圍要完整包住該零件，橫跨整座架子的橫梁就不會被選到） */
function withinX(min: number, max: number): (box: Box3) => boolean {
  return (box) => box.min.x >= min && box.max.x <= max;
}

interface PartDef {
  node: string;
  fixYaw: number;
  /** 會動的子零件：每個述詞挑出一組連通零件，順序即 movers 的順序 */
  movers: ((box: Box3) => boolean)[];
}

const PART_DEFS: Record<PlaygroundPartId, PartDef> = {
  // Cube001 是同款加了屋頂的塔，但屋簷離平台只有 0.8m，角色站上去頭會穿出去，因此兩座都用無頂版本
  slide: { node: 'Cube017', fixYaw: PLAYGROUND.slide.fixYaw, movers: [] },
  swing: {
    node: 'Cube020',
    fixYaw: PLAYGROUND.swing.fixYaw,
    // 兩組「兩條繩子＋一片座椅」，各自夾在梯架之間；±0.36 足以包住整組又碰不到旁邊的立柱
    movers: PLAYGROUND.swing.seatX.map((x) => withinX(x - 0.36, x + 0.36)),
  },
  seesaw: {
    node: 'Cube022',
    fixYaw: PLAYGROUND.seesaw.fixYaw,
    // 板身與兩端扶手一起翹動，只有正中央的支點不動
    movers: [(box: Box3) => box.max.x > 0.5 || box.min.x < -0.5],
  },
  pond: { node: 'Mball001', fixYaw: 0, movers: [] },
  sandbox: { node: 'sandbox001', fixYaw: 0, movers: [] },
};

export interface PlaygroundPart {
  /** 不會動的部分 */
  base: BufferGeometry;
  /** 會動的子零件，順序同 PART_DEFS 的 movers */
  movers: BufferGeometry[];
  material: Material;
  /** 轉正縮放後的外框（公尺） */
  size: Vector3;
}

/** 頂點座標量化的精度：模型的面沒有共用頂點，要先把重合的頂點視為同一點才連得起來 */
const WELD = 1e4;

interface Component {
  tris: number[];
  box: Box3;
}

/** 依三角形連通性把 geometry 分成數個獨立零件 */
function connectedComponents(geom: BufferGeometry): { components: Component[]; vertexAt: (i: number) => number } {
  const pos = geom.getAttribute('position');
  const index = geom.getIndex();
  const vertexAt = index ? (i: number) => index.getX(i) : (i: number) => i;
  const triCount = (index ? index.count : pos.count) / 3;

  // 先把座標相同的頂點合併成同一個編號
  const ids = new Map<string, number>();
  const weld = new Int32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const key = `${Math.round(pos.getX(v) * WELD)},${Math.round(pos.getY(v) * WELD)},${Math.round(pos.getZ(v) * WELD)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    weld[v] = id;
  }

  const parent = new Int32Array(ids.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let t = 0; t < triCount; t++) {
    const a = weld[vertexAt(t * 3)];
    const b = weld[vertexAt(t * 3 + 1)];
    const c = weld[vertexAt(t * 3 + 2)];
    union(a, b);
    union(b, c);
  }

  const byRoot = new Map<number, Component>();
  const p = new Vector3();
  for (let t = 0; t < triCount; t++) {
    const root = find(weld[vertexAt(t * 3)]);
    let comp = byRoot.get(root);
    if (!comp) {
      comp = { tris: [], box: new Box3() };
      byRoot.set(root, comp);
    }
    comp.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const v = vertexAt(t * 3 + k);
      comp.box.expandByPoint(p.set(pos.getX(v), pos.getY(v), pos.getZ(v)));
    }
  }
  return { components: [...byRoot.values()], vertexAt };
}

/** 從 geometry 取出指定三角形，輸出成新的（非索引）geometry */
function subGeometry(geom: BufferGeometry, tris: number[], vertexAt: (i: number) => number): BufferGeometry {
  const out = new BufferGeometry();
  // color 是這個模型唯一的顏色來源（材質本身是素灰、沒有貼圖），不能漏掉
  for (const name of ['position', 'normal', 'color'] as const) {
    const src = geom.getAttribute(name);
    if (!src) continue;
    const dst = new Float32Array(tris.length * 3 * src.itemSize);
    let w = 0;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = vertexAt(t * 3 + k);
        for (let c = 0; c < src.itemSize; c++) dst[w++] = src.getComponent(v, c);
      }
    }
    out.setAttribute(name, new BufferAttribute(dst, src.itemSize));
  }
  out.computeBoundingBox();
  return out;
}

function findMesh(node: Object3D): Mesh | null {
  let found: Mesh | null = null;
  node.traverse((o) => {
    if (!found && o instanceof Mesh) found = o;
  });
  return found;
}

function buildPart(root: Object3D, id: PlaygroundPartId): PlaygroundPart {
  const def = PART_DEFS[id];
  const node = root.getObjectByName(def.node);
  if (!node) throw new Error(`playground.glb 找不到節點 ${def.node}（${id}）`);
  const mesh = findMesh(node);
  if (!mesh) throw new Error(`playground.glb 的 ${def.node} 底下沒有 mesh`);

  root.updateMatrixWorld(true);
  const geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld); // 攤平節點自身的變換
  geom.rotateY(def.fixYaw); // 轉正（模型在檔案裡是斜的）
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  geom.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geom.scale(PLAYGROUND.scale, PLAYGROUND.scale, PLAYGROUND.scale);
  geom.computeBoundingBox();
  const size = geom.boundingBox!.getSize(new Vector3());

  if (def.movers.length === 0) {
    geom.computeBoundingSphere();
    return { base: geom, movers: [], material: mesh.material as Material, size };
  }

  const { components, vertexAt } = connectedComponents(geom);
  const taken = new Set<Component>();
  const movers = def.movers.map((pick) => {
    const parts = components.filter((c) => !taken.has(c) && pick(c.box));
    if (parts.length === 0) throw new Error(`playground.glb 的 ${id} 找不到對應的可動零件`);
    parts.forEach((c) => taken.add(c));
    return subGeometry(
      geom,
      parts.flatMap((c) => c.tris),
      vertexAt,
    );
  });
  const rest = components.filter((c) => !taken.has(c)).flatMap((c) => c.tris);
  const base = subGeometry(geom, rest, vertexAt);
  geom.dispose();
  return { base, movers, material: mesh.material as Material, size };
}

const cache = new Map<PlaygroundPartId, PlaygroundPart>();

/** 取得轉正、縮放並拆好可動零件的設施；同一個 id 只會建一次 */
export function usePlaygroundPart(id: PlaygroundPartId): PlaygroundPart {
  const { scene } = useGLTF(playgroundUrl());
  let part = cache.get(id);
  if (!part) {
    part = buildPart(scene, id);
    cache.set(id, part);
  }
  return part;
}

useGLTF.preload(playgroundUrl());
