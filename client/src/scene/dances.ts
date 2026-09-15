import { EAT, PLAYGROUND, type AnimState, type DanceId } from '@office/shared';

/** Kenney Blocky Characters 高 2.7 單位，縮放後約 1.75m；rootY / rootZ 都是模型單位 */
export const CHARACTER_SCALE = 0.65;
/** 公尺 → 角色模型單位 */
function m(metres: number): number {
  return metres / CHARACTER_SCALE;
}

/**
 * 角色骨架的髖部（雙腿的旋轉中心）在 root 上方 1.0 個模型單位，站立時腳掌剛好落在 root。
 * 因此「坐在高 h 的座面上」不是把 root 放到 h，而是把髖部放上去；
 * 直接用 m(h) 會變成站在椅子上。SIT_LIFT 再往上墊一點，免得屁股陷進座面。
 */
const HIP = 1.0;
const SIT_LIFT = 0.12;
function sitRootY(seatHeightMetres: number): number {
  return m(seatHeightMetres) - HIP + SIT_LIFT;
}

/** 由程式計算姿勢的動作（舞步 + 器材動作 + 遊樂設施） */
export type ProceduralAnim =
  | DanceId
  | 'benchpress'
  | 'benchpress-incline'
  | 'curl'
  | 'squat'
  | 'swing'
  | 'slide'
  | 'swing-ride'
  | 'seesaw-a'
  | 'seesaw-b'
  | 'eat';
const PROCEDURAL = new Set<string>([
  'benchpress',
  'benchpress-incline',
  'curl',
  'squat',
  'swing',
  'slide',
  'swing-ride',
  'seesaw-a',
  'seesaw-b',
  'eat',
]);
export function isProcedural(anim: AnimState): anim is ProceduralAnim {
  return PROCEDURAL.has(anim) || anim.startsWith('dance-');
}

/** 一次性的程式動作（以觸發時間為 0 起算，而非牆上時鐘節拍） */
export const ONE_SHOT_PROCEDURAL: Partial<Record<ProceduralAnim, number>> = {
  swing: 420,
  slide: PLAYGROUND.slide.rideMs,
  eat: EAT.durationMs,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * 網球式正手揮拍（t 0~1）：引拍轉身 → 快速橫掃 → 收拍回正。
 * 右手臂抬平讓球拍沿手臂方向水平掃過，主要旋轉在軀幹。
 */
export function swingPose(t: number): DancePose {
  const wind = easeOut(clamp01(t / 0.3)); // 引拍
  const strike = easeOut(clamp01((t - 0.3) / 0.25)); // 揮擊
  const settle = easeOut(clamp01((t - 0.62) / 0.38)); // 收拍
  const torsoYaw = 0.95 * wind - 2.1 * strike + 1.15 * settle;
  const armLift = -1.5 * wind + 1.5 * settle * 0.9; // 抬平再放下
  return {
    rootY: -0.06 * strike * (1 - settle),
    rootRotY: torsoYaw * 0.35,
    torso: [0.08 * strike, torsoYaw, 0],
    head: [0, -torsoYaw * 0.5, 0],
    armR: [armLift, 0, -0.25 * wind - 0.15 * strike],
    armL: [-0.4 * wind * (1 - settle), 0, 0.5 * strike * (1 - settle)],
    legL: 0.18 * wind * (1 - settle),
    legR: -0.22 * strike * (1 - settle),
  };
}
/**
 * 溜滑梯（一次性，t 0~1）：爬梯 → 走到滑道口 → 滑下來。
 * 位移以座位（爬梯底部）為原點，沿設施局部 +Z 前進，與 seats.ts 的 standAt 對得上。
 */
export function slidePose(t: number): DancePose {
  const S = PLAYGROUND.slide;
  const toChute = S.chuteTopZ - S.ladderZ;
  const chuteRun = S.chuteEndZ - S.chuteTopZ;

  if (t < S.climbEnd) {
    // 爬梯：手腳交替，身體貼著梯子往上
    const k = t / S.climbEnd;
    const step = Math.sin(k * Math.PI * 3);
    return {
      rootY: m(S.deckY * easeOut(k)),
      rootZ: 0,
      rootRotY: 0,
      torso: [0.12, 0, 0],
      head: [-0.25, 0, 0],
      armL: [-2.5 + step * 0.45, 0, 0.25],
      armR: [-2.5 - step * 0.45, 0, -0.25],
      legL: -0.5 - step * 0.45,
      legR: -0.5 + step * 0.45,
    };
  }

  if (t < S.walkEnd) {
    // 站上平台、走到滑道口
    const k = (t - S.climbEnd) / (S.walkEnd - S.climbEnd);
    return {
      rootY: m(S.deckY),
      rootZ: m(toChute * k),
      rootRotY: 0,
      torso: [0, 0, 0],
      head: [0.15, 0, 0],
      armL: [-0.6, 0, 0.3],
      armR: [-0.6, 0, -0.3],
      legL: -0.35 * Math.sin(k * Math.PI * 2),
      legR: 0.35 * Math.sin(k * Math.PI * 2),
    };
  }

  // 滑下來：越滑越快（滑道是 S 形，高度用 smoothstep 貼合曲面），雙手舉高歡呼
  const k = (t - S.walkEnd) / (1 - S.walkEnd);
  const along = k * k * (2 - k); // 起步慢、中段快
  const drop = along * along * (3 - 2 * along);
  const wob = Math.sin(along * Math.PI * 2) * 0.12;
  const surfaceY = S.deckY + (S.chuteEndY - S.deckY) * drop;
  // 滑道口先坐下去，再開始滑
  const sit = clamp01(k / 0.18);
  return {
    rootY: m(surfaceY) - (HIP - SIT_LIFT) * sit,
    rootZ: m(toChute + chuteRun * along),
    rootRotY: 0,
    rootRotX: (0.25 + wob) * sit,
    torso: [-0.1 * sit, wob * sit, 0],
    head: [-0.2 * sit, 0, 0],
    armL: [lerp(-0.6, -2.7, sit), 0, lerp(0.3, 0.5 + wob, sit)],
    armR: [lerp(-0.6, -2.7, sit), 0, lerp(-0.3, -0.5 + wob, sit)],
    legL: lerp(0, -1.35, sit),
    legR: lerp(0, -1.25, sit),
  };
}

/**
 * 吃東西（一次性，t 0~1）：右手把食物舉到嘴邊咬三口再放下。
 * 食物掛在 arm-right 節點下，所以只要把手臂抬到臉的高度，食物就會跟著送到嘴邊。
 */
export function eatPose(t: number): DancePose {
  // 舉起 → 維持 → 放下
  const lift = easeOut(clamp01(t / 0.22)) * (1 - easeOut(clamp01((t - 0.78) / 0.22)));
  const bite = Math.max(0, Math.sin(t * Math.PI * 6)) * lift;
  return {
    rootY: 0,
    rootRotY: 0,
    torso: [0.06 * lift, 0, 0],
    head: [0.1 * lift + 0.18 * bite, 0, 0],
    armR: [-1.75 * lift - 0.18 * bite, 0, -0.3 * lift],
    armL: [-0.18 * lift, 0, 0.12 * lift],
    legL: 0,
    legR: 0,
  };
}

/** 一次性程式動作的姿勢分派 */
export function oneShotPose(id: ProceduralAnim, t: number): DancePose {
  if (id === 'slide') return slidePose(t);
  if (id === 'eat') return eatPose(t);
  return swingPose(t);
}

/** 各程式動作的節拍 */
export const PROCEDURAL_BPM: Record<string, number> = {
  benchpress: 60,
  'benchpress-incline': 54,
  curl: 80,
  squat: 46,
  'swing-ride': PLAYGROUND.swing.bpm,
  'seesaw-a': PLAYGROUND.seesaw.bpm,
  'seesaw-b': PLAYGROUND.seesaw.bpm,
};

/**
 * 鞦韆擺角與蹺蹺板傾角：以牆上時鐘的拍數計算，所有客戶端與模型本身都吃同一個值，
 * 因此人跟座椅永遠黏在一起，也不必為了同步多傳任何狀態。
 */
export function swingRideAngle(beat: number): number {
  return PLAYGROUND.swing.amplitude * Math.sin(beat * Math.PI);
}
export function seesawTilt(beat: number): number {
  return PLAYGROUND.seesaw.amplitude * Math.sin(beat * Math.PI);
}

/** 依 bpm 把現在時刻換算成拍數（與 Avatar 內的算法一致） */
export function beatNow(bpm: number): number {
  return (Date.now() / 1000) * (bpm / 60);
}

/** 各節點的姿勢（角色模型單位、弧度）。root 的 y 為上下位移、rotY 為整體轉向 */
export interface DancePose {
  rootY: number;
  rootRotY: number;
  /** 整體繞 X 旋轉（躺下用），預設 0 */
  rootRotX?: number;
  /** 整體沿 Z 位移（躺下時把身體中心對到椅子），預設 0 */
  rootZ?: number;
  torso: [number, number, number];
  head: [number, number, number];
  armL: [number, number, number];
  armR: [number, number, number];
  legL: number;
  legR: number;
}

const TAU = Math.PI * 2;
/** 手臂：繞 X 負值為往前舉，繞 Z 正值為左手往外側舉（右手取負） */
const UP = -2.9;

/** 機械舞的「頓」：在每拍前 30% 快速到位，其餘時間停住 */
function pop(phase: number): number {
  const f = phase - Math.floor(phase);
  return Math.min(1, f / 0.3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 依舞步與節拍（beat 為累積拍數，含小數）回傳姿勢。
 * 所有客戶端用同一個時鐘算 beat，因此看到的動作一致且會對拍。
 */
export function dancePose(id: ProceduralAnim, beat: number): DancePose {
  const b = beat;
  switch (id) {
    case 'benchpress': {
      // 仰躺：整體先繞 Y 180° 再繞 X +90°，臉朝上、頭朝局部 +Z（配合座位 rotY=π，世界座標頭朝 -Z 的槓鈴架）
      // 椅面高 0.45m ≈ 0.7 模型單位；身體長 2.7 單位，rootZ 把身體中心對到椅子中心
      const push = (Math.sin(b * Math.PI) + 1) / 2; // 0 = 手臂彎曲，1 = 推到頂
      const arm = -1.57 + (1 - push) * 0.9; // 手臂垂直於身體（指向天）到彎曲
      return {
        rootY: 0.78,
        rootRotY: Math.PI,
        rootRotX: Math.PI / 2,
        rootZ: -1.35,
        torso: [0, 0, 0],
        head: [-0.15, 0, 0],
        armL: [arm, 0, 0.35],
        armR: [arm, 0, -0.35],
        legL: -1.2,
        legR: -1.2,
      };
    }
    case 'benchpress-incline': {
      // 斜板臥推：半躺約 35°、雙腳踩地，雙手向上推舉
      const push = (Math.sin(b * Math.PI) + 1) / 2; // 0 手臂彎曲 → 1 推到頂
      const arm = -1.5 + (1 - push) * 0.85;
      return {
        rootY: 1.24, // 椅墊較高（約 0.8m）
        rootRotY: Math.PI,
        rootRotX: Math.PI / 2 - 0.62, // 椅背傾角
        rootZ: -0.95,
        torso: [0, 0, 0],
        head: [0.2, 0, 0],
        armL: [arm, 0, 0.32],
        armR: [arm, 0, -0.32],
        legL: -0.62, // 腳踩在地上
        legR: -0.62,
      };
    }
    case 'squat': {
      // 槓鈴深蹲：雙手舉起扶住肩後的橫桿，身體隨節拍蹲下起立
      const down = (1 - Math.cos(b * Math.PI)) / 2; // 0 站立 → 1 蹲到底
      return {
        rootY: -down * 0.55,
        rootRotY: 0,
        torso: [down * 0.42, 0, 0], // 蹲下時上身前傾
        head: [-down * 0.3, 0, 0], // 頭保持看前方
        armL: [-2.45, 0, 0.55],
        armR: [-2.45, 0, -0.55],
        legL: -down * 1.15,
        legR: -down * 1.15,
      };
    }
    case 'curl': {
      // 右手二頭彎舉：手臂從自然下垂彎到肩前，身體微微跟著出力
      const k = (Math.sin(b * Math.PI - Math.PI / 2) + 1) / 2; // 0 下垂 → 1 彎到頂
      return {
        rootY: 0,
        rootRotY: 0,
        torso: [-k * 0.08, 0, 0.05 * k],
        head: [k * 0.1, 0, 0],
        armL: [0, 0, 0.15],
        armR: [-0.3 - k * 2.2, 0, -0.15],
        legL: 0,
        legR: 0,
      };
    }
    case 'swing-ride': {
      // 座椅繞橫梁畫弧（與 Playground 畫的鞦韆用同一條式子，才會完全同步）
      const S = PLAYGROUND.swing;
      const rope = S.pivotY - S.seatY;
      const a = swingRideAngle(b);
      return {
        // 盪出去時人往外、往上抬；身體跟著繩子傾斜
        rootY: sitRootY(S.seatY + rope * (1 - Math.cos(a))),
        rootZ: m(-rope * Math.sin(a)),
        rootRotY: 0,
        rootRotX: a,
        torso: [0.1 * Math.cos(b * Math.PI), 0, 0],
        head: [-0.15, 0, 0],
        // 雙手抓著兩側的繩子
        armL: [-2.2, 0, 0.22],
        armR: [-2.2, 0, -0.22],
        // 盪到兩端時把腿伸直，回到中間收腿
        legL: -1.45 + Math.abs(a / S.amplitude) * 0.35,
        legR: -1.4 + Math.abs(a / S.amplitude) * 0.35,
      };
    }
    case 'seesaw-a':
    case 'seesaw-b': {
      const S = PLAYGROUND.seesaw;
      const tilt = seesawTilt(b);
      // seesaw-a 坐局部 -X 端（面向 +X），seesaw-b 坐 +X 端；兩端高低相反
      const sideA = id === 'seesaw-a';
      const x = sideA ? S.seatX[0] : S.seatX[1];
      const armY = S.seatY - S.pivotY;
      const dy = x * Math.sin(tilt) + armY * Math.cos(tilt) - armY;
      // 兩人面向 ±X，角色的局部 X 軸剛好是板身的傾斜軸，但方向相反
      const lean = sideA ? -tilt : tilt;
      const rising = dy > 0;
      return {
        rootY: sitRootY(S.seatY + dy),
        rootZ: 0,
        rootRotY: 0,
        rootRotX: lean,
        torso: [rising ? -0.12 : 0.12, 0, 0],
        head: [rising ? 0.2 : -0.1, 0, 0],
        // 雙手抓前方把手
        armL: [-1.5, 0, 0.3],
        armR: [-1.5, 0, -0.3],
        legL: -1.2 + (rising ? -0.25 : 0.2),
        legR: -1.15 + (rising ? -0.25 : 0.2),
      };
    }
    case 'dance-swing': {
      const s = Math.sin(b * Math.PI); // 每兩拍一個來回
      const bounce = Math.abs(Math.sin(b * Math.PI)) * 0.18;
      return {
        rootY: bounce,
        rootRotY: 0,
        torso: [0, s * 0.15, s * 0.25],
        head: [0, 0, -s * 0.3],
        armL: [-0.3, 0, 1.1 + s * 1.2],
        armR: [-0.3, 0, -(1.1 - s * 1.2)],
        legL: s * 0.35,
        legR: -s * 0.35,
      };
    }
    case 'dance-robot': {
      const step = Math.floor(b) % 4;
      const k = pop(b);
      // 四個離散姿勢輪替，手臂保持直角
      const poses: Array<Pick<DancePose, 'armL' | 'armR' | 'head' | 'torso'>> = [
        { armL: [-1.57, 0, 0], armR: [-1.57, 0, 0], head: [0, 0.5, 0], torso: [0, 0.25, 0] },
        { armL: [-1.57, 0, 1.2], armR: [-1.57, 0, 0], head: [0, -0.5, 0], torso: [0, -0.25, 0] },
        { armL: [-3.0, 0, 0], armR: [-1.57, 0, -1.2], head: [0.3, 0, 0], torso: [0, 0.25, 0] },
        { armL: [-1.57, 0, 0], armR: [-3.0, 0, 0], head: [-0.2, 0, 0.3], torso: [0, -0.25, 0] },
      ];
      const from = poses[(step + 3) % 4];
      const to = poses[step];
      const mix = (a: [number, number, number], c: [number, number, number]): [number, number, number] => [
        lerp(a[0], c[0], k),
        lerp(a[1], c[1], k),
        lerp(a[2], c[2], k),
      ];
      return {
        rootY: 0,
        rootRotY: 0,
        torso: mix(from.torso, to.torso),
        head: mix(from.head, to.head),
        armL: mix(from.armL, to.armL),
        armR: mix(from.armR, to.armR),
        legL: 0,
        legR: 0,
      };
    }
    case 'dance-squat': {
      // 兩拍一循環：蹲下（膝蓋前彎、身體下沉）→ 跳起（手舉高）；每八拍轉一圈
      const c = (Math.cos(b * Math.PI) + 1) / 2; // 1 = 站，0 = 蹲
      const squat = 1 - c;
      const jump = Math.max(0, Math.sin(b * Math.PI)) * 0.25;
      return {
        rootY: -squat * 0.45 + jump,
        rootRotY: (b / 8) * TAU,
        torso: [squat * 0.35, 0, 0],
        head: [-squat * 0.2, 0, 0],
        armL: [lerp(UP, -0.4, squat), 0, 0.4],
        armR: [lerp(UP, -0.4, squat), 0, -0.4],
        legL: -squat * 1.0,
        legR: -squat * 1.0,
      };
    }
    case 'dance-groove':
    default: {
      // 手臂畫圈、腳踏步、頭點拍、身體扭腰
      const t = b * Math.PI;
      const st = Math.sin(t);
      return {
        rootY: Math.abs(Math.sin(t)) * 0.1,
        rootRotY: Math.sin(b * Math.PI * 0.5) * 0.35,
        torso: [0, st * 0.3, 0],
        head: [Math.abs(Math.sin(b * TAU)) * -0.25, 0, 0],
        armL: [-1.3 + Math.sin(t) * 0.7, 0, 1.0 + Math.cos(t) * 0.6],
        armR: [-1.3 + Math.sin(t + Math.PI) * 0.7, 0, -(1.0 + Math.cos(t + Math.PI) * 0.6)],
        legL: st * 0.5,
        legR: -st * 0.5,
      };
    }
  }
}
