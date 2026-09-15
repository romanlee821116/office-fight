import { FIELD, GROUND_Y, MID, NEAR, PropBuilder, WORLD_CX, facingSpot, gridCells, inViewCorridor, landmarkHeight, pick, range, rng } from './layout';
import { PartBuilder } from './parts';
import type { SceneTheme } from './types';

/** 街廓格距（公尺），每三格留一條街 */
const CELL = 12;
/** city kit 原始尺寸極小（摩天樓 4.5 單位高），×9 後約 40m */
const S_TOWER = 9;
const S_LOW = 13;
const S_CAR = 1.6;

const TOWERS = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
const MIDS = ['building-a', 'building-e', 'building-h'];
const LOWS = ['low-detail-building-a', 'low-detail-building-c', 'low-detail-building-f', 'low-detail-building-j', 'low-detail-building-wide-a'];
/** 中層建物原始高度（量測值），水塔要放在屋頂上 */
const MID_HEIGHT: Record<string, number> = { 'building-a': 1.29, 'building-e': 0.89, 'building-h': 1.29 };

/**
 * 自由女神放在後方街廓外 40m：相機預設 yaw 朝 −X−Z，主地標擺這裡切換主題就直接入鏡。
 * 這個距離下總高 16m 的角高度約 9.5°，抬起鏡頭剛好看得見全身。
 */
const LIBERTY = facingSpot(55);
const LIBERTY_H = landmarkHeight(55, 9.5);
const VERDIGRIS = '#7FB3A2';

function isStreet(i: number): boolean {
  return i % 3 === 2;
}

function build() {
  const rand = rng(20260914);
  const pb = new PropBuilder();
  const roofs: { x: number; z: number; y: number }[] = [];
  const streetXs = new Set<number>();
  const streetZs = new Set<number>();

  // 街道要對齊，所以不加隨機偏移
  for (const c of gridCells(CELL, 0, rand)) {
    const ix = Math.round((c.x - FIELD.minX - CELL / 2) / CELL);
    const iz = Math.round((c.z - FIELD.minZ - CELL / 2) / CELL);
    const streetX = isStreet(ix);
    const streetZ = isStreet(iz);
    if (streetX) streetXs.add(c.x);
    if (streetZ) streetZs.add(c.z);
    if (Math.hypot(c.x - LIBERTY.x, c.z - LIBERTY.z) < 22) continue;

    if (c.dist >= MID) {
      if (streetX || streetZ) continue;
      // 望向自由女神的走廊不放高樓，否則地標整個被遮住
      if (inViewCorridor(c.x, c.z, 15)) continue;
      const rotY = (Math.floor(rand() * 4) * Math.PI) / 2;
      const roll = rand();
      if (c.dist < 52 ? roll < 0.55 : roll < 0.45) {
        pb.add(`nyc/city/${pick(rand, TOWERS)}`, { x: c.x, z: c.z, rotY, scale: S_TOWER });
      } else if (c.dist < 52 ? roll < 1 : roll < 0.6) {
        const m = pick(rand, MIDS);
        pb.add(`nyc/city/${m}`, { x: c.x, z: c.z, rotY, scale: S_TOWER });
        roofs.push({ x: c.x, z: c.z, y: MID_HEIGHT[m] * S_TOWER });
      } else {
        pb.add(`nyc/city/${pick(rand, LOWS)}`, { x: c.x, z: c.z, rotY, scale: S_LOW });
      }
      continue;
    }

    if (streetX || streetZ) {
      // 近處街道：車輛沿街向，偏到其中一側車道
      if (rand() > 0.55) continue;
      const alongX = streetZ && !streetX;
      const side = rand() < 0.5 ? -2.4 : 2.4;
      const car = rand() < 0.5 ? 'taxi' : rand() < 0.65 ? 'van' : 'police';
      pb.add(`nyc/car/${car}`, {
        x: alongX ? c.x + range(rand, -3, 3) : c.x + side,
        z: alongX ? c.z + side : c.z + range(rand, -3, 3),
        rotY: alongX ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : side < 0 ? Math.PI : 0,
        scale: S_CAR,
      });
      continue;
    }

    // 近處街廓：行道樹、路燈、長椅、護欄（都不高，不會擋鏡頭）
    if (c.dist >= NEAR && rand() < 0.75) {
      pb.add('nyc/urban/tree-park-large', { x: c.x, z: c.z, rotY: range(rand, 0, Math.PI * 2), scale: 5 });
    }
    if (rand() < 0.6) {
      pb.add('nyc/urban/detail-light-double', { x: c.x + 4.5, z: c.z - 4.5, rotY: (Math.floor(rand() * 4) * Math.PI) / 2, scale: 6 });
    }
    if (rand() < 0.45) {
      pb.add('nyc/urban/detail-bench', { x: c.x - 3.5, z: c.z + 3.5, rotY: (Math.floor(rand() * 4) * Math.PI) / 2, scale: 2.5 });
    }
    if (c.dist < NEAR && rand() < 0.5) {
      pb.add('nyc/urban/detail-barrier-type-a', { x: c.x + range(rand, -4, 4), z: c.z + 5, rotY: rand() < 0.5 ? 0 : Math.PI / 2, scale: 2.5 });
    }
  }

  return { props: pb.build(), roofs: roofs.slice(0, 8), streetXs: [...streetXs], streetZs: [...streetZs] };
}

const L = build();

/** 水塔：四腳、木桶、錐頂 */
function waterTower(b: PartBuilder): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl({ x: sx * 1.1, z: sz * 1.1, r: 0.09, h: 1.6, c: '#3C3A38', seg: 6 });
  b.cyl({ y: 1.6, r: 1.35, rb: 1.25, h: 2.2, c: '#7A5A45', seg: 12 });
  b.pyr({ y: 3.8, side: 3.2, h: 1.1, c: '#4E4A47' });
}

function buildLandmarks(): PartBuilder {
  const root = new PartBuilder().at(0, GROUND_Y, 0);
  const spanZ = FIELD.maxZ - FIELD.minZ;
  const spanX = FIELD.maxX - FIELD.minX;

  // 街道：柏油面與黃色中線
  for (const x of L.streetXs) {
    root.slab({ x, y: 0.004, w: 9, d: spanZ, c: '#3E4247' });
    root.slab({ x, y: 0.012, w: 0.3, d: spanZ, c: '#D8A93A' });
  }
  for (const z of L.streetZs) {
    root.slab({ x: WORLD_CX, y: 0.006, z, w: spanX, d: 9, c: '#3E4247' });
    root.slab({ x: WORLD_CX, y: 0.014, z, w: spanX, d: 0.3, c: '#D8A93A' });
  }

  for (const r of L.roofs) waterTower(root.at(r.x, r.y, r.z));

  // 自由女神：星形基座、方碑座、長袍、頭冠、舉火炬（比例依 LIBERTY_H 縮放）
  {
    const k = LIBERTY_H / 16;
    // 正面朝相機（預設 yaw 45°）站，不然看到的是側身
    const g = root.at(LIBERTY.x, 0, LIBERTY.z, Math.PI / 4);
    g.box({ w: 11 * k, h: 1.9 * k, d: 11 * k, c: '#A9A08E' });
    g.box({ y: 1.9 * k, w: 7 * k, h: 5.4 * k, d: 7 * k, c: '#C3B59E' });
    g.box({ y: 7.3 * k, w: 5 * k, h: 0.6 * k, d: 5 * k, c: '#A9A08E' });
    g.cyl({ y: 7.9 * k, r: 1.35 * k, rb: 1.95 * k, h: 6.2 * k, c: VERDIGRIS, seg: 14 });
    g.ball({ y: 14.7 * k, r: 0.78 * k, c: VERDIGRIS });
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.5 + (i / 6) * Math.PI;
      g.at(Math.cos(a) * 0.72 * k, 15.1 * k, Math.sin(a) * 0.72 * k, -a).cyl({ r: 0.02 * k, rb: 0.13 * k, h: 1.0 * k, c: VERDIGRIS, seg: 5 });
    }
    g.cyl({ x: 1.0 * k, y: 12.6 * k, r: 0.26 * k, rb: 0.35 * k, h: 3.6 * k, c: VERDIGRIS, seg: 8 });
    g.cyl({ x: 1.75 * k, y: 16.3 * k, r: 0.32 * k, rb: 0.2 * k, h: 0.75 * k, c: '#B08D4A', seg: 8 });
    g.ball({ x: 1.75 * k, y: 17.4 * k, r: 0.5 * k, c: '#FFC94D', glow: 0.9 });
    g.box({ x: -1.2 * k, y: 10.2 * k, z: 0.25 * k, w: 0.75 * k, h: 1.85 * k, d: 0.4 * k, c: VERDIGRIS, rotY: 0.3 });
  }

  return root;
}

export const nyc: SceneTheme = {
  id: 'nyc',
  label: '紐約',
  emoji: '🗽',
  palette: {
    ground: '#8E9196',
    floor: '#8C8782',
    floorGrid: '#7C7771',
    wallBack: '#9C5A4A',
    wallSide: '#A8665A',
    skirting: '#EDE6DC',
    base: '#6B6F75',
    terrace: '#9A9DA2',
  },
  props: L.props,
  landmarks: buildLandmarks,
  fogScale: 1.7,
};
