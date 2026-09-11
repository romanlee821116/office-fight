import type { AnimState, DanceId } from '@office/shared';

/** 由程式計算姿勢的動作（舞步 + 器材動作） */
export type ProceduralAnim = DanceId | 'benchpress' | 'curl';
export function isProcedural(anim: AnimState): anim is ProceduralAnim {
  return anim === 'benchpress' || anim === 'curl' || anim.startsWith('dance-');
}
/** 各程式動作的節拍 */
export const PROCEDURAL_BPM: Record<string, number> = { benchpress: 60, curl: 80 };

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
