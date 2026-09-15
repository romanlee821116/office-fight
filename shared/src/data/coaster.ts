import { COASTER } from '../constants';

/**
 * 雲霄飛車軌道。
 *
 * 一條軌道就是一串零件；下面的 walker 走過這串零件，同時吐出兩樣東西：
 * 模型要擺在哪（TRACK_PIECES）與車廂要沿著哪條線跑（TRACK_PATH）。
 * 兩者出自同一次行走，所以視覺與路徑不可能對不上。
 *
 * 零件的局部慣例（量自 Kenney coaster kit，1 unit = 1m）：
 * 入口在局部原點、前進方向是局部 +Z，軌面在 y = -0.7；
 * 彎道從原點轉到 (-r, r)，也就是往局部 -X 轉 90°。
 */

/** 軌面在零件局部的高度：所有零件的入口都是這個值 */
const RAIL_Y = -0.7;

interface StraightSpec {
  kind: 'straight';
  model: string;
  /** 沿前進方向的長度 */
  len: number;
  /** 正向行駛時的高度變化 */
  rise: number;
}

interface CornerSpec {
  kind: 'corner';
  model: string;
  radius: number;
  rise: number;
}

type PieceSpec = StraightSpec | CornerSpec;

/**
 * 以下每個零件的入口／出口軌面高度都是直接量 GLB 頂點得到的，不是從檔名猜的。
 * 套件裡的 straight-bend 系列雖然能升 3.7m，但它兩端的切線是陡的，
 * 直接接上平的彎道會硬折 43°，看起來就像軌道斷掉——要用得搭配
 * hill-beginning / hill-end 過渡件，所以這裡先不用。
 */
const STRAIGHT: StraightSpec = { kind: 'straight', model: 'coaster-steel-straight', len: 4, rise: 0 };
/** 4m 升 1m，兩端切線接近水平（實測剖面與 smoothstep 幾乎重合） */
const HILL: StraightSpec = { kind: 'straight', model: 'coaster-steel-straight-hill-complete', len: 4, rise: 1 };
const CORNER: CornerSpec = { kind: 'corner', model: 'coaster-steel-corner-small', radius: 2, rise: 0 };
/** 轉 90° 的同時升 1m */
const CORNER_UP: CornerSpec = { kind: 'corner', model: 'coaster-steel-corner-small-ramp', radius: 2, rise: 1 };

interface Step {
  spec: PieceSpec;
  /**
   * 反向擺放：模型轉 180° 擺在出口那端，車子從高的一頭滑下來。
   * 套件沒有專門的下坡零件，下坡就是把上坡零件倒過來用。
   */
  reverse?: boolean;
}

const up = (spec: PieceSpec): Step => ({ spec });
const down = (spec: PieceSpec): Step => ({ spec, reverse: true });

/**
 * 一圈的零件順序：長邊 3 節、短邊 1 節的矩形環道，四個彎都朝同一邊轉，
 * 繞完剛好 360° 回到原點。四個彎半徑相同時，閉合條件就是「對邊等長」。
 * 同向轉也省下鏡射零件（鏡射會翻面法線，燈光會壞掉）。
 *
 * 高度：車站平段 → 一路爬到 +4m → 長邊俯衝回來 → 平段收尾，淨變化 0。
 * 坡度最陡是爬升彎的 17.6°，相鄰零件的切線落差都在 18° 以內，接縫不會硬折。
 */
const TRACK: Step[] = [
  // A 邊（車站那一側，3 節）：月台平段，接著開始爬
  up(STRAIGHT), // 月台
  up(STRAIGHT),
  up(HILL),
  up(CORNER_UP),
  // B 邊（1 節）：續爬到最高點
  up(HILL),
  up(CORNER_UP),
  // C 邊（3 節）：一路俯衝下來
  down(HILL),
  down(HILL),
  down(HILL),
  up(CORNER),
  // D 邊（1 節）：降回月台高度後平順接回去
  down(HILL),
  up(CORNER),
];

export interface CoasterPiece {
  /** 模型檔名（相對 park/coaster/） */
  model: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface CoasterSample {
  x: number;
  y: number;
  z: number;
  /** 前進方向的水平角，與玩家 rotY 同慣例：面向 (sin, cos) */
  yaw: number;
  /** 俯仰角，正值為爬升 */
  pitch: number;
  /** 從起點累積的水平＋垂直距離 */
  dist: number;
  /** 走到這裡所需的時間（秒），由速度模型積出來 */
  time: number;
}

/** 局部座標轉世界：與 three 的 rotation.y 同慣例，局部 +Z 指向 (sin h, cos h) */
function toWorld(x: number, z: number, h: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(h);
  const s = Math.sin(h);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

/**
 * 坡道的高度曲線。實測 hill-complete 的軌面剖面（0 / .022 / .104 / .329 / … / .971 / 1）
 * 與 smoothstep 幾乎重合，所以直接用它。
 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** ease 的導數：兩端為 0，代表坡道頭尾是水平的，接縫才不會硬折 */
function easeSlope(t: number): number {
  return 6 * t * (1 - t);
}

/** 每節零件取幾個取樣點（彎道多取一些才圓） */
const STRAIGHT_STEPS = 8;
const CORNER_STEPS = 12;

function buildTrack(): { pieces: CoasterPiece[]; path: CoasterSample[] } {
  const pieces: CoasterPiece[] = [];
  const path: CoasterSample[] = [];
  let x = COASTER.startX;
  let z = COASTER.startZ;
  let y = COASTER.baseY;
  let h = COASTER.startYaw;
  let dist = 0;

  const push = (px: number, py: number, pz: number, yaw: number, pitch: number) => {
    const prev = path[path.length - 1];
    if (prev) dist += Math.hypot(px - prev.x, py - prev.y, pz - prev.z);
    path.push({ x: px, y: py, z: pz, yaw, pitch, dist, time: 0 });
  };

  for (const { spec, reverse } of TRACK) {
    const rise = reverse ? -spec.rise : spec.rise;

    if (spec.kind === 'straight') {
      // 正向：模型擺在入口；反向：轉 180° 擺在出口，並讓局部的高端對到入口
      const exit = toWorld(x, z, h, 0, spec.len);
      if (reverse) pieces.push({ model: spec.model, x: exit.x, y: y - (RAIL_Y + spec.rise), z: exit.z, rotY: h + Math.PI });
      else pieces.push({ model: spec.model, x, y: y - RAIL_Y, z, rotY: h });

      for (let i = 0; i <= STRAIGHT_STEPS; i++) {
        const t = i / STRAIGHT_STEPS;
        const at = toWorld(x, z, h, 0, spec.len * t);
        // 俯仰取自高度曲線的斜率，車子的姿態才會跟軌面一致
        push(at.x, y + rise * ease(t), at.z, h, Math.atan2(rise * easeSlope(t), spec.len));
      }
      x = exit.x;
      z = exit.z;
      y += rise;
      continue;
    }

    // 彎道：入口在原點朝 +Z，出口在 (-r, r) 朝 -X，也就是航向減 90°
    const r = spec.radius;
    pieces.push({ model: spec.model, x, y: y - RAIL_Y, z, rotY: h });
    const arc = (Math.PI / 2) * r;
    for (let i = 0; i <= CORNER_STEPS; i++) {
      const t = i / CORNER_STEPS;
      const a = (Math.PI / 2) * t;
      const at = toWorld(x, z, h, -r + r * Math.cos(a), r * Math.sin(a));
      push(at.x, y + rise * ease(t), at.z, h - a, Math.atan2(rise * easeSlope(t), arc));
    }
    const exit = toWorld(x, z, h, -r, r);
    x = exit.x;
    z = exit.z;
    y += rise;
    h -= Math.PI / 2;
  }

  return { pieces, path };
}

const built = buildTrack();

/** 軌道零件的擺放；前端照這份把模型擺出來 */
export const TRACK_PIECES: readonly CoasterPiece[] = built.pieces;

/** 車廂要跑的中心線 */
export const TRACK_PATH: readonly CoasterSample[] = built.path;

/** 整條軌道的長度 */
export const TRACK_LENGTH = built.path[built.path.length - 1].dist;

/**
 * 依能量守恆給每個取樣點一個時間戳：v = sqrt(vMin² + 2g(hMax - y))。
 * 爬坡自然變慢、俯衝自然變快，不需要另外寫加速度。
 */
const HIGHEST = Math.max(...built.path.map((p) => p.y));
function speedAt(y: number): number {
  return Math.sqrt(COASTER.minSpeed * COASTER.minSpeed + 2 * COASTER.gravity * Math.max(0, HIGHEST - y));
}
for (let i = 1; i < built.path.length; i++) {
  const prev = built.path[i - 1];
  const cur = built.path[i];
  const ds = cur.dist - prev.dist;
  const v = (speedAt(prev.y) + speedAt(cur.y)) / 2;
  cur.time = prev.time + ds / v;
}

/** 跑完一圈的秒數（不含進站停留） */
export const LAP_SEC = built.path[built.path.length - 1].time;
/** 一輪 = 跑一圈 + 進站停留 */
export const CYCLE_SEC = LAP_SEC + COASTER.dwellMs / 1000;

/** 沿軌道前進 d 公尺後的取樣點（線性內插；超出長度就繞回起點） */
function sampleAtDist(d: number): CoasterSample {
  const path = built.path;
  let t = d % TRACK_LENGTH;
  if (t < 0) t += TRACK_LENGTH;
  // 取樣點不多，線性掃描就夠，不值得為它建索引
  let i = 1;
  while (i < path.length - 1 && path[i].dist < t) i++;
  const a = path[i - 1];
  const b = path[i];
  const span = b.dist - a.dist || 1;
  const k = (t - a.dist) / span;
  let dYaw = (b.yaw - a.yaw) % (Math.PI * 2);
  if (dYaw > Math.PI) dYaw -= Math.PI * 2;
  if (dYaw < -Math.PI) dYaw += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    yaw: a.yaw + dYaw * k,
    pitch: a.pitch + (b.pitch - a.pitch) * k,
    dist: t,
    time: 0,
  };
}

/** 某個時刻車頭已經跑了多遠；停在車站時回傳 0 */
function headDistAt(now: number): number {
  const phase = (now / 1000) % CYCLE_SEC;
  if (phase < COASTER.dwellMs / 1000) return 0; // 進站停留
  const t = phase - COASTER.dwellMs / 1000;
  const path = built.path;
  let i = 1;
  while (i < path.length - 1 && path[i].time < t) i++;
  const a = path[i - 1];
  const b = path[i];
  const span = b.time - a.time || 1;
  return a.dist + (b.dist - a.dist) * ((t - a.time) / span);
}

/** 第 index 節車廂在某時刻的位置與姿態（0 為車頭，往後排） */
export function coasterCarAt(index: number, now: number): CoasterSample {
  return sampleAtDist(headDistAt(now) - index * COASTER.carGap);
}

/** 車子正停在站上（可以上下車） */
export function coasterAtStation(now: number): boolean {
  return (now / 1000) % CYCLE_SEC < COASTER.dwellMs / 1000;
}
