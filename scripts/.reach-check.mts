import { moveWithCollision, resolvePosition, SPAWN_POINT, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from '@office/shared';

// 以 0.25m 網格做可走性泛洪：從出生點出發，只走「真的走得過去」的相鄰格
const STEP = 0.25;
const cols = Math.round((WORLD_MAX_X - WORLD_MIN_X) / STEP);
const rows = Math.round((WORLD_MAX_Z - WORLD_MIN_Z) / STEP);
const key = (i: number, j: number) => i * rows + j;
const at = (i: number, j: number) => ({ x: WORLD_MIN_X + (i + 0.5) * STEP, z: WORLD_MIN_Z + (j + 0.5) * STEP });

const seen = new Set<number>();
const start = { i: Math.round((SPAWN_POINT.x - WORLD_MIN_X) / STEP), j: Math.round((SPAWN_POINT.z - WORLD_MIN_Z) / STEP) };
const queue = [start];
seen.add(key(start.i, start.j));
while (queue.length) {
  const cur = queue.pop()!;
  const from = at(cur.i, cur.j);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = cur.i + di, nj = cur.j + dj;
    if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen.has(key(ni, nj))) continue;
    const target = at(ni, nj);
    const moved = moveWithCollision(from, di * STEP, dj * STEP);
    if (Math.hypot(moved.x - target.x, moved.z - target.z) > STEP * 0.4) continue;
    seen.add(key(ni, nj));
    queue.push({ i: ni, j: nj });
  }
}

const areas: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
  辦公室: { minX: -12, maxX: 12, minZ: -8, maxZ: 8 },
  健身房: { minX: 12, maxX: 23, minZ: -8, maxZ: 8 },
  露台球場: { minX: 23, maxX: 41, minZ: -8, maxZ: 8 },
  兒童遊戲區: { minX: 23, maxX: 41, minZ: 8, maxZ: 20 },
  遊樂園: { minX: 12, maxX: 41, minZ: 20, maxZ: 40 },
  聖誕小鎮: { minX: -12, maxX: 23, minZ: 8, maxZ: 20 },
  打雪仗場地: { minX: -12, maxX: 12, minZ: 20, maxZ: 40 },
};
for (const [name, a] of Object.entries(areas)) {
  let free = 0, reached = 0;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const p = at(i, j);
    if (p.x < a.minX || p.x > a.maxX || p.z < a.minZ || p.z > a.maxZ) continue;
    const r = resolvePosition(p.x, p.z);
    if (Math.hypot(r.x - p.x, r.z - p.z) > 0.01) continue; // 在家具／牆裡
    free++;
    if (seen.has(key(i, j))) reached++;
  }
  const pct = ((reached / free) * 100).toFixed(1);
  console.log(`${reached > 0 ? 'PASS' : 'FAIL'} ${name.padEnd(6)} 可走格 ${String(free).padStart(5)}，從出生點到得了 ${String(reached).padStart(5)} (${pct}%)`);
  if (reached < free) {
    const holes: string[] = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const p = at(i, j);
      if (p.x < a.minX || p.x > a.maxX || p.z < a.minZ || p.z > a.maxZ) continue;
      const r = resolvePosition(p.x, p.z);
      if (Math.hypot(r.x - p.x, r.z - p.z) > 0.01) continue;
      if (!seen.has(key(i, j))) holes.push(`(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    console.log(`     到不了的格子：${holes.join(' ')}`);
  }
}
