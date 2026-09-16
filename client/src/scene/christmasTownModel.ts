import {
  CABINS,
  FURNITURE,
  SNOW_PILES,
  SNOW_CENTER_X,
  SNOW_CENTER_Z,
  XMAS_PROP_SCALE,
  XMAS_UNIT,
  type CabinDef,
} from '@office/shared';
import type { HolidayPiece } from './HolidayKit';

/**
 * 聖誕小鎮的零件表：Kenney Holiday Kit 是模組化的，木屋要自己拼。
 *
 * 一格 = 1 kit 單位 = XMAS_UNIT 公尺。下面所有 local* 函式都用 kit 單位計算，
 * 最後由 toWorld 依屋子的中心與 rotY 換算成世界座標。
 *
 * 量自模型頂點的三個關鍵值：
 *  - 牆片佔一格（local x -0.5~0.5），外牆面固定在 local z = +0.5，厚 0.3
 *  - 屋頂斜面是 45°：屋脊邊在 local x = -0.5、頂面 y = 1.283，順著 +X 降到 y = 0 時剛好 x = 0.783
 *  - 山牆三角（cabin-wall-roof）同樣 45°，頂點在 local x = -0.5、高 1
 * 所以牆高 1 格的屋子，屋脊在 y = 2，屋頂零件的原點要放在 1 - 0.283。
 */

/** 屋頂斜面原點與牆頂的落差（讓 45° 斜面剛好接在山牆的斜邊上） */
const ROOF_DROP = 0.283;
/** 屋頂斜面零件沿屋脊的原始深度，以及它在兩端各留的出簷 */
const ROOF_PANEL_DEPTH = 1.4;
const ROOF_EAVE = 0.2;
/** 屋角柱沿對角線往外讓開的距離（格） */
const CORNER_OUT = 0.06;
/** 牆高（格） */
const WALL_TOP = 1;
const HALF_PI = Math.PI / 2;

interface LocalPiece {
  model: string;
  x: number;
  y?: number;
  z: number;
  rotY?: number;
  /** 沿零件自身 Z 軸的縮放（屋頂斜面與屋脊原木用它剛好貼齊，不重疊） */
  zScale?: number;
}

/** 牆片：外牆面落在座標 p、沿牆方向的中心在 u */
function wall(out: LocalPiece[], model: string, side: 'N' | 'S' | 'E' | 'W', p: number, u: number, y = 0): void {
  if (side === 'S') out.push({ model, x: u, y, z: p - 0.5, rotY: 0 });
  else if (side === 'N') out.push({ model, x: u, y, z: p + 0.5, rotY: Math.PI });
  else if (side === 'E') out.push({ model, x: p - 0.5, y, z: u, rotY: HALF_PI });
  else out.push({ model, x: p + 0.5, y, z: u, rotY: -HALF_PI });
}

/**
 * 山牆三角：兩片半三角拼成頂點在 x=0 的等腰三角形。
 * 零件的頂點固定在 local -X，只能靠 Y 軸旋轉擺放，所以右半用 rotY=0、
 * 左半用 rotY=π（牆面因此要往 +Z 挪 0.5 才會落回同一個平面）。
 */
function gable(out: LocalPiece[], p: number, y: number): void {
  out.push({ model: 'cabin-wall-roof', x: 0.5, y, z: p - 0.5, rotY: 0 });
  out.push({ model: 'cabin-wall-roof', x: -0.5, y, z: p + 0.5, rotY: Math.PI });
}

/** 一棟木屋的所有零件（kit 單位，中心在原點，正面朝 +Z） */
function cabinLocal(c: CabinDef): LocalPiece[] {
  const out: LocalPiece[] = [];
  const halfZ = c.len / 2;
  /** 每一格牆的局部 Z（格中心） */
  const zs = Array.from({ length: c.len }, (_, i) => i - (c.len - 1) / 2);
  const roof = c.roof === 'snow' ? 'cabin-roof-snow' : 'cabin-roof';

  // 兩側長牆：中間那格開窗，有花圈的屋子在西牆掛一個
  for (const [i, z] of zs.entries()) {
    const mid = i === Math.floor(c.len / 2);
    wall(out, mid ? 'cabin-window-a' : 'cabin-wall', 'E', 1, z);
    wall(out, mid ? 'cabin-window-b' : c.wreath && i === 0 ? 'cabin-wall-wreath' : 'cabin-wall', 'W', -1, z);
  }

  // 正面（+Z）：一格大門、一格大窗；背面（-Z）兩格實牆
  for (const x of [-0.5, 0.5]) {
    wall(out, x === c.doorX ? 'cabin-door-rotate' : 'cabin-window-large', 'S', halfZ, x);
    wall(out, 'cabin-wall', 'N', -halfZ, x);
  }
  gable(out, halfZ, WALL_TOP);
  gable(out, -halfZ, WALL_TOP);

  // 屋頂：整條屋脊一片斜面，脊上壓一條原木；有煙囪的話那一端另外切一片。
  //
  // 斜面零件沿屋脊有 1.4 格深（兩端各留 ROOF_EAVE 的出簷），一格卻只有 1.0，
  // 照格子一格一片會讓相鄰兩片重疊 0.4 —— 兩片一模一樣的斜面疊在一起就是整片 z-fighting。
  // 改成沿 Z 拉長成需要的長度：既沒有重疊，雪脊也是一條到底沒有接縫。
  // 煙囪那一片不能拉長（煙囪會跟著變成長條），所以維持原尺寸貼在屋脊的一端，
  // 剩下那一段再用一片拉長的補滿。
  const roofY = WALL_TOP - ROOF_DROP;
  const halfSpan = halfZ + ROOF_EAVE;
  for (const side of [1, -1] as const) {
    // side=1 是 +X 那半邊（rotY 0），-1 是 -X 那半邊（轉 180°）
    const px = side * 0.5;
    const rotY = side > 0 ? 0 : Math.PI;
    // 煙囪只長在 +X 那半邊
    const chimneyEnd = side > 0 ? c.chimneyEnd : undefined;
    if (chimneyEnd === undefined) {
      out.push({ model: roof, x: px, y: roofY, z: 0, rotY, zScale: (halfSpan * 2) / ROOF_PANEL_DEPTH });
      continue;
    }
    // 煙囪那一片原尺寸貼齊屋脊的一端，剩下的那一段用一片拉長的補到另一端
    const chimneyEdge = chimneyEnd * halfSpan;
    const farEdge = -chimneyEdge;
    const seam = chimneyEdge - chimneyEnd * ROOF_PANEL_DEPTH;
    out.push({ model: `${roof}-chimney`, x: px, y: roofY, z: (chimneyEdge + seam) / 2, rotY });
    out.push({
      model: roof,
      x: px,
      y: roofY,
      z: (seam + farEdge) / 2,
      rotY,
      zScale: Math.abs(farEdge - seam) / ROOF_PANEL_DEPTH,
    });
  }
  out.push({ model: 'cabin-roof-top', x: 0, y: WALL_TOP + 1, z: 0, rotY: 0, zScale: halfSpan * 2 });

  // 四角原木柱：零件的柱心在 local (-0.5, +0.5)，旋轉後對應到四個角。
  //
  // 柱子與牆的原木剖面一樣、外表面只差 0.05，兩邊的凹凸會互相穿插而閃爍，
  // 所以沿對角線往外讓開 CORNER_OUT：讓柱子的外表面明顯在牆之前、
  // 內側則整個埋進牆裡，兩者就沒有任何一對面貼在一起。
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rotY = sx < 0 ? (sz > 0 ? 0 : -HALF_PI) : sz > 0 ? HALF_PI : Math.PI;
      out.push({
        model: 'cabin-corner-logs',
        x: sx * (0.5 + CORNER_OUT),
        z: sz * (halfZ - 0.5 + CORNER_OUT),
        rotY,
      });
    }
  }
  return out;
}

/** 屋子的局部座標（格）→ 世界座標（公尺） */
function toWorld(c: CabinDef, p: LocalPiece): HolidayPiece {
  const s = Math.sin(c.rotY);
  const co = Math.cos(c.rotY);
  return {
    model: p.model,
    x: c.x + (p.x * co + p.z * s) * XMAS_UNIT,
    y: (p.y ?? 0) * XMAS_UNIT,
    z: c.z + (-p.x * s + p.z * co) * XMAS_UNIT,
    rotY: (p.rotY ?? 0) + c.rotY,
    scale: p.zScale === undefined ? XMAS_UNIT : [XMAS_UNIT, XMAS_UNIT, XMAS_UNIT * p.zScale],
  };
}

/** 一個直接擺在地上的裝飾（公尺，模型原點已在底部中心） */
function prop(model: string, x: number, z: number, rotY = 0, scale = XMAS_UNIT, y = 0): HolidayPiece {
  return { model, x, y, z, rotY, scale };
}

/**
 * 掛在兩盞路燈之間的燈串：lights 零件本身是一小段（1 單位寬），
 * 沿路排幾段並依 sin 做出下垂，看起來就像一條掛過去的燈鍊。
 */
function lightString(x1: number, x2: number, z: number, top: number): HolidayPiece[] {
  const span = x2 - x1;
  const count = Math.max(1, Math.round(Math.abs(span) / XMAS_UNIT));
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return prop('lights-colored', x1 + span * t, z, 0, XMAS_UNIT, top - Math.sin(Math.PI * t) * 0.5);
  });
}

/** 路燈的 X 位置（小鎮主街，沿 z = LAMP_Z 一整排） */
const LAMP_Z = 10.4;
const LAMP_X = [-11, -6.2, -1.4, 3.4, 8.2, 13, 17.8, 22.4];

/**
 * 禮物中心離大樹的對角偏移（公尺）。軌道外緣在 TRAIN_RADIUS + 0.22 = 2.12，
 * 禮物半寬約 0.45，所以對角距離要 2.8 以上才不會壓到鐵軌。
 */
const PRESENT_RING = 2.0;

/** 大聖誕樹站的位置（小火車繞著它跑）；和家具表的碰撞盒共用同一個座標 */
export const TREE_SQUARE = (() => {
  const f = FURNITURE.find((f) => f.variant === 'tree-decorated-snow');
  if (!f) throw new Error('家具表裡沒有大聖誕樹');
  return { x: f.x, z: f.z };
})();

/**
 * 小鎮的裝飾（不參與碰撞）。有碰撞的樹、岩石、雪堡定義在 shared 的家具表，
 * 由 solidProps() 讀回來，位置只有一份。
 */
const decorations: HolidayPiece[] = [
  // 地面積雪：先鋪幾塊大的把雪地弄得有起伏
  prop('snow-flat-large', -8.5, 10.8, 0.3),
  prop('snow-flat-large', 4.5, 11.5, 1.9),
  prop('snow-flat-large', 16, 11, 0.8),
  prop('snow-flat', -2.5, 10.6, 2.4),
  prop('snow-flat', 10, 12.6, 0.5),
  prop('snow-flat', 20.5, 16.5, 1.4),
  prop('snow-pile', -6.2, 12.6, 0.9),
  prop('snow-pile', 8.8, 10.2, 2.2),
  prop('snow-pile', 18.6, 10.4, 0.2),

  // 鎮上的角色們
  prop('snowman-hat', -6.2, 10.6, -0.5),
  prop('reindeer', -9.6, 11.4, 0.7),
  prop('sled-long', 13.2, 11.8, -0.9),
  prop('nutcracker', 14.4, 12.6, Math.PI),

  // 大聖誕樹腳下的禮物（樹本身有碰撞，定義在家具表）。
  // 擺在軌道外圈的四個對角：半徑要大於鐵軌外緣再加上禮物自身的半寬，否則會壓在軌道上
  ...([
    ['present-a-cube', -1, -1, 0.4],
    ['present-b-round', 1, -1, 1.2],
    ['present-a-rectangle', 1, 1, 2.6],
    ['present-b-cube', -1, 1, 0.9],
  ] as const).map(([model, sx, sz, rotY]) =>
    prop(model, TREE_SQUARE.x + sx * PRESENT_RING, TREE_SQUARE.z + sz * PRESENT_RING, rotY),
  ),

  // 拐杖糖路標
  prop('candy-cane-red', -2.2, 11.4),
  prop('candy-cane-red', 10.4, 12.2),

  // 打雪仗場地：場中央的積雪、兩邊各四堆備料用的雪
  prop('snow-flat-large', SNOW_CENTER_X, SNOW_CENTER_Z, 0),
  prop('snow-flat', -4.5, 27.5, 1.1),
  prop('snow-flat', 4.5, 32.5, 2.3),
  ...SNOW_PILES.map((s) => prop('snow-pile', s.x, s.z)),

  // 兩端的雪人靶子與雪橇（進場的那一側各放一個）
  prop('snowman', -7, 21.5, 0.4),
  prop('snowman', 7, 38.5, Math.PI + 0.4),
  prop('sled', -3.4, 21.2, 0.8),
  prop('sled-long', 3.4, 38.8, Math.PI - 0.6),

  // 側邊圍籬上的路燈（避開四角的雪松）
  prop('lantern', -10.9, 26),
  prop('lantern', 10.9, 26),
  prop('lantern', -10.9, 34),
  prop('lantern', 10.9, 34),

  // 中線與入口的標記
  ...[-9, -3, 3, 9].map((x) => prop('candy-cane-green', x, 30)),
  prop('candy-cane-red', -6.4, 20.4),
  prop('candy-cane-red', -1.1, 20.4),
];

/** 家具表裡屬於小鎮、而且有指定模型的那些（樹、岩石、雪堡） */
function solidProps(): HolidayPiece[] {
  return FURNITURE.filter((f) => f.type === 'xmas' && f.variant).map((f) =>
    prop(f.variant!, f.x, f.z, f.rotY ?? 0, XMAS_PROP_SCALE[f.variant!] ?? XMAS_UNIT),
  );
}

/** 主街路燈 + 兩兩之間的燈串 */
function streetLights(): HolidayPiece[] {
  const out = LAMP_X.map((x) => prop('lantern', x, LAMP_Z));
  // 每隔一段掛一條，不是整條街都掛滿
  for (const i of [1, 3, 5]) out.push(...lightString(LAMP_X[i], LAMP_X[i + 1], LAMP_Z, 3.1));
  return out;
}

/** 小鎮＋雪仗場地的所有 Holiday Kit 零件 */
export const HOLIDAY_PIECES: HolidayPiece[] = [
  ...CABINS.flatMap((c) => cabinLocal(c).map((p) => toWorld(c, p))),
  ...solidProps(),
  ...streetLights(),
  ...decorations,
];
