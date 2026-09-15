import { BoxGeometry, BufferGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Matrix4, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 合批後的一組地標幾何：同色同發光的零件併成單一 BufferGeometry */
export interface LandmarkPart {
  color: string;
  glow: number;
  geometry: BufferGeometry;
}

interface Base {
  /** 以零件底部為基準的位置 */
  x?: number;
  y?: number;
  z?: number;
  c: string;
  /** 自發光強度（招牌、燈籠），0 為一般材質 */
  glow?: number;
  rotY?: number;
}

interface Item {
  color: string;
  glow: number;
  geo: BufferGeometry;
}

const T = new Matrix4();
const R = new Matrix4();
const S = new Matrix4();

/**
 * 地標用的幾何收集器。
 *
 * primitive 地標（透天厝、鳥居、五重塔…）動輒上百個 mesh，一個 mesh 一個 draw call
 * 會把背景省下來的成本又吃回去，因此改成先收集零件、最後依「顏色＋發光」分組合併，
 * draw call 數只跟用了幾種顏色有關。零件都是靜態的，合併一次就不再變動。
 */
export class PartBuilder {
  private readonly items: Item[];
  private readonly base: Matrix4;

  constructor(base?: Matrix4, items?: Item[]) {
    this.base = base ?? new Matrix4();
    this.items = items ?? [];
  }

  /** 建立以 (x,y,z) 為原點、繞 Y 轉 rotY 的子座標系；零件仍收進同一批 */
  at(x: number, y: number, z: number, rotY = 0): PartBuilder {
    const m = new Matrix4().makeTranslation(x, y, z);
    if (rotY) m.multiply(R.makeRotationY(rotY));
    return new PartBuilder(new Matrix4().multiplyMatrices(this.base, m), this.items);
  }

  private push(geo: BufferGeometry, local: Matrix4, c: string, glow = 0): void {
    geo.applyMatrix4(T.multiplyMatrices(this.base, local));
    this.items.push({ color: c, glow, geo });
  }

  /** 方塊，y 為底面 */
  box({ x = 0, y = 0, z = 0, w, h, d, c, glow, rotY = 0 }: Base & { w: number; h: number; d: number }): this {
    const local = new Matrix4().makeTranslation(x, y + h / 2, z);
    if (rotY) local.multiply(R.makeRotationY(rotY));
    this.push(new BoxGeometry(w, h, d), local, c, glow);
    return this;
  }

  /** 圓柱／圓錐台，y 為底面；r 上半徑、rb 下半徑 */
  cyl({ x = 0, y = 0, z = 0, r, rb = r, h, c, glow, seg = 10, rotY = 0 }: Base & { r: number; rb?: number; h: number; seg?: number }): this {
    const local = new Matrix4().makeTranslation(x, y + h / 2, z);
    if (rotY) local.multiply(R.makeRotationY(rotY));
    this.push(new CylinderGeometry(r, rb, h, seg), local, c, glow);
    return this;
  }

  /** 橫躺的圓柱（輪子、管線），沿 X 軸；y 為圓心 */
  wheel({ x = 0, y = 0, z = 0, r, h, c, glow, seg = 8 }: Base & { r: number; h: number; seg?: number }): this {
    const local = new Matrix4().makeTranslation(x, y, z).multiply(R.makeRotationZ(Math.PI / 2));
    this.push(new CylinderGeometry(r, r, h, seg), local, c, glow);
    return this;
  }

  /** 四角錐（金字塔、寄棟屋頂），side 為底邊；sx/sz 可拉成長方形 */
  pyr({ x = 0, y = 0, z = 0, side, h, c, glow, sx = 1, sz = 1, rotY = Math.PI / 4 }: Base & { side: number; h: number; sx?: number; sz?: number }): this {
    const local = new Matrix4().makeTranslation(x, y + h / 2, z);
    local.multiply(S.makeScale(sx, 1, sz));
    local.multiply(R.makeRotationY(rotY));
    this.push(new ConeGeometry(side / Math.SQRT2, h, 4), local, c, glow);
    return this;
  }

  /** 圓錐（塔尖、火山），y 為底面 */
  cone({ x = 0, y = 0, z = 0, r, h, c, glow, seg = 16, sz = 1 }: Base & { r: number; h: number; seg?: number; sz?: number }): this {
    const local = new Matrix4().makeTranslation(x, y + h / 2, z).multiply(S.makeScale(1, 1, sz));
    this.push(new ConeGeometry(r, h, seg), local, c, glow);
    return this;
  }

  /** 球，y 為球心；sy 可壓扁成沙丘 */
  ball({ x = 0, y = 0, z = 0, r, c, glow, sy = 1 }: Base & { r: number; sy?: number }): this {
    const local = new Matrix4().makeTranslation(x, y, z).multiply(S.makeScale(1, sy, 1));
    this.push(new SphereGeometry(r, 14, 10), local, c, glow);
    return this;
  }

  /** 平貼地面的圓盤（沙洲、水池） */
  disc({ x = 0, y = 0, z = 0, r, c, glow, seg = 28 }: Base & { r: number; seg?: number }): this {
    const local = new Matrix4().makeTranslation(x, y, z).multiply(R.makeRotationX(-Math.PI / 2));
    this.push(new CircleGeometry(r, seg), local, c, glow);
    return this;
  }

  /** 平貼地面的矩形（道路、標線），y 為高度 */
  slab({ x = 0, y = 0, z = 0, w, d, c, glow, rotY = 0 }: Base & { w: number; d: number }): this {
    return this.box({ x, y, z, w, h: 0.02, d, c, glow, rotY });
  }

  /** 依顏色＋發光分組合併 */
  build(): LandmarkPart[] {
    const groups = new Map<string, { color: string; glow: number; geos: BufferGeometry[] }>();
    for (const it of this.items) {
      const key = `${it.color}|${it.glow}`;
      let g = groups.get(key);
      if (!g) {
        g = { color: it.color, glow: it.glow, geos: [] };
        groups.set(key, g);
      }
      g.geos.push(it.geo);
    }
    const out: LandmarkPart[] = [];
    for (const g of groups.values()) {
      const merged = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos);
      if (!merged) continue;
      if (g.geos.length > 1) for (const geo of g.geos) geo.dispose();
      out.push({ color: g.color, glow: g.glow, geometry: merged });
    }
    return out;
  }
}

/** 主題的地標只建一次，切回來直接重用（幾何小，不釋放） */
const cache = new Map<() => PartBuilder, LandmarkPart[]>();

export function landmarkParts(build: () => PartBuilder): LandmarkPart[] {
  let parts = cache.get(build);
  if (!parts) {
    parts = build().build();
    cache.set(build, parts);
  }
  return parts;
}
