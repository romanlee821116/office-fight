import { resolvePosition, type Vec2 } from '../collision';
import { PLAYGROUND, SEAT_INTERACT_DISTANCE, SEAT_STAND_OFFSET } from '../constants';
import type { AnimState, FurnitureDef, Seat } from '../types';
import { FURNITURE } from './furniture';

/** 沙發左右各一個座位的局部 X 偏移 */
const SOFA_SEAT_OFFSETS = [-0.5, 0.5];

/**
 * 把設施的局部座標（模型轉正後、以底部中心為原點）換算到世界座標。
 * 與 three.js 的 rotation.y 同慣例：局部 +Z 會指向世界 (sin rotY, cos rotY)。
 */
function toWorld(f: FurnitureDef, dx: number, dz: number): Vec2 {
  const a = f.rotY ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: f.x + dx * c + dz * s, z: f.z - dx * s + dz * c };
}

/**
 * 遊戲區設施的座位：位置與朝向都從家具表的中心／rotY 推導，
 * 局部偏移取自 PLAYGROUND（playground.glb 轉正縮放後量到的實際尺寸）。
 */
function playgroundSeats(f: FurnitureDef): Seat[] {
  const a = f.rotY ?? 0;
  if (f.id.startsWith('slide-')) {
    const { ladderZ, exitZ, rideMs } = PLAYGROUND.slide;
    const at = toWorld(f, 0, ladderZ);
    // 朝向滑道下滑的方向（局部 +Z），一路爬梯 → 走到滑道口 → 滑下去都沿著這個方向
    return [
      {
        id: f.id,
        furnitureId: f.id,
        x: at.x,
        z: at.z,
        rotY: a,
        anim: 'slide',
        label: '溜滑梯',
        standAt: toWorld(f, 0, exitZ),
        rideMs,
      },
    ];
  }
  if (f.id === 'swing-set') {
    // 座椅面向局部 +Z，往 ±Z 擺盪；起身點退到架子前方（往 -Z 的空地）
    return PLAYGROUND.swing.seatX.map((dx, i) => ({
      id: `${f.id}:${i}`,
      furnitureId: f.id,
      x: toWorld(f, dx, 0).x,
      z: toWorld(f, dx, 0).z,
      rotY: a,
      anim: 'swing-ride' as const,
      label: '盪鞦韆',
      standAt: toWorld(f, dx, -1.1),
    }));
  }
  if (f.id === 'seesaw') {
    // 兩人面對面坐在板子兩端（局部 ±X），起身時往同一側（局部 +Z）讓開
    return PLAYGROUND.seesaw.seatX.map((dx, i) => ({
      id: `${f.id}:${i}`,
      furnitureId: f.id,
      x: toWorld(f, dx, 0).x,
      z: toWorld(f, dx, 0).z,
      rotY: dx < 0 ? a + Math.PI / 2 : a - Math.PI / 2,
      anim: i === 0 ? ('seesaw-a' as AnimState) : ('seesaw-b' as AnimState),
      label: '玩蹺蹺板',
      standAt: toWorld(f, dx, 1.05),
    }));
  }
  return [];
}

function seatAt(furnitureId: string, suffix: string, x: number, z: number, rotY: number, anim: AnimState = 'sit', label = '坐下'): Seat {
  return { id: suffix ? `${furnitureId}:${suffix}` : furnitureId, furnitureId, x, z, rotY, anim, label };
}

/**
 * 座位表：椅子（含會議椅、單人沙發）一個座位在中心；沙發兩個座位沿局部 X 分佈；
 * 健身器材各一個使用站（跑步機跑步、臥推椅臥推、瑜珈墊波比跳）。
 * 家具 rotY 的慣例即為使用時角色的朝向（例如辦公椅 rotY=π 面向 -Z 的桌子）。
 */
export const SEATS: Seat[] = FURNITURE.flatMap((f) => {
  const rotY = f.rotY ?? 0;
  if (f.type === 'chair') return [seatAt(f.id, '', f.x, f.z, rotY)];
  if (f.type === 'sofa') {
    return SOFA_SEAT_OFFSETS.map((dx, i) => seatAt(f.id, String(i), f.x + dx * Math.cos(rotY), f.z - dx * Math.sin(rotY), rotY));
  }
  if (f.type === 'treadmill') return [seatAt(f.id, '', f.x, f.z, rotY, 'run', '跑步')];
  if (f.type === 'bench') return [seatAt(f.id, '', f.x, f.z, rotY, 'benchpress', '臥推')];
  if (f.type === 'gymmat') return [seatAt(f.id, '', f.x, f.z, rotY, 'dance-squat', '波比跳')];
  // Smith 綜合架：躺上斜板臥推（座位在椅墊中心，rotY=π/2 讓頭朝世界 +X 的椅背端）
  if (f.id === 'smith-machine') return [seatAt(f.id, '', f.x - 0.4, f.z, Math.PI / 2, 'benchpress-incline', '臥推')];
  // 深蹲架：站到橫桿下深蹲
  if (f.id === 'squat-rack') return [seatAt(f.id, '', f.x, f.z - 0.15, Math.PI, 'squat', '深蹲')];
  if (f.type === 'playground') return playgroundSeats(f);
  return [];
});

export const SEAT_BY_ID = new Map(SEATS.map((s) => [s.id, s]));

export function seatDistance(seat: Seat, x: number, z: number): number {
  return Math.hypot(seat.x - x, seat.z - z);
}

/** 找出最近且未被佔用的座位 */
export function findNearestSeat(x: number, z: number, occupied: ReadonlySet<string>, maxDistance = SEAT_INTERACT_DISTANCE): Seat | null {
  let best: Seat | null = null;
  let bestDist = maxDistance;
  for (const seat of SEATS) {
    if (occupied.has(seat.id)) continue;
    const d = seatDistance(seat, x, z);
    if (d < bestDist) {
      best = seat;
      bestDist = d;
    }
  }
  return best;
}

/**
 * 起身後的站立點：優先站到座位後方；若該處落在家具或牆內（例如貼牆的深蹲架），
 * 依序改試前方與左右、再加大距離，取第一個不會被推開的點。
 */
/** 該點四周 0.2m 內都不會被推開（避免起身後卡在碰撞盒邊緣） */
function isClear(x: number, z: number): boolean {
  for (const [dx, dz] of [
    [0.2, 0],
    [-0.2, 0],
    [0, 0.2],
    [0, -0.2],
  ]) {
    const p = resolvePosition(x + dx, z + dz);
    if (Math.hypot(p.x - (x + dx), p.z - (z + dz)) > 1e-6) return false;
  }
  return true;
}

export function standPointForSeat(seat: Seat): Vec2 {
  // 遊樂設施指定了起身點（滑道盡頭、蹺蹺板側邊），直接用它解算碰撞
  if (seat.standAt) return resolvePosition(seat.standAt.x, seat.standAt.z);
  const fx = Math.sin(seat.rotY);
  const fz = Math.cos(seat.rotY);
  const dirs: Vec2[] = [
    { x: -fx, z: -fz },
    { x: fx, z: fz },
    { x: -fz, z: fx },
    { x: fz, z: -fx },
  ];
  // 方向優先：先把後方各距離試完，再換前方與左右，讓起身點盡量留在座位正後方
  for (const d of dirs) {
    for (const dist of [SEAT_STAND_OFFSET, SEAT_STAND_OFFSET * 2, SEAT_STAND_OFFSET * 3]) {
      const raw = { x: seat.x + d.x * dist, z: seat.z + d.z * dist };
      const p = resolvePosition(raw.x, raw.z);
      // 留一點餘裕，避免剛好貼在碰撞盒邊界上
      if (Math.hypot(p.x - raw.x, p.z - raw.z) < 1e-6 && isClear(p.x, p.z)) return p;
    }
  }
  return resolvePosition(seat.x, seat.z);
}
