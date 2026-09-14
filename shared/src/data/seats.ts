import { resolvePosition, type Vec2 } from '../collision';
import { SEAT_INTERACT_DISTANCE, SEAT_STAND_OFFSET } from '../constants';
import type { AnimState, Seat } from '../types';
import { FURNITURE } from './furniture';

/** 沙發左右各一個座位的局部 X 偏移 */
const SOFA_SEAT_OFFSETS = [-0.5, 0.5];

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
  // Smith 訓練架：站到橫桿下深蹲（面向機器，起身點在身後開放區）
  if (f.id === 'smith-machine') return [seatAt(f.id, '', f.x - 0.55, f.z - 0.1, 0, 'squat', '深蹲')];
  if (f.id === 'squat-rack') return [seatAt(f.id, '', f.x, f.z - 0.15, Math.PI, 'squat', '深蹲')];
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
