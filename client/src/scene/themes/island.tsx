import { GROUND_Y, KEEPOUT, MID, NEAR, PropBuilder, WORLD_CX, distToKeepout, facingSpot, landmarkHeight, range, ringPoints, rng } from './layout';
import { PartBuilder } from './parts';
import type { SceneTheme } from './types';

/** nature kit 原色偏青，換成熱帶的翠綠與棕櫚樹幹 */
const NATURE = { leafsGreen: '#3E9B5A', woodBark: '#8B6A47', grass: '#5DAE63', dirt: '#9A7A5A', stone: '#B9B2A4' };
const SAND = '#EED9A6';
const SHALLOW = '#6FCBD9';

/** 沙洲：環繞浮島的幾塊沙地，棕櫚與涼亭都長在上面 */
const SANDBARS = [
  { x: WORLD_CX + 4, z: KEEPOUT.maxZ + 16, r: 13 },
  { x: KEEPOUT.minX - 20, z: -6, r: 11 },
  { x: KEEPOUT.minX - 26, z: 24, r: 9 },
  { x: KEEPOUT.maxX + 24, z: 8, r: 12 },
  { x: KEEPOUT.maxX + 30, z: -26, r: 8 },
  { x: WORLD_CX - 24, z: KEEPOUT.minZ - 22, r: 10 },
  { x: WORLD_CX + 30, z: KEEPOUT.minZ - 20, r: 9 },
  { x: WORLD_CX - 40, z: KEEPOUT.maxZ + 30, r: 8 },
];
/** 火山島擺在相機預設望出去的海面上，山高依可見角度換算 */
const VOLCANO = facingSpot(74);
const VOLCANO_H = landmarkHeight(74, 10);
const PIER = { x: WORLD_CX + 4, z0: KEEPOUT.maxZ - 6 + 0.6, z1: SANDBARS[0].z - 6 };

function build() {
  const rand = rng(1979);
  const pb = new PropBuilder();
  const y = GROUND_Y + 0.08;

  for (const s of SANDBARS) {
    const n = Math.round(s.r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = range(rand, 0, Math.PI * 2);
      const d = Math.sqrt(rand()) * (s.r - 1.5);
      const x = s.x + Math.cos(a) * d;
      const z = s.z + Math.sin(a) * d;
      if (distToKeepout(x, z) < 1) continue;
      const roll = rand();
      const rotY = range(rand, 0, Math.PI * 2);
      const near = distToKeepout(x, z) < NEAR;
      if (roll < 0.45) {
        const m = near ? 'tree_palmDetailedShort' : rand() < 0.5 ? 'tree_palmDetailedTall' : 'tree_palmBend';
        pb.add(`island/nature/${m}`, { x, z, y, rotY, scale: near ? range(rand, 3.5, 4.5) : range(rand, 5, 6.5) }, { recolor: NATURE });
      } else if (roll < 0.7) {
        pb.add('island/nature/plant_bushLarge', { x, z, y, rotY, scale: range(rand, 3, 4.5) }, { recolor: NATURE });
      } else if (roll < 0.9) {
        pb.add('island/nature/grass_leafsLarge', { x, z, y, rotY, scale: range(rand, 3, 4) }, { recolor: NATURE });
      } else {
        pb.add('island/nature/rock_smallB', { x, z, y, rotY, scale: range(rand, 3, 4) }, { recolor: NATURE });
      }
    }
  }

  // 海中礁岩
  for (const p of ringPoints(26, 8, MID + 20, rand, 6)) {
    if (SANDBARS.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r + 4)) continue;
    const m = rand() < 0.5 ? 'rock_largeA' : 'rock_largeD';
    pb.add(`island/nature/${m}`, { x: p.x, z: p.z, y: GROUND_Y - 0.3, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 4, 7) }, { recolor: NATURE });
  }
  // 火山島沙灘上的棕櫚
  for (let i = 0; i < 14; i++) {
    const a = range(rand, 0, Math.PI * 2);
    const d = range(rand, 26, 33);
    pb.add('island/nature/tree_palmDetailedTall', { x: VOLCANO.x + Math.cos(a) * d, z: VOLCANO.z + Math.sin(a) * d * 0.7, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 5, 7) }, { recolor: NATURE });
  }

  return pb.build();
}

const PROPS = build();

/** 茅草涼亭 */
function hut(b: PartBuilder): void {
  b.disc({ y: 0.02, r: 3.4, c: '#C9B38A' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl({ x: sx * 2.2, z: sz * 2.2, r: 0.14, h: 3, c: '#8B6A47', seg: 7 });
  b.box({ y: 0.9, w: 2.2, h: 0.12, d: 1.1, c: '#A98A63' });
  b.pyr({ y: 3, side: 7.5, h: 2.6, c: '#C8A85A' });
  b.pyr({ y: 3.05, side: 7.9, h: 0.4, c: '#B8964B' });
}

function buildLandmarks(): PartBuilder {
  const root = new PartBuilder().at(0, GROUND_Y, 0);

  // 沙洲與外圈淺水
  for (const s of SANDBARS) {
    root.disc({ x: s.x, y: 0.03, z: s.z, r: s.r + 6, c: SHALLOW, seg: 36 });
    root.disc({ x: s.x, y: 0.06, z: s.z, r: s.r, c: SAND, seg: 36 });
  }
  // 浮島周圍一圈淺水
  root.slab({ x: WORLD_CX, y: 0.02, w: KEEPOUT.maxX - KEEPOUT.minX + 4, d: KEEPOUT.maxZ - KEEPOUT.minZ + 4, c: SHALLOW });

  // 火山島：沙灘、綠坡、火山口
  {
    const g = root.at(VOLCANO.x, 0, VOLCANO.z);
    g.disc({ y: 0.05, r: 38, c: SAND, seg: 40 });
    g.cone({ r: 30, h: VOLCANO_H, c: '#4D7A4B', seg: 24, sz: 0.75 });
    g.cone({ y: VOLCANO_H * 0.78, r: 7, h: VOLCANO_H * 0.26, c: '#6B5A4E', seg: 16, sz: 0.75 });
  }

  // 木棧道：從露台前方通到最近的沙洲
  {
    const len = PIER.z1 - PIER.z0;
    const g = root.at(PIER.x, 0, (PIER.z0 + PIER.z1) / 2);
    g.box({ y: 0.9, w: 2.6, h: 0.14, d: len, c: '#B08B5E' });
    for (let i = 0; i <= Math.floor(len / 3); i++) {
      for (const dx of [-1.2, 1.2]) g.cyl({ x: dx, z: -len / 2 + i * 3, r: 0.11, h: 1.35, c: '#8B6A47', seg: 6 });
    }
  }

  hut(root.at(SANDBARS[0].x + 3, 0.08, SANDBARS[0].z + 3));

  // 衝浪板插在沙裡
  const boards = [
    { dx: -5, dz: 1, c: '#F2994A' },
    { dx: -4, dz: 3, c: '#2F80ED' },
    { dx: -6.2, dz: 3.4, c: '#EB5757' },
  ];
  boards.forEach((b, i) => {
    root.at(SANDBARS[0].x + b.dx, 0.08, SANDBARS[0].z + b.dz, i * 0.7).ball({ y: 1.1, r: 1, c: b.c, sy: 1.15 });
  });

  return root;
}

export const island: SceneTheme = {
  id: 'island',
  label: '海島',
  emoji: '🏝️',
  palette: {
    ground: '#3BA9C9',
    floor: '#EBD9B4',
    floorGrid: '#DCC79C',
    wallBack: '#A8865E',
    wallSide: '#B69470',
    skirting: '#F7F1E6',
    base: '#D9C39A',
    terrace: '#E0D2B4',
  },
  props: PROPS,
  landmarks: buildLandmarks,
  fogScale: 1.7,
};
