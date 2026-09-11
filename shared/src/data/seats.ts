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

/** 起身後的站立點：座位後方，並推出碰撞盒 */
export function standPointForSeat(seat: Seat): Vec2 {
  return resolvePosition(seat.x - Math.sin(seat.rotY) * SEAT_STAND_OFFSET, seat.z - Math.cos(seat.rotY) * SEAT_STAND_OFFSET);
}
