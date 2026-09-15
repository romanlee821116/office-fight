import { GROUND_Y, KEEPOUT, MID, NEAR, PropBuilder, WORLD_CX, facingSpot, gridCells, landmarkHeight, range, ringPoints, rng } from './layout';
import { PartBuilder } from './parts';
import type { SceneTheme } from './types';

/** nature kit 的藍灰石頭換成砂岩、草換成乾草 */
const NATURE = { stone: '#D8BC88', stoneDark: '#B9975F', dirt: '#B8925C', grass: '#8FA466', leafsGreen: '#5E9A5B', woodBark: '#8A6A45' };
const SANDSTONE = '#D4B27A';
const SANDSTONE_DARK = '#C4A067';

/**
 * 三座金字塔擺在辦公室正前方的沙漠上，越遠的越高——高度都取自 landmarkHeight，
 * 角高度控制在 9～10°，抬起鏡頭時三座依序退開，頂端不會被畫面切掉。
 */
/** 三座金字塔沿相機望出去的方向錯開，越遠的越高，抬起鏡頭時依序退進天際線 */
const PYRAMIDS = [
  { ...facingSpot(52, -26), h: landmarkHeight(52, 10.5) },
  { ...facingSpot(74, 6), h: landmarkHeight(74, 11) },
  { ...facingSpot(58, 34), h: landmarkHeight(58, 9.5) },
].map((p) => ({ ...p, side: p.h * 1.55 }));
/**
 * 人面獅身改用攝影測量掃描模型（水晶宮公園的獅身像，200 萬面減到 12k、貼圖 8192 縮到 1024）。
 * 原始 OBJ 是 Z-up 卻被當成 Y-up 匯入而躺倒，已在 Blender 轉正；直立後長 18.54（頭在 +X）
 * × 高 8.12，×1.5 約 28m 長、12m 高，角高度 6.3°，低於金字塔所以不會擋住它們。
 * rotY 0 讓長軸與視線夾 45°，是能同時看到頭與身體的四分之三視角；
 * 掃描貼圖偏暗，用沙色 tint 拉亮才不會在低多邊形沙漠裡顯得突兀。
 */
const SPHINX = facingSpot(45);
const SPHINX_SCALE = 1.5;
const SPHINX_LEN = 18.54 * SPHINX_SCALE;
const TEMPLE = { x: KEEPOUT.maxX + 22, z: 2 };
const OASIS = { x: KEEPOUT.minX - 24, z: 10, r: 7 };

function build() {
  const rand = rng(2580);
  const pb = new PropBuilder();

  // 神殿柱廊：兩排各六根
  for (let i = 0; i < 6; i++) {
    for (const dz of [-3.5, 3.5]) {
      const m = rand() < 0.8 ? 'statue_column' : 'statue_columnDamaged';
      pb.add(`egypt/nature/${m}`, { x: TEMPLE.x - 10 + i * 4, z: TEMPLE.z + dz, scale: 5 }, { recolor: NATURE });
    }
  }
  // 前方兩座方尖碑夾著通道
  for (const lat of [-9, 9]) {
    const p = facingSpot(22, lat);
    pb.add('egypt/nature/statue_obelisk', { x: p.x, z: p.z, scale: 9 }, { recolor: NATURE });
  }
  pb.add('egypt/landmark/sphinx', { x: SPHINX.x, z: SPHINX.z, rotY: 0, scale: SPHINX_SCALE }, { tint: '#E3CDA0' });
  // 綠洲的棕櫚
  for (let i = 0; i < 9; i++) {
    const a = range(rand, 0, Math.PI * 2);
    const d = range(rand, OASIS.r + 1, OASIS.r + 5);
    pb.add(`egypt/nature/${rand() < 0.6 ? 'tree_palmTall' : 'tree_palmShort'}`, { x: OASIS.x + Math.cos(a) * d, z: OASIS.z + Math.sin(a) * d, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 4.5, 6) }, { recolor: NATURE });
  }

  for (const c of gridCells(11, 6, rand)) {
    if (PYRAMIDS.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.side * 0.75)) continue;
    if (Math.hypot(SPHINX.x - c.x, SPHINX.z - c.z) < SPHINX_LEN * 0.6) continue;
    if (Math.abs(c.x - TEMPLE.x) < 16 && Math.abs(c.z - TEMPLE.z) < 9) continue;
    if (Math.hypot(OASIS.x - c.x, OASIS.z - c.z) < OASIS.r + 7) continue;
    const roll = rand();
    const rotY = range(rand, 0, Math.PI * 2);

    if (c.dist >= MID) {
      if (roll < 0.18) pb.add(`egypt/nature/${rand() < 0.5 ? 'rock_largeB' : 'stone_tallC'}`, { x: c.x, z: c.z, rotY, scale: range(rand, 5, 9) }, { recolor: NATURE });
      else if (roll < 0.3) pb.add('egypt/nature/statue_block', { x: c.x, z: c.z, rotY: (Math.floor(rand() * 4) * Math.PI) / 2, scale: range(rand, 4, 7) }, { recolor: NATURE });
      else if (roll < 0.45) pb.add(`egypt/nature/${rand() < 0.5 ? 'cactus_tall' : 'cactus_short'}`, { x: c.x, z: c.z, rotY, scale: range(rand, 4, 6) }, { recolor: NATURE });
      continue;
    }
    if (c.dist >= NEAR) {
      if (roll < 0.25) pb.add(`egypt/nature/${rand() < 0.5 ? 'cactus_tall' : 'cactus_short'}`, { x: c.x, z: c.z, rotY, scale: range(rand, 4, 6) }, { recolor: NATURE });
      else if (roll < 0.4) pb.add('egypt/nature/rock_largeB', { x: c.x, z: c.z, rotY, scale: range(rand, 3.5, 5) }, { recolor: NATURE });
      else if (roll < 0.5) pb.add('egypt/nature/statue_block', { x: c.x, z: c.z, rotY: (Math.floor(rand() * 4) * Math.PI) / 2, scale: 3 }, { recolor: NATURE });
      continue;
    }
    if (roll < 0.3) pb.add(`egypt/nature/${rand() < 0.5 ? 'rock_smallE' : 'cactus_short'}`, { x: c.x, z: c.z, rotY, scale: range(rand, 2.5, 4) }, { recolor: NATURE });
  }
  for (const p of ringPoints(24, 1, NEAR, rand, 3)) {
    pb.add('egypt/nature/rock_smallE', { x: p.x, z: p.z, rotY: range(rand, 0, Math.PI * 2), scale: range(rand, 1.8, 3) }, { recolor: NATURE });
  }

  return pb.build();
}

const PROPS = build();

function buildLandmarks(): PartBuilder {
  const root = new PartBuilder().at(0, GROUND_Y, 0);

  // 獅身像的沙台
  root.disc({ x: SPHINX.x, y: 0.03, z: SPHINX.z, r: SPHINX_LEN * 0.62, c: '#CFB27E', seg: 28 });

  PYRAMIDS.forEach((p, i) => {
    root.pyr({ x: p.x, z: p.z, side: p.side, h: p.h, c: i === 1 ? SANDSTONE_DARK : SANDSTONE });
    root.disc({ x: p.x, y: 0.02, z: p.z, r: p.side * 0.8, c: '#CFB27E', seg: 24 });
  });

  // 神殿橫樑與台基
  root.box({ x: TEMPLE.x, z: TEMPLE.z, w: 26, h: 0.6, d: 12, c: SANDSTONE_DARK });
  for (const dz of [-3.5, 3.5]) root.box({ x: TEMPLE.x, y: 5.4, z: TEMPLE.z + dz, w: 24, h: 1.1, d: 1.6, c: SANDSTONE });
  root.box({ x: TEMPLE.x + 13.5, y: 0.6, z: TEMPLE.z, w: 3, h: 9, d: 9, c: SANDSTONE });

  // 綠洲水池
  root.disc({ x: OASIS.x, y: 0.03, z: OASIS.z, r: OASIS.r + 2, c: '#A9B27A' });
  root.disc({ x: OASIS.x, y: 0.05, z: OASIS.z, r: OASIS.r, c: '#4FA3B8' });

  // 遠處沙丘
  for (const d of [
    { x: WORLD_CX - 90, z: -20, r: 26 },
    { x: WORLD_CX - 70, z: 40, r: 20 },
    { x: WORLD_CX + 88, z: -30, r: 24 },
    { x: WORLD_CX + 80, z: 44, r: 18 },
    { x: WORLD_CX + 30, z: 78, r: 22 },
    { x: WORLD_CX - 30, z: 80, r: 18 },
  ]) {
    root.ball({ x: d.x, z: d.z, r: d.r, sy: 0.16, c: '#E2C48E' });
  }

  return root;
}

export const egypt: SceneTheme = {
  id: 'egypt',
  label: '埃及',
  emoji: '🏜️',
  palette: {
    ground: '#DCC08A',
    floor: '#E4CFA3',
    floorGrid: '#D3BC8E',
    wallBack: '#B4623F',
    wallSide: '#C07350',
    skirting: '#F1E4C8',
    base: '#C9AD7B',
    terrace: '#D8C39A',
  },
  props: PROPS,
  landmarks: buildLandmarks,
  fogScale: 1.7,
};
