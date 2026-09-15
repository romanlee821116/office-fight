import { ROOM_CENTER_X, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z, SPAWN_POINT } from '@office/shared';
import type { PropGroup, PropInstance } from './types';

/** 島外地面高度：與浮島地台底部齊平（地台中心 -0.32、厚 0.6） */
export const GROUND_Y = -0.62;

/** 浮島外圍留白：此範圍內不放任何背景物件（以含遊戲區的世界外框為準） */
const PAD = 6;
export const KEEPOUT = {
  minX: WORLD_MIN_X - PAD,
  maxX: WORLD_MAX_X + PAD,
  minZ: WORLD_MIN_Z - PAD,
  maxZ: WORLD_MAX_Z + PAD,
};

/**
 * 高度分圈（到留白邊緣的距離）。相機最遠可拉到玩家外 28m，
 * 所以 32m 內只放矮物件，才不會擋住鏡頭或讓鏡頭穿進大樓。
 *  - 0～NEAR：≤3m 的小物件（車、石、燈籠）
 *  - NEAR～MID：≤8m（樹、兩層樓、涼亭）
 *  - MID 以外：不限高
 */
export const NEAR = 15;
export const MID = 32;

/** 背景鋪設範圍（霧在 45～90m 之間，最外圈會自然融進天色） */
export const WORLD_CX = ROOM_CENTER_X;
export const FIELD = { minX: WORLD_CX - 95, maxX: WORLD_CX + 95, minZ: -75, maxZ: 75 };

/**
 * 地標可見高度的換算。
 *
 * 相機是第三人稱跟隨：俯角 pitch、距離 D 時相機高度只有 1 + D·sin(pitch)，
 * 而畫面上緣相對水平線的仰角是 (fov/2 − pitch)。以切換主題時的觀景視角
 * （pitch 10°、D 22、fov 40°）計算，相機高 4.8m、身後退 21.7m、上緣仰角 10°，
 * 所以島邊外 L 公尺處、角高度 α 的地標高度為 4.8 + (21.7 + L)·tan(α)。
 *
 * α 取 8～10° 時地標約佔畫面上半部五分之一，既看得到又有份量；
 * 超過 12° 頂端就會被切掉。放得越遠，可用的高度越高。
 */
export function landmarkHeight(distanceFromSpawn: number, alphaDeg = 9): number {
  return 4.8 + (21.7 + distanceFromSpawn) * Math.tan((alphaDeg * Math.PI) / 180);
}

/** 相機預設 yaw 為 45°，看出去的方向是 −X−Z */
const VIEW_DIR = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

/**
 * 主地標該站的位置：出生點朝預設視角方向 L 公尺處。
 * 放在別的方位雖然一樣壯觀，但切換主題時根本不在畫面裡。
 * lateral 為沿視線左右偏移（正值往一側，負值往另一側）。
 */
export function facingSpot(L: number, lateral = 0): { x: number; z: number } {
  return {
    x: SPAWN_POINT.x + VIEW_DIR.x * L - VIEW_DIR.z * lateral,
    z: SPAWN_POINT.z + VIEW_DIR.z * L + VIEW_DIR.x * lateral,
  };
}

/**
 * 點是否落在「出生點望向主地標」的視線走廊內。
 * 高過 12m 的東西放進走廊就會把地標擋掉，各主題佈點時用它排除。
 */
export function inViewCorridor(x: number, z: number, halfWidth = 15): boolean {
  const vx = x - SPAWN_POINT.x;
  const vz = z - SPAWN_POINT.z;
  const t = vx * VIEW_DIR.x + vz * VIEW_DIR.z;
  if (t <= 0) return false;
  return Math.abs(vx * -VIEW_DIR.z + vz * VIEW_DIR.x) < halfWidth;
}

export interface Cell {
  x: number;
  z: number;
  /** 到浮島留白邊緣的距離 */
  dist: number;
}

/** 可重現的亂數（LCG），每個主題固定種子，佈局不會每次刷新都變 */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function range(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
}

/** 點到留白矩形邊緣的距離；在矩形內回傳 0 */
export function distToKeepout(x: number, z: number): number {
  const dx = Math.max(KEEPOUT.minX - x, 0, x - KEEPOUT.maxX);
  const dz = Math.max(KEEPOUT.minZ - z, 0, z - KEEPOUT.maxZ);
  return Math.hypot(dx, dz);
}

/** 以 cell 為格距鋪滿 field、加上隨機偏移，並剔除落在留白區的點 */
export function gridCells(cell: number, jitter: number, rand: () => number, field = FIELD): Cell[] {
  const out: Cell[] = [];
  for (let x = field.minX + cell / 2; x < field.maxX; x += cell) {
    for (let z = field.minZ + cell / 2; z < field.maxZ; z += cell) {
      const px = x + (rand() - 0.5) * jitter;
      const pz = z + (rand() - 0.5) * jitter;
      const dist = distToKeepout(px, pz);
      if (dist <= 0) continue;
      out.push({ x: px, z: pz, dist });
    }
  }
  return out;
}

/** 在留白矩形外圍、距離 [dMin, dMax] 的環帶內隨機取點 */
export function ringPoints(count: number, dMin: number, dMax: number, rand: () => number, minGap = 0): Cell[] {
  const out: Cell[] = [];
  let guard = count * 40;
  while (out.length < count && guard-- > 0) {
    const x = range(rand, KEEPOUT.minX - dMax, KEEPOUT.maxX + dMax);
    const z = range(rand, KEEPOUT.minZ - dMax, KEEPOUT.maxZ + dMax);
    const dist = distToKeepout(x, z);
    if (dist < dMin || dist > dMax) continue;
    if (minGap > 0 && out.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
    out.push({ x, z, dist });
  }
  return out;
}

interface Style {
  tint?: string;
  recolor?: Record<string, string>;
}

/** 累積 (模型, 換色) → 實例清單，最後輸出 PropGroup[] 給合批渲染 */
export class PropBuilder {
  private groups = new Map<string, PropGroup>();

  add(model: string, inst: PropInstance, style?: Style): void {
    const recolorKey = style?.recolor
      ? Object.entries(style.recolor)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      : '';
    const key = `${model}|${style?.tint ?? ''}|${recolorKey}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { key, model, tint: style?.tint, recolor: style?.recolor, items: [] };
      this.groups.set(key, g);
    }
    g.items.push(inst);
  }

  build(): PropGroup[] {
    return [...this.groups.values()];
  }
}
