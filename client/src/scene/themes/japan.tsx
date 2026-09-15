import { GROUND_Y, KEEPOUT, MID, NEAR, PropBuilder, WORLD_CX, facingSpot, gridCells, inViewCorridor, landmarkHeight, pick, range, ringPoints, rng } from './layout';
import { PartBuilder } from './parts';
import type { SceneTheme } from './types';

const CELL = 10;
const FAR_BUILDINGS = ['low-detail-building-c', 'low-detail-building-e', 'low-detail-building-i'];
const FAR_TINTS = ['#E6E9EC', '#D5DBE0', '#C4CCD3'];
/** nature kit 原色偏青，統一換成日式庭園的深綠與灰石 */
const NATURE = { grass: '#5F8F4E', dirt: '#7A6248', stone: '#9EA39D', leafsDark: '#2F5F45', woodBarkDark: '#5A3E2E' };
const SAKURA = { ...NATURE, leafsDark: '#F3B7C9' };

/**
 * 參道沿相機預設朝向（出生點的 −X−Z，方位角 225°）鋪開，鳥居在前、五重塔在盡頭。
 * 鳥居與塔正面朝 45°（對著相機），町家則各自轉向參道中心。
 */
const FACE_CAMERA = Math.PI / 4;
const TORII = facingSpot(38);
const PAGODA = facingSpot(62);
const PAGODA_H = landmarkHeight(62, 10);
const VERMILION = '#C4392E';

/**
 * 町家：白牆、深色木格柵、寄棟瓦頂。
 * 主力沿參道兩側夾道而立（門面朝參道），其餘散在另外三面當背景。
 */
const HOUSE_ROWS: { x: number; z: number; rotY: number }[] = [];
for (const t of [44, 53, 62, 71]) {
  for (const side of [-1, 1]) {
    const p = facingSpot(t, side * 11);
    HOUSE_ROWS.push({ x: p.x, z: p.z, rotY: side > 0 ? -Math.PI / 4 : (Math.PI * 3) / 4 });
  }
}
for (let i = -2; i <= 2; i++) {
  HOUSE_ROWS.push({ x: KEEPOUT.maxX + 20, z: i * 11 + 5, rotY: -Math.PI / 2 });
  HOUSE_ROWS.push({ x: WORLD_CX + i * 11 + 16, z: KEEPOUT.maxZ + 22, rotY: Math.PI });
}

function build() {
  const rand = rng(81);
  const pb = new PropBuilder();

  for (const c of gridCells(CELL, 4, rand)) {
    if (Math.hypot(c.x - PAGODA.x, c.z - PAGODA.z) < 16) continue;
    if (inViewCorridor(c.x, c.z, 8)) continue; // 參道淨空
    if (HOUSE_ROWS.some((h) => Math.hypot(h.x - c.x, h.z - c.z) < 8)) continue;

    if (c.dist >= MID) {
      const roll = rand();
      if (roll < 0.3 && !inViewCorridor(c.x, c.z, 16)) {
        pb.add(`japan/city/${pick(rand, FAR_BUILDINGS)}`, { x: c.x, z: c.z, rotY: (Math.floor(rand() * 4) * Math.PI) / 2, scale: range(rand, 8, 10) }, { tint: pick(rand, FAR_TINTS) });
      } else if (roll < 0.75) {
        pb.add('japan/nature/tree_pineTallA_detailed', { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 5, 6.5) }, { recolor: NATURE });
      }
      continue;
    }

    if (c.dist >= NEAR) {
      const roll = rand();
      if (roll < 0.3) {
        pb.add('japan/nature/tree_pineRoundB', { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 4, 5) }, { recolor: NATURE });
      } else if (roll < 0.55) {
        pb.add('japan/nature/tree_pineRoundB', { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 3.5, 4.5) }, { recolor: SAKURA });
      } else if (roll < 0.8) {
        // 竹叢：三五株一簇
        for (let k = 0; k < 4; k++) {
          pb.add('japan/nature/crops_bambooStageB', { x: c.x + range(rand, -1.6, 1.6), z: c.z + range(rand, -1.6, 1.6), rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 5, 7) }, { recolor: NATURE });
        }
      }
      continue;
    }

    // 近景：枯山水的石組與小松
    const roll = rand();
    if (roll < 0.3) {
      pb.add(`japan/nature/${rand() < 0.5 ? 'rock_smallA' : 'rock_smallD'}`, { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 4, 6) }, { recolor: NATURE });
    } else if (roll < 0.5) {
      pb.add('japan/nature/tree_pineSmallC', { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 2.5, 3.2) }, { recolor: NATURE });
    }
  }

  // 參道踏石：從島後緣一路經過鳥居通到五重塔腳下
  for (let t = 14; t < 56; t += 1.6) {
    if (Math.abs(t - 38) < 2.4) continue; // 鳥居柱位
    const p = facingSpot(t, range(rand, -0.4, 0.4));
    pb.add('japan/nature/stone_smallFlatB', { x: p.x, z: p.z, rotY: range(rand, 0, Math.PI * 2), scale: 4 }, { recolor: NATURE });
  }
  // 島外四周零星碎石
  for (const p of ringPoints(30, 1, NEAR, rand, 3)) {
    pb.add('japan/nature/rock_smallA', { x: p.x, z: p.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 2, 3) }, { recolor: NATURE });
  }

  return pb.build();
}

const PROPS = build();

/** 鳥居：兩柱、貫、島木、笠木（兩端翹起以黑色頂板示意）、額束 */
function torii(b: PartBuilder): void {
  for (const x of [-3.2, 3.2]) {
    b.cyl({ x, r: 0.42, rb: 0.5, h: 8, c: VERMILION, seg: 12 });
    b.box({ x, w: 1.3, h: 0.5, d: 1.3, c: '#2B2B2B' });
  }
  b.box({ y: 5.6, w: 7.6, h: 0.55, d: 0.5, c: VERMILION });
  b.box({ y: 7.6, w: 9.4, h: 0.6, d: 0.7, c: VERMILION });
  b.box({ y: 8.2, w: 10.2, h: 0.5, d: 0.9, c: '#2B2B2B' });
  for (const x of [-4.9, 4.9]) b.box({ x, y: 8.55, w: 0.5, h: 0.5, d: 0.9, c: '#2B2B2B' });
  b.box({ y: 6.15, w: 0.8, h: 1.45, d: 0.4, c: VERMILION });
  b.box({ y: 6.35, z: 0.22, w: 0.55, h: 1.05, d: 0.05, c: '#F4EFE4' });
}

/** 五重塔：五層遞縮，白牆、深色勾欄與寄棟瓦頂，頂上相輪 */
function pagoda(b: PartBuilder, total: number): void {
  const tiers = 5;
  const baseH = total * 0.06;
  const tierH = (total - baseH) / (tiers + 1.6);
  const roofH = tierH * 0.62;
  const body = tierH - roofH * 0.35;
  b.box({ w: total * 0.62, h: baseH, d: total * 0.62, c: '#9EA39D' });
  for (let i = 0; i < tiers; i++) {
    const y = baseH + i * tierH;
    const w = total * 0.42 - i * total * 0.055;
    b.box({ y, w, h: body, d: w, c: '#F0E8DA' });
    b.box({ y: y + body - roofH * 0.3, w: w + 0.5, h: roofH * 0.22, d: w + 0.5, c: '#4A3A2E' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box({ x: (sx * w) / 2, y, z: (sz * w) / 2, w: 0.42, h: body, d: 0.42, c: '#4A3A2E' });
    b.pyr({ y: y + body, side: w + total * 0.16, h: roofH, c: '#3A3D43' });
  }
  const topY = baseH + tiers * tierH;
  b.cyl({ y: topY, r: 0.16, rb: 0.26, h: total * 0.2, c: '#C9A227', seg: 8 });
  for (const f of [0.05, 0.1, 0.15]) b.cyl({ y: topY + total * f, r: total * 0.035, h: 0.16, c: '#C9A227', seg: 10 });
}

/** 町家 */
function machiya(b: PartBuilder): void {
  b.box({ w: 9, h: 5, d: 7, c: '#F1EBE0' });
  b.box({ z: 3.55, w: 9.2, h: 2.4, d: 0.15, c: '#5B4636' });
  b.box({ y: 2.6, z: 3.55, w: 9.2, h: 0.3, d: 0.6, c: '#5B4636' });
  for (const dx of [-3, -1, 1, 3]) b.box({ x: dx, y: 2.9, z: 3.55, w: 0.25, h: 1.6, d: 0.2, c: '#5B4636' });
  b.pyr({ y: 5, side: 9, h: 2.6, c: '#3B3F45', sx: 1.15, sz: 0.95 });
}

/** 石燈籠 */
function lantern(b: PartBuilder): void {
  b.box({ w: 0.9, h: 0.3, d: 0.9, c: '#8F948D' });
  b.cyl({ y: 0.3, r: 0.16, rb: 0.2, h: 1.1, c: '#8F948D', seg: 8 });
  b.box({ y: 1.4, w: 0.7, h: 0.15, d: 0.7, c: '#8F948D' });
  b.box({ y: 1.55, w: 0.5, h: 0.5, d: 0.5, c: '#F5E7B8', glow: 0.5 });
  b.pyr({ y: 2.05, side: 1.1, h: 0.45, c: '#8F948D' });
  b.ball({ y: 2.65, r: 0.14, c: '#8F948D' });
}

function buildLandmarks(): PartBuilder {
  const root = new PartBuilder().at(0, GROUND_Y, 0);
  torii(root.at(TORII.x, 0, TORII.z, FACE_CAMERA));
  pagoda(root.at(PAGODA.x, 0, PAGODA.z, FACE_CAMERA), PAGODA_H);
  for (const h of HOUSE_ROWS) machiya(root.at(h.x, 0, h.z, h.rotY));
  for (const t of [20, 26, 44, 50]) {
    for (const side of [-1, 1]) {
      const p = facingSpot(t, side * 3.2);
      lantern(root.at(p.x, 0, p.z));
    }
  }
  return root;
}

export const japan: SceneTheme = {
  id: 'japan',
  label: '日本',
  emoji: '⛩️',
  palette: {
    ground: '#8FAE7E',
    floor: '#E3D3A8',
    floorGrid: '#D2C08F',
    wallBack: '#F1ECE1',
    wallSide: '#EDE6D8',
    skirting: '#5B4636',
    base: '#7B7F7A',
    terrace: '#C9C4B4',
  },
  props: PROPS,
  landmarks: buildLandmarks,
  fogScale: 1.7,
};
