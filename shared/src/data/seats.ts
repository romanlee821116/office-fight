import { resolvePosition, type Vec2 } from '../collision';
import { CAROUSEL, COASTER, PLAYGROUND, SEAT_INTERACT_DISTANCE, SEAT_STAND_OFFSET, SHIP } from '../constants';
import { coasterAtStation, coasterCarAt } from './coaster';
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

/**
 * 旋轉木馬的木馬位。六匹木馬共用同一個上車點（就像排隊上車），
 * findNearestSeat 會自動挑一個還沒人坐的；實際位置每刻由 rideSeatAt 算。
 */
function carouselSeats(): Seat[] {
  const bx = CAROUSEL.x + CAROUSEL.boardRadius;
  const bz = CAROUSEL.z;
  return Array.from({ length: CAROUSEL.seatCount }, (_, index) => ({
    id: `carousel:${index}`,
    furnitureId: 'carousel',
    x: bx,
    z: bz,
    // 上車時面向木馬中心（-X 方向）
    rotY: -Math.PI / 2,
    anim: 'sit' as AnimState,
    label: '騎旋轉木馬',
    standAt: { x: bx, z: bz },
    ride: { kind: 'carousel' as const, index },
  }));
}

/**
 * 雲霄飛車的座位：一列三節車廂，共用車站月台旁的同一個上車點。
 * 只有車停在站上時才上得去（由伺服端把關）。
 */
function coasterSeats(): Seat[] {
  const bx = COASTER.startX + 2;
  const bz = COASTER.startZ + 1.5;
  return Array.from({ length: COASTER.carCount }, (_, index) => ({
    id: `coaster:${index}`,
    furnitureId: 'coaster-station',
    x: bx,
    z: bz,
    // 面向月台旁的軌道（-Z）
    rotY: Math.PI,
    anim: 'sit' as AnimState,
    label: '搭雲霄飛車',
    standAt: { x: bx, z: bz },
    ride: { kind: 'coaster' as const, index },
  }));
}

/** 海盜船：一排座位共用船尾側的上下船點 */
function shipSeats(): Seat[] {
  const bx = SHIP.x + SHIP.boardOffsetX;
  const bz = SHIP.z + SHIP.boardOffsetZ;
  return Array.from({ length: SHIP.seatCount }, (_, index) => ({
    id: `ship:${index}`,
    furnitureId: 'pirate-ship',
    x: bx,
    z: bz,
    // 上船時面向船（-Z）
    rotY: Math.PI,
    anim: 'sit' as AnimState,
    label: '搭海盜船',
    standAt: { x: bx, z: bz },
    ride: { kind: 'ship' as const, index },
  }));
}

/** 一輪 = 六次擺盪 + 停靠 */
export function shipCycleSec(): number {
  return SHIP.swings * SHIP.swingSec + SHIP.dwellMs / 1000;
}

/**
 * 海盜船當下的擺角。
 * 幅度用一條 sin(πu) 的包絡線由小到大再收回，載波是 sin(2π·次數·u)，
 * 兩者在 u=0 與 u=1 都為零，所以最後一定剛好停在最低點，接得上停靠時間。
 */
export function shipAngle(now: number): number {
  const swingSec = SHIP.swings * SHIP.swingSec;
  const phase = (now / 1000) % shipCycleSec();
  if (phase >= swingSec) return 0; // 停靠中
  const u = phase / swingSec;
  return SHIP.maxAngle * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * SHIP.swings * u);
}

/** 船停在最低點、可以上下船 */
export function shipAtDock(now: number): boolean {
  return (now / 1000) % shipCycleSec() >= SHIP.swings * SHIP.swingSec;
}

/**
 * 會動的座位在某個時刻的位置、高度與朝向。時間基準是 Date.now()，
 * 跟牆上時鐘（beatNow）同一條軸，所以伺服端與每台前端算出來的角度一致，
 * 不需要為了同步多傳任何狀態。
 */
/**
 * 第 index 匹木馬在某時刻的角度。轉盤往正角度轉，馬頭才是朝著前進方向；
 * 前端的 Carousel 用同一個 carouselTurn() 轉模型，人與馬因此永遠對齊。
 */
export function carouselTurn(now: number): number {
  return (((now / 1000) % CAROUSEL.turnSec) / CAROUSEL.turnSec) * Math.PI * 2;
}

export function carouselSeatAngle(index: number, now: number): number {
  return CAROUSEL.seatAngle + (index / CAROUSEL.seatCount) * Math.PI * 2 + carouselTurn(now);
}

/** 船身當下的位置與姿態：船底中心點、長軸方向、以及擺盪的水平速度方向 */
export function shipHullAt(now: number): { bx: number; by: number; cos: number; sin: number; dirX: number } {
  const th = shipAngle(now);
  // 用前後各取一小段時間估擺盪方向，正負代表往 +X 或 -X 掃
  const dTh = shipAngle(now + 30) - shipAngle(now - 30);
  return {
    bx: SHIP.x + SHIP.arm * Math.sin(th),
    by: SHIP.pivotY - SHIP.arm * Math.cos(th),
    cos: Math.cos(th),
    sin: Math.sin(th),
    dirX: dTh >= 0 ? 1 : -1,
  };
}

/**
 * 站在 (x, z)、身高 height 的人有沒有被擺盪中的船身撞到。
 * 把船當成跟著擺臂轉的方盒：沿長軸 ±halfLen、離船底 0~hullHeight。
 */
export function shipHitsPoint(x: number, z: number, height: number, now: number): boolean {
  if (shipAtDock(now)) return false; // 停靠中不會撞人
  const halfLen = (8.8 * SHIP.scale) / 2;
  const halfWide = (4.8 * SHIP.scale) / 2;
  if (Math.abs(z - SHIP.z) > halfWide) return false; // 側向錯開就撞不到
  const h = shipHullAt(now);
  // 人的身體取腳踝與頭兩點，任一點落在船身盒內就算撞到
  for (const py of [0.2, height]) {
    const ox = x - h.bx;
    const oy = py - h.by;
    const along = ox * h.cos + oy * h.sin;
    const up = -ox * h.sin + oy * h.cos;
    if (Math.abs(along) <= halfLen && up >= 0 && up <= SHIP.hullHeight) return true;
  }
  return false;
}

/**
 * 現在能不能上下這個座位。旋轉木馬貼著地面隨時可以；
 * 雲霄飛車與海盜船都架在高處，只有停在站上／最低點時才安全。
 */
export function rideBoardable(seat: Seat, now: number): boolean {
  if (seat.ride?.kind === 'coaster') return coasterAtStation(now);
  if (seat.ride?.kind === 'ship') return shipAtDock(now);
  return true;
}

/** 會動的座位當下的姿態；pitch 為俯仰，正值為爬升 */
export interface RidePose {
  x: number;
  y: number;
  z: number;
  rotY: number;
  pitch: number;
}

export function rideSeatAt(seat: Seat, now: number): RidePose | null {
  if (seat.ride?.kind === 'carousel') {
    const a = carouselSeatAngle(seat.ride.index, now);
    return {
      x: CAROUSEL.x + Math.sin(a) * CAROUSEL.seatRadius,
      z: CAROUSEL.z + Math.cos(a) * CAROUSEL.seatRadius,
      y: CAROUSEL.seatY,
      // 角度遞增，前進方向（也就是馬頭朝的方向）是 a + 90°
      rotY: a + Math.PI / 2,
      pitch: 0,
    };
  }
  if (seat.ride?.kind === 'coaster') {
    const car = coasterCarAt(seat.ride.index, now);
    return { x: car.x, z: car.z, y: car.y + COASTER.riderY, rotY: car.yaw, pitch: car.pitch };
  }
  if (seat.ride?.kind === 'ship') {
    const th = shipAngle(now);
    // 座位在船身上的位置：沿船長軸（世界 X）排開，離支點 arm - seatY
    const dx = (seat.ride.index - (SHIP.seatCount - 1) / 2) * SHIP.seatGap + SHIP.seatOffsetX;
    const drop = SHIP.arm - SHIP.seatY;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    return {
      x: SHIP.x + dx * cos + drop * sin,
      z: SHIP.z,
      y: SHIP.pivotY + dx * sin - drop * cos,
      // 全船的人都朝 +X（船頭方向）
      rotY: Math.PI / 2,
      // 船身跟著擺臂轉，擺向 +X 時船頭抬起
      pitch: th,
    };
  }
  return null;
}

function seatAt(furnitureId: string, suffix: string, x: number, z: number, rotY: number, anim: AnimState = 'sit', label = '坐下'): Seat {
  return { id: suffix ? `${furnitureId}:${suffix}` : furnitureId, furnitureId, x, z, rotY, anim, label };
}

/**
 * 座位表：椅子（含會議椅、單人沙發）與小鎮長椅一個座位在中心；沙發兩個座位沿局部 X 分佈；
 * 健身器材各一個使用站（跑步機跑步、臥推椅臥推、瑜珈墊波比跳）。
 * 家具 rotY 的慣例即為使用時角色的朝向（例如辦公椅 rotY=π 面向 -Z 的桌子）。
 */
export const SEATS: Seat[] = FURNITURE.flatMap((f) => {
  const rotY = f.rotY ?? 0;
  // 會議椅就是牌桌的座位：標記 manual，讓一般的「走近按 E 坐下」跳過它們，
  // 入座改由撲克那條訊息處理（要先確認身分、從帳號金幣扣買入）
  if (f.type === 'chair') {
    const seat = seatAt(f.id, '', f.x, f.z, rotY);
    return [f.id.startsWith('mchair-') ? { ...seat, label: '入座牌桌', manual: true } : seat];
  }
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
  // 小鎮長椅：一人座在椅面中心，起身時站到椅子正前方（後方是椅背）
  if (f.type === 'xmas' && f.variant === 'bench') {
    const seat = seatAt(f.id, '', f.x, f.z, rotY);
    return [{ ...seat, standAt: { x: f.x + Math.sin(rotY) * 0.9, z: f.z + Math.cos(rotY) * 0.9 } }];
  }
  if (f.type === 'playground') return playgroundSeats(f);
  if (f.id === 'carousel') return carouselSeats();
  return [];
});

/**
 * 牌桌座位：就是會議室那六張椅子（mchair-0…5）。
 *
 * 索引順序刻意不照 id：mchair 是「上排由左到右、下排由左到右」排的，
 * 直接用會讓莊家鈕從上排右端跳到下排左端。這裡把下排反轉，讓座位沿著桌子
 * 繞一圈，莊家鈕與下注順序才會照著桌面的實際方向走。
 */
function pokerSeats(): Seat[] {
  const chairs = SEATS.filter((s) => s.furnitureId.startsWith('mchair-'));
  const top = chairs.filter((s) => s.z < -3.5).sort((a, b) => a.x - b.x);
  const bottom = chairs.filter((s) => s.z >= -3.5).sort((a, b) => b.x - a.x);
  return [...top, ...bottom];
}

/** 牌桌座位依繞桌順序排好，撲克那邊靠索引對應座位 */
export const POKER_SEATS: Seat[] = pokerSeats();

const POKER_SEAT_IDS = new Set(POKER_SEATS.map((s) => s.id));

/**
 * 這個座位 id 是不是牌桌的位子。
 *
 * 不要改用 id 前綴判斷：牌桌座位就是會議椅（mchair-…），而椅子的命名是家具表的事，
 * 哪天牌桌換張桌子前綴就變了。認這份清單才不會漏。
 */
export function isPokerSeat(seatId: string): boolean {
  return POKER_SEAT_IDS.has(seatId);
}

// 雲霄飛車與海盜船的座位不對應任何碰撞家具（都架在頭頂上），直接補進座位表
SEATS.push(...coasterSeats(), ...shipSeats());

export const SEAT_BY_ID = new Map(SEATS.map((s) => [s.id, s]));

/**
 * 辦公桌前的座位（furniture.ts 的 chair-0…chair-7，面向自己那張桌上的電腦）。
 * 丁oe 把遠端工作者抓回辦公室時，就是從這一排挑一個空位塞進去。
 */
export const OFFICE_DESK_SEATS = SEATS.filter((s) => s.furnitureId.startsWith('chair-'));


export function seatDistance(seat: Seat, x: number, z: number): number {
  return Math.hypot(seat.x - x, seat.z - z);
}

/** 找出最近且未被佔用的座位 */
export function findNearestSeat(x: number, z: number, occupied: ReadonlySet<string>, maxDistance = SEAT_INTERACT_DISTANCE): Seat | null {
  let best: Seat | null = null;
  let bestDist = maxDistance;
  for (const seat of SEATS) {
    if (seat.manual || occupied.has(seat.id)) continue;
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
