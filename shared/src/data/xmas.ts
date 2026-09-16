import type { CabinDef } from '../types';

/**
 * 聖誕小鎮的木屋。外觀由 client 依 Kenney Holiday Kit 的模組零件拼出來，
 * 這裡只放「每棟屋子站在哪、多長、開哪些窗」這個唯一真實來源，
 * 碰撞盒（furniture.ts）與前端拼裝（christmasTown.ts）都從這一份推導。
 *
 * 座標系統：一格 = 1 kit 單位 = XMAS_UNIT 公尺。屋子一律兩格寬（屋脊在中線），
 * len 是沿屋脊方向的格數；局部 +Z 是正面（大門那一側），rotY 轉到世界朝向。
 */

/** Kenney Holiday Kit 為半比例（牆高 1 單位），放大 2 倍即為公尺 */
export const XMAS_UNIT = 2;

/** 屋子固定兩格寬 */
export const CABIN_TILES_W = 2;

/**
 * 雪堡掩體的縮放。原始模型只有 0.41 高，照 XMAS_UNIT 放大只到 0.82m，
 * 蹲在後面像跨過去而不是躲起來；放大到 2.4 倍後接近 1m，剛好到角色腰部。
 * 碰撞盒（furniture.ts）與前端繪製都讀這一個值。
 */
export const BUNKER_SCALE = 2.4;
/** snow-bunker 原始外框 1.94 x 1.35 */
export const BUNKER_SIZE = { w: 1.94 * BUNKER_SCALE, d: 1.35 * BUNKER_SCALE };

/**
 * 長椅的縮放。這個 kit 的 ×2 是拿木屋的門校準的，長椅照樣放大後座面會高到 0.9m，
 * 坐姿的臀部只在 0.45m，人會整個陷進椅子裡。原尺寸（×1）座面剛好 0.45m，
 * 和辦公室的椅子、沙發一致，所以長椅單獨用 1 倍。
 */
export const BENCH_SCALE = 1;
/** bench 原始外框 1.12 x 0.63、高 0.73 */
export const BENCH_SIZE = { w: 1.12 * BENCH_SCALE, d: 0.63 * BENCH_SCALE, h: 0.73 * BENCH_SCALE };

/** 有碰撞的佈景各自的縮放；沒列到的一律 XMAS_UNIT */
export const XMAS_PROP_SCALE: Record<string, number> = {
  'snow-bunker': BUNKER_SCALE,
  bench: BENCH_SCALE,
};

export const CABINS: CabinDef[] = [
  // 小鎮主街：兩棟正面朝辦公室（-Z）分立廣場兩側，一棟側身收在東邊角落
  { id: 'cabin-a', x: -8.5, z: 16, rotY: Math.PI, len: 3, roof: 'snow', doorX: 0.5, chimneyEnd: -1, wreath: true },
  { id: 'cabin-c', x: 11.5, z: 16, rotY: Math.PI, len: 3, roof: 'snow', doorX: 0.5, chimneyEnd: 1, wreath: true },
  { id: 'cabin-d', x: 19.5, z: 13.5, rotY: -Math.PI / 2, len: 3, roof: 'plain', doorX: 0.5, chimneyEnd: -1 },
];

/** 屋子的世界碰撞盒（rotY 只有 0 / ±π/2 / π，所以直接換軸即可） */
export function cabinBox(c: CabinDef): { w: number; d: number } {
  const along = c.len * XMAS_UNIT;
  const across = CABIN_TILES_W * XMAS_UNIT;
  const sideways = Math.abs(Math.sin(c.rotY)) > 0.5;
  return sideways ? { w: along, d: across } : { w: across, d: along };
}

/**
 * 打雪仗場地的補彈點：場地兩邊各兩堆雪。堆雪本身是 Kenney 的 snow-pile 裝飾，
 * 前端會在每一堆腳邊多畫一個挖過的凹槽與幾顆現成的雪球。
 * 伺服端要驗證補彈距離，所以位置放在 shared 而不是前端的模型表。
 */
export const SNOW_PILES = [
  { x: -8, z: 23 },
  { x: 8, z: 23 },
  { x: -8, z: 37 },
  { x: 8, z: 37 },
];

/** 站在 (x, z) 時搆得到的雪堆；range 內都搆不到就是 null */
export function nearestSnowPile(x: number, z: number, range: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestDist = range;
  for (const pile of SNOW_PILES) {
    const dist = Math.hypot(pile.x - x, pile.z - z);
    if (dist >= bestDist) continue;
    best = pile;
    bestDist = dist;
  }
  return best;
}
