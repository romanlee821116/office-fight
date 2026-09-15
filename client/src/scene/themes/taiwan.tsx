import { GROUND_Y, KEEPOUT, PropBuilder, WORLD_CX, distToKeepout, facingSpot, inViewCorridor, landmarkHeight, pick, range, rng } from './layout';
import { PartBuilder } from './parts';
import type { SceneTheme } from './types';

/** 遠景公寓大樓（低模，×9 約 14～20m 高） */
const APARTMENTS = ['low-detail-building-b', 'low-detail-building-d', 'low-detail-building-g', 'low-detail-building-k'];
const APT_HEIGHT: Record<string, number> = {
  'low-detail-building-b': 2.23,
  'low-detail-building-d': 1.75,
  'low-detail-building-g': 2.0,
  'low-detail-building-k': 1.55,
};
const S_APT = 9;
/** 遠景起點：比這更近的地方交給 primitive 騎樓透天，才不會兩層樓的方塊擋住鏡頭 */
const FAR = 46;

/** 老公寓外牆：洗石子、二丁掛、磁磚白 */
const WALL_TINTS = ['#D6D0C4', '#CBCFC8', '#C9BFAE', '#B9C2BF', '#DAD6CC'];
const SIGN_COLORS = ['#E5484D', '#F2C94C', '#2F80ED', '#27AE60', '#F2994A', '#9B51E0'];
const SCOOTER_COLORS = ['#C7CBD1', '#3A4450', '#B8352F', '#2F6F8F', '#E0E3E6', '#6B7280'];
/** nature kit 的樹原色偏青，換成榕樹綠 */
const NATURE = { leafsGreen: '#4F8F4A', woodBark: '#7A5B40', grass: '#5C9A52' };

// ---------- 街廓尺寸（以「距浮島留白邊緣」計） ----------
/** 人行道 4m、柏油 10m、人行道 4m，對街透天從 18m 起、深 7m */
const WALK_IN = 0.5;
const ROAD_IN = 4.5;
const ROAD_OUT = 14.5;
const WALK_OUT = 18.5;
const SHOP_FRONT = 19;
const SHOP_DEPTH = 7;
const SHOP_W = 9;

/**
 * 台北 101 放在後方街廓的巷口盡頭：相機預設 yaw 是朝 −X−Z 看，主地標放這裡
 * 切換主題抬起鏡頭就直接入鏡（後牆只有 3m，低於相機高度，不會擋）。透天排讓出缺口。
 */
const T101 = facingSpot(72);
const T101_H = landmarkHeight(72, 10.5);
/** 夜市攤區擺在後方街廓的人行道上 */
const NIGHT_MARKET = { from: WORLD_CX - 30, to: WORLD_CX - 2, z: KEEPOUT.minZ - 2.8 };

/** 四個街廓方向：n 為朝向島的法線，透天正面（+Z）要轉到 -n */
type Side = { axis: 'z' | 'x'; sign: 1 | -1; rotY: number; from: number; to: number };
const SIDES: Side[] = [
  { axis: 'z', sign: 1, rotY: Math.PI, from: WORLD_CX - 58, to: WORLD_CX + 58 },
  { axis: 'z', sign: -1, rotY: 0, from: WORLD_CX - 58, to: WORLD_CX + 58 },
  { axis: 'x', sign: -1, rotY: Math.PI / 2, from: -34, to: 34 },
  { axis: 'x', sign: 1, rotY: -Math.PI / 2, from: -34, to: 34 },
];

/** 把「沿街位置 t、距島邊 d」換算成世界座標與朝向 */
function place(side: Side, t: number, d: number): { x: number; z: number; rotY: number } {
  if (side.axis === 'z') {
    const z = side.sign > 0 ? KEEPOUT.maxZ + d : KEEPOUT.minZ - d;
    return { x: t, z, rotY: side.rotY };
  }
  const x = side.sign > 0 ? KEEPOUT.maxX + d : KEEPOUT.minX - d;
  return { x, z: t, rotY: side.rotY };
}

/** 正面朝島的方向（世界角度），用於招牌、遮雨棚 */
function facing(side: Side): number {
  return side.rotY;
}

// ---------- GLB 物件 ----------
function buildProps() {
  const rand = rng(886);
  const pb = new PropBuilder();

  // 遠景：公寓大樓 + 頂樓鐵皮加蓋
  for (let x = WORLD_CX - 95; x < WORLD_CX + 95; x += 9) {
    for (let z = -78; z < 78; z += 9) {
      const px = x + range(rand, -3, 3);
      const pz = z + range(rand, -3, 3);
      if (distToKeepout(px, pz) < FAR) continue;
      if (inViewCorridor(px, pz, 16)) continue; // 望向 101 的走廊保持淨空
      if (rand() < 0.22) continue;
      const m = pick(rand, APARTMENTS);
      const rotY = (Math.floor(rand() * 4) * Math.PI) / 2;
      pb.add(`taiwan/city/${m}`, { x: px, z: pz, rotY, scale: S_APT }, { tint: pick(rand, WALL_TINTS) });
      const top = GROUND_Y + APT_HEIGHT[m] * S_APT;
      if (rand() < 0.75) {
        pb.add(`taiwan/urban/${rand() < 0.5 ? 'roof-metal-type-a' : 'roof-metal-type-b'}`, { x: px, z: pz, y: top, rotY, scale: 4 });
      } else {
        pb.add('taiwan/urban/roof-metal-poles', { x: px, z: pz, y: top, rotY, scale: 4 });
      }
    }
  }

  for (const side of SIDES) {
    const face = facing(side);
    for (let t = side.from; t < side.to; t += 4.5) {
      // 行道樹一律種在對街：近側人行道就在鏡頭前方幾公尺，6m 高的樹會整個擋住畫面
      if (rand() < 0.5) {
        const p = place(side, t + range(rand, -1.2, 1.2), range(rand, ROAD_OUT + 1, WALK_OUT - 0.6));
        pb.add('taiwan/nature/tree_oak', { x: p.x, z: p.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 4, 5) }, { recolor: NATURE });
      }
      // 近側只放及膝的灌木
      if (rand() < 0.3) {
        const p = place(side, t + range(rand, -1.5, 1.5), range(rand, WALK_IN, ROAD_IN - 1));
        pb.add(`taiwan/nature/${rand() < 0.5 ? 'plant_bush' : 'plant_bushLarge'}`, { x: p.x, z: p.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 2.6, 3.6) }, { recolor: NATURE });
      }
      // 路邊停的汽車（沿街向）
      if (rand() < 0.26) {
        const lane = rand() < 0.5 ? ROAD_IN + 1.6 : ROAD_OUT - 1.6;
        const p = place(side, t, lane);
        const car = pick(rand, ['car/sedan', 'car/van', 'car/hatchback-sports', 'car/delivery', 'urban/truck-green']);
        const along = side.axis === 'z' ? Math.PI / 2 : 0;
        pb.add(`taiwan/${car}`, { x: p.x, z: p.z, rotY: along + (rand() < 0.5 ? 0 : Math.PI), scale: car === 'urban/truck-green' ? 2.2 : 1.6 });
      }
      // 三角錐
      if (rand() < 0.18) {
        const p = place(side, t + range(rand, -2, 2), range(rand, ROAD_IN - 0.4, ROAD_IN + 0.6));
        pb.add('taiwan/car/cone', { x: p.x, z: p.z, scale: 1.6 });
      }
    }

    // 小吃攤的遮陽傘擺在對街：近側人行道就在鏡頭前，2.7m 的傘會被透視放大到擋住半個畫面
    for (let i = 0; i < 5; i++) {
      const t = range(rand, side.from + 6, side.to - 6);
      const p = place(side, t, range(rand, ROAD_OUT + 1.4, WALK_OUT - 1));
      pb.add(`taiwan/city/detail-parasol-${rand() < 0.5 ? 'a' : 'b'}`, { x: p.x, z: p.z, rotY: face, scale: 5 });
    }
  }

  return pb.build();
}

// ---------- primitive 街景 ----------
const COL = {
  asphalt: '#3C4045',
  paint: '#D9D5C8',
  laneYellow: '#C9A43A',
  brick: '#9C7264',
  kerb: '#C6C2B8',
  column: '#CFC9BC',
  ceiling: '#C2BCAF',
  glass: '#7FA9B8',
  window: '#4A5560',
  bars: '#6E6A62',
  ac: '#D8D6D0',
  tin: '#8E9AA3',
  tank: '#4C7FB5',
  rail: '#8A8478',
  pole: '#8A8478',
  wire: '#2E2A26',
  cartBody: '#C9CDD2',
  cartTop: '#E5E2DA',
  stool: '#C0392B',
  table: '#E0DCD2',
  tyre: '#1E1E22',
  dark: '#2F3237',
  bulb: '#FFE9A8',
  t101: '#5FA79B',
  t101dark: '#43786F',
};

/** 一棟騎樓透天：騎樓柱廊、店面招牌、鐵窗、冷氣、頂樓鐵皮與水塔、側面直式招牌 */
function shophouse(b: PartBuilder, rand: () => number): void {
  const floors = 3 + Math.floor(rand() * 3);
  const h = floors * 3;
  const wall = pick(rand, WALL_TINTS);
  const w = SHOP_W - 1;
  const d = SHOP_DEPTH;

  // 2F 以上主體，一樓往內縮 3.2m 形成騎樓
  b.box({ y: 3, w, h: h - 3, d, c: wall });
  b.box({ z: -1.6, w, h: 3, d: d - 3.2, c: wall });
  // 騎樓柱與天花
  for (const dx of [-w / 2 + 0.35, w / 2 - 0.35]) b.box({ x: dx, y: 0, z: d / 2 - 0.35, w: 0.55, h: 3, d: 0.55, c: COL.column });
  b.box({ y: 2.85, z: d / 2 - 1.6, w, h: 0.3, d: 3.2, c: COL.ceiling });
  // 店面玻璃與騎樓上緣的橫式招牌
  b.box({ y: 0.25, z: 0.2, w: w - 1.2, h: 2.3, d: 0.12, c: COL.glass });
  b.box({ y: 3.15, z: d / 2 - 0.1, w: w - 0.5, h: 0.95, d: 0.28, c: pick(rand, SIGN_COLORS), glow: 0.45 });

  for (let f = 1; f < floors; f++) {
    const y = f * 3;
    // 窗洞、外推鐵窗（橫框＋豎條）、冷氣室外機
    b.box({ y: y + 0.75, z: d / 2 + 0.02, w: w * 0.52, h: 1.5, d: 0.1, c: COL.window });
    b.box({ y: y + 0.6, z: d / 2 + 0.42, w: w * 0.58, h: 0.07, d: 0.06, c: COL.bars });
    b.box({ y: y + 2.35, z: d / 2 + 0.42, w: w * 0.58, h: 0.07, d: 0.06, c: COL.bars });
    for (let i = 0; i < 6; i++) {
      b.box({ x: -w * 0.29 + (i * w * 0.58) / 5, y: y + 0.6, z: d / 2 + 0.42, w: 0.06, h: 1.8, d: 0.06, c: COL.bars });
    }
    b.box({ x: w * 0.28, y: y + 0.55, z: d / 2 + 0.12, w: 0.9, h: 0.65, d: 0.45, c: COL.ac });
    b.box({ x: w * 0.28, y: y + 0.6, z: d / 2 + 0.35, w: 0.62, h: 0.52, d: 0.06, c: COL.bars });
  }

  // 頂樓：正面女兒牆、鐵皮加蓋、水塔
  b.box({ y: h, z: d / 2 - 0.15, w, h: 0.8, d: 0.25, c: wall });
  for (const dx of [-w / 2 + 0.12, w / 2 - 0.12]) b.box({ x: dx, y: h, w: 0.25, h: 0.8, d, c: wall });
  b.box({ x: -0.8, y: h, z: -1, w: w - 2.6, h: 2.1, d: d - 2.6, c: COL.tin });
  b.box({ x: -0.8, y: h + 2.1, z: -1, w: w - 2.2, h: 0.18, d: d - 2.2, c: COL.tin });
  b.cyl({ x: w / 2 - 1.6, y: h + 0.8, z: 1.4, r: 0.85, h: 1.7, c: COL.tank, seg: 10 });
  // 側面直式招牌
  b.box({ x: -w / 2 - 0.18, y: 4.2, z: d / 2 - 1.4, w: 0.22, h: Math.min(h - 4.6, 6.5), d: 1.15, c: pick(rand, SIGN_COLORS), glow: 0.5 });
}

/** 一台機車 */
function scooter(b: PartBuilder, color: string): void {
  b.wheel({ y: 0.26, z: 0.56, r: 0.26, h: 0.12, c: COL.tyre });
  b.wheel({ y: 0.27, z: -0.55, r: 0.27, h: 0.15, c: COL.tyre });
  b.box({ y: 0.32, z: -0.12, w: 0.4, h: 0.32, d: 1.05, c: color });
  b.box({ y: 0.64, z: -0.28, w: 0.42, h: 0.15, d: 0.62, c: COL.dark });
  b.box({ y: 0.42, z: 0.52, w: 0.44, h: 0.62, d: 0.26, c: color });
  b.box({ y: 1.04, z: 0.4, w: 0.66, h: 0.07, d: 0.07, c: COL.dark });
  for (const dx of [-0.32, 0.32]) b.cyl({ x: dx, y: 1.11, z: 0.4, r: 0.05, h: 0.12, c: COL.dark, seg: 6 });
  b.box({ y: 0.9, z: 0.64, w: 0.26, h: 0.16, d: 0.1, c: '#F2E6C0', glow: 0.25 });
}

/** 小吃攤：餐車、折疊桌、紅色塑膠椅 */
function foodStall(b: PartBuilder, rand: () => number): void {
  b.box({ y: 0.55, w: 1.9, h: 0.55, d: 0.9, c: COL.cartBody });
  b.box({ y: 1.1, w: 2.0, h: 0.08, d: 1.0, c: COL.cartTop });
  for (const dx of [-0.7, 0.7]) for (const dz of [-0.32, 0.32]) b.wheel({ x: dx, y: 0.18, z: dz, r: 0.18, h: 0.08, c: COL.tyre });
  b.box({ x: 0.45, y: 1.18, w: 0.5, h: 0.3, d: 0.6, c: COL.dark });
  // 折疊桌與四張塑膠椅
  b.box({ x: -2.4, y: 0.68, w: 1.5, h: 0.07, d: 0.9, c: COL.table });
  for (const dx of [-2.9, -1.9]) for (const dz of [-0.35, 0.35]) b.box({ x: dx, y: 0, z: dz, w: 0.06, h: 0.68, d: 0.06, c: COL.rail });
  for (let i = 0; i < 4; i++) {
    const cx = -3.3 + (i % 2) * 1.8;
    const cz = i < 2 ? -0.95 : 0.95;
    const s = b.at(cx + range(rand, -0.15, 0.15), 0, cz, range(rand, -0.5, 0.5));
    s.box({ y: 0.36, w: 0.42, h: 0.06, d: 0.42, c: COL.stool });
    s.box({ y: 0.42, z: -0.18, w: 0.42, h: 0.38, d: 0.06, c: COL.stool });
    for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) s.box({ x: dx, y: 0, z: dz, w: 0.05, h: 0.36, d: 0.05, c: COL.stool });
  }
}

function buildLandmarks(): PartBuilder {
  const rand = rng(4886);
  const root = new PartBuilder().at(0, GROUND_Y, 0);

  for (const side of SIDES) {
    const face = facing(side);
    const len = side.to - side.from;
    const mid = (side.from + side.to) / 2;

    // 路面：紅磚人行道（兩側）＋柏油＋車道線
    const band = (from: number, to: number, c: string, y = 0.01) => {
      const p = place(side, mid, (from + to) / 2);
      root.slab({ x: p.x, y, z: p.z, w: side.axis === 'z' ? len : to - from, d: side.axis === 'z' ? to - from : len, c });
    };
    band(WALK_IN, ROAD_IN, COL.brick);
    band(ROAD_IN, ROAD_OUT, COL.asphalt, 0.008);
    band(ROAD_OUT, WALK_OUT, COL.brick);
    band(WALK_OUT, SHOP_FRONT, COL.kerb);
    // 中央雙黃線
    for (const d of [9.2, 9.8]) {
      const p = place(side, mid, d);
      root.slab({ x: p.x, y: 0.02, z: p.z, w: side.axis === 'z' ? len : 0.16, d: side.axis === 'z' ? 0.16 : len, c: COL.laneYellow });
    }
    // 機車格（貼騎樓側人行道邊）與整排機車
    for (let t = side.from + 3; t < side.to - 3; t += 5.4) {
      if (rand() < 0.32) continue;
      const g = place(side, t, ROAD_IN + 1.1);
      root.slab({ x: g.x, y: 0.02, z: g.z, w: side.axis === 'z' ? 4.6 : 2.2, d: side.axis === 'z' ? 2.2 : 4.6, c: COL.paint });
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const p = place(side, t - 1.8 + i * 1.0 + range(rand, -0.12, 0.12), ROAD_IN + 1.1);
        scooter(root.at(p.x, 0, p.z, face + range(rand, 0.5, 0.75)), pick(rand, SCOOTER_COLORS));
      }
    }
    // 斑馬線
    for (const t of [side.from + len * 0.28, side.from + len * 0.72]) {
      for (let i = 0; i < 7; i++) {
        const p = place(side, t - 1.8 + i * 0.62, (ROAD_IN + ROAD_OUT) / 2);
        root.slab({ x: p.x, y: 0.02, z: p.z, w: side.axis === 'z' ? 0.34 : ROAD_OUT - ROAD_IN, d: side.axis === 'z' ? ROAD_OUT - ROAD_IN : 0.34, c: COL.paint });
      }
    }
    // 騎樓透天排（台北 101 正對的巷口留缺口）
    for (let t = side.from + SHOP_W / 2; t < side.to; t += SHOP_W) {
      if (side === SIDES[1] && t > NIGHT_MARKET.from - 6 && t < NIGHT_MARKET.to + 6) continue; // 夜市段不蓋透天
      const p = place(side, t, SHOP_FRONT + SHOP_DEPTH / 2);
      if (inViewCorridor(p.x, p.z, 14)) continue; // 望向 101 的巷口
      shophouse(root.at(p.x, 0, p.z, p.rotY), rand);
    }
    // 小吃攤的餐車與紅椅（與 GLB 遮陽傘同一組亂數序列，位置對得上）
    for (let i = 0; i < 5; i++) {
      const t = range(rand, side.from + 6, side.to - 6);
      const p = place(side, t, range(rand, ROAD_OUT + 1.4, WALK_OUT - 1));
      foodStall(root.at(p.x, 0, p.z, face + Math.PI), rand);
    }
    // 電線桿與電線：跟行道樹一樣擺在對街，免得電線橫在鏡頭前
    const poleD = ROAD_OUT + 1.2;
    const poles: number[] = [];
    for (let t = side.from + 8; t < side.to - 4; t += 13) poles.push(t);
    for (const t of poles) {
      const p = place(side, t, poleD);
      const g = root.at(p.x, 0, p.z, face);
      g.cyl({ r: 0.15, rb: 0.2, h: 7.4, c: COL.pole, seg: 7 });
      g.box({ y: 6.5, w: 2.0, h: 0.14, d: 0.14, c: COL.rail });
      g.box({ y: 5.9, w: 1.5, h: 0.12, d: 0.12, c: COL.rail });
    }
    for (let i = 0; i < poles.length - 1; i++) {
      const a = place(side, poles[i], poleD);
      const c = place(side, (poles[i] + poles[i + 1]) / 2, poleD);
      const span = poles[i + 1] - poles[i];
      for (const off of [-0.7, 0, 0.7]) {
        root.box({
          x: c.x + (side.axis === 'x' ? off : 0),
          y: 6.35,
          z: c.z + (side.axis === 'z' ? off : 0),
          w: side.axis === 'z' ? span : 0.05,
          h: 0.05,
          d: side.axis === 'z' ? 0.05 : span,
          c: COL.wire,
        });
      }
      void a;
    }
  }

  // 夜市攤區：紅白條紋棚、料理檯、燈串
  {
    const { from, to, z } = NIGHT_MARKET;
    for (let x = from; x <= to; x += 4.6) {
      const g = root.at(x, 0, z, Math.PI);
      for (const sx of [-1.9, 1.9]) for (const sz of [-1.1, 1.1]) g.cyl({ x: sx, z: sz, r: 0.06, h: 2.3, c: COL.rail, seg: 6 });
      // 棚頂：紅白相間的布條
      for (let i = 0; i < 6; i++) {
        g.box({ x: -2 + i * 0.8, y: 2.3, w: 0.8, h: 0.14, d: 2.6, c: i % 2 ? '#D9453C' : '#F2EDE2' });
      }
      g.box({ y: 2.44, w: 4.3, h: 0.1, d: 2.8, c: '#E8E3D8' });
      // 攤檯與料理台
      g.box({ y: 0.85, w: 4.0, h: 0.1, d: 1.0, c: COL.cartTop });
      g.box({ y: 0, w: 3.8, h: 0.85, d: 0.85, c: COL.cartBody });
      g.box({ x: 1.2, y: 0.95, w: 1.0, h: 0.32, d: 0.7, c: COL.dark });
      g.box({ y: 1.75, z: 1.28, w: 3.4, h: 0.55, d: 0.12, c: '#E5484D', glow: 0.5 });
    }
    root.box({ x: (from + to) / 2, y: 3.1, z: z + 1.6, w: to - from + 4, h: 0.04, d: 0.04, c: COL.wire });
    for (let x = from - 2; x <= to + 2; x += 1.1) root.ball({ x, y: 3.02, z: z + 1.6, r: 0.11, c: COL.bulb, glow: 0.85 });
  }

  // 台北 101：基座、八節倒梯竹節、塔尖
  {
    const g = root.at(T101.x, 0, T101.z);
    const k = T101_H / 21;
    const segH = 1.75 * k;
    g.box({ w: 7.5 * k, h: 3.4 * k, d: 7.5 * k, c: COL.t101 });
    g.box({ y: 3.4 * k, w: 5.6 * k, h: 1.4 * k, d: 5.6 * k, c: COL.t101dark });
    // 八節「斗」：每節上寬下窄的倒梯形，節間夾一道深色腰帶
    for (let i = 0; i < 8; i++) {
      const y = 4.8 * k + i * segH;
      g.cyl({ y, r: 3.4 * k, rb: 2.5 * k, h: segH, c: COL.t101, seg: 4, rotY: Math.PI / 4 });
      g.cyl({ y, r: 2.7 * k, rb: 2.7 * k, h: 0.22 * k, c: COL.t101dark, seg: 4, rotY: Math.PI / 4 });
    }
    g.box({ y: 4.8 * k + 8 * segH, w: 3.2 * k, h: 1.6 * k, d: 3.2 * k, c: COL.t101dark });
    g.cyl({ y: 4.8 * k + 8 * segH + 1.6 * k, r: 0.14 * k, rb: 1.0 * k, h: 5.4 * k, c: COL.t101dark, seg: 6 });
  }

  return root;
}

export const taiwan: SceneTheme = {
  id: 'taiwan',
  label: '台灣',
  emoji: '🇹🇼',
  palette: {
    ground: '#A3A39C',
    floor: '#E8E2D2',
    floorGrid: '#D6CFBE',
    wallBack: '#BFD3C1',
    wallSide: '#C9DBCB',
    skirting: '#F3F1EC',
    base: '#8F918C',
    terrace: '#B9B6AD',
  },
  props: buildProps(),
  landmarks: buildLandmarks,
  fogScale: 1.7,
};
