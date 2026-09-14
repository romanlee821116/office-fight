import { PLAYER_RADIUS, ROOM_MAX_X, ROOM_MAX_Z, ROOM_MIN_X, ROOM_MIN_Z } from './constants';
import { SOLID_FURNITURE } from './data/furniture';

export interface Vec2 {
  x: number;
  z: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 將圓形玩家（半徑 r）推出所有實體家具的 AABB 與房間邊界。
 * 純函式，前後端共用；不使用物理引擎。
 */
export function resolvePosition(x: number, z: number, r: number = PLAYER_RADIUS): Vec2 {
  x = clamp(x, ROOM_MIN_X + r, ROOM_MAX_X - r);
  z = clamp(z, ROOM_MIN_Z + r, ROOM_MAX_Z - r);

  for (const f of SOLID_FURNITURE) {
    const minX = f.x - f.w / 2 - r;
    const maxX = f.x + f.w / 2 + r;
    const minZ = f.z - f.d / 2 - r;
    const maxZ = f.z + f.d / 2 + r;
    if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;

    const dl = x - minX;
    const dr = maxX - x;
    const dt = z - minZ;
    const db = maxZ - z;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) x = minX;
    else if (m === dr) x = maxX;
    else if (m === dt) z = minZ;
    else z = maxZ;
  }

  // 再夾一次：貼牆家具可能把人推到牆外
  x = clamp(x, ROOM_MIN_X + r, ROOM_MAX_X - r);
  z = clamp(z, ROOM_MIN_Z + r, ROOM_MAX_Z - r);
  return { x, z };
}

/**
 * 把圓形玩家推出其他玩家的圓（半徑相加）。只移動「自己」，不動別人，
 * 因此站著不動的人永遠不會被擠走。跑兩輪處理同時碰到多人的情況。
 */
export function resolveAgainstPlayers(x: number, z: number, others: Iterable<Vec2>, r: number = PLAYER_RADIUS): Vec2 {
  const minDist = r * 2;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const o of others) {
      let dx = x - o.x;
      let dz = z - o.z;
      let d = Math.hypot(dx, dz);
      if (d >= minDist) continue;
      if (d < 1e-4) {
        // 完全重疊：往 +X 推開
        dx = 1;
        dz = 0;
        d = 1;
      }
      x = o.x + (dx / d) * minDist;
      z = o.z + (dz / d) * minDist;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

/** 先推出家具與邊界，再推出其他玩家，最後再確認沒被推進家具 */
export function resolveAll(x: number, z: number, others: Iterable<Vec2> = [], r: number = PLAYER_RADIUS): Vec2 {
  const a = resolvePosition(x, z, r);
  const b = resolveAgainstPlayers(a.x, a.z, others, r);
  return resolvePosition(b.x, b.z, r);
}

/**
 * 以逐軸方式移動，讓玩家可以沿著牆壁/家具/其他玩家滑動。
 */
export function moveWithCollision(from: Vec2, dx: number, dz: number, r: number = PLAYER_RADIUS, others: Iterable<Vec2> = []): Vec2 {
  const stepX = resolveAll(from.x + dx, from.z, others, r);
  return resolveAll(stepX.x, from.z + dz, others, r);
}

/** 找一個沒有人站著的出生點：在基準點附近隨機嘗試 */
export function findFreeSpawn(base: Vec2, others: Iterable<Vec2>, r: number = PLAYER_RADIUS): Vec2 {
  const list = [...others];
  for (let attempt = 0; attempt < 12; attempt++) {
    const spread = 1 + attempt * 0.35;
    const candidate = resolvePosition(base.x + (Math.random() - 0.5) * 3 * spread, base.z + (Math.random() - 0.5) * 1.5 * spread, r);
    const blocked = list.some((o) => Math.hypot(o.x - candidate.x, o.z - candidate.z) < r * 2 + 0.2);
    if (!blocked) return candidate;
  }
  return resolveAll(base.x, base.z, list, r);
}
