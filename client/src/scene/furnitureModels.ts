import type { FurnitureDef } from '@office/shared';
import { useGLTF } from '@react-three/drei';
import { KIT_SCALE, kitUrl, type KitModelProps, type Recolor } from './KitModel';

/**
 * 家具配方：每個 FurnitureDef 由哪些 Kenney 模型組成。
 * dx/dy/dz 為家具中心的局部偏移（公尺），rotY 為模型相對家具的額外旋轉。
 * 尺寸依 KIT_SCALE=2 換算：desk 1.46x0.76x0.78、chairDesk 0.66x1.22x0.62、tableCross 1.7x0.7x0.9、
 * loungeSofa 1.96x0.92x0.82、bookcaseClosedWide 1.6x1.58x0.5、kitchenCabinet 0.86x0.9x0.9、kitchenFridgeLarge 1.04x1.84x0.82。
 */
export interface Part {
  model: string;
  dx?: number;
  dy?: number;
  dz?: number;
  rotY?: number;
  scale?: number;
  recolor?: Recolor[];
}

/** Kenney 調色盤（線性 RGB） */
const KENNEY = {
  red: [0.94, 0.37, 0.34] as [number, number, number],
  teal: [0.37, 0.47, 0.47] as [number, number, number],
  redDark: [0.61, 0.3, 0.29] as [number, number, number],
};

const OFFICE_CHAIR: Recolor[] = [{ from: KENNEY.red, to: '#5B7C99' }];
const MEETING_CHAIR: Recolor[] = [{ from: KENNEY.red, to: '#6D8B74' }];
const SOFA: Recolor[] = [{ from: KENNEY.red, to: '#8FA3BF' }];
const LOUNGE: Recolor[] = [{ from: KENNEY.red, to: '#B08968' }];
const RUG: Recolor[] = [
  { from: KENNEY.red, to: '#E8D5C4' },
  { from: KENNEY.redDark, to: '#CDB59F' },
];

const DESK_TOP = 0.76;
const COUNTER_TOP = 0.9;

function deskRecipe(f: FurnitureDef): Part[] {
  const index = Number(f.id.split('-')[1] ?? 0);
  const laptop = index % 2 === 1;
  return [
    { model: 'desk' },
    laptop
      ? { model: 'laptop', dy: DESK_TOP, dz: -0.05, scale: 1.7 }
      : { model: 'computerScreen', dy: DESK_TOP, dz: -0.18, scale: 1.7 },
    ...(laptop ? [] : [{ model: 'computerKeyboard', dy: DESK_TOP, dz: 0.12, scale: 1.7 }]),
    ...(index % 3 === 0 ? [{ model: 'plantSmall2', dy: DESK_TOP, dx: 0.55, dz: -0.15 }] : []),
  ];
}

const BY_ID: Record<string, Part[]> = {
  'gymmat-1': [{ model: 'gym/gymmat', scale: 1.15, recolor: [{ from: [0, 0, 0], to: '#8FB58A' }] }],
  'gymmat-2': [{ model: 'gym/gymmat', scale: 1.15, recolor: [{ from: [0, 0, 0], to: '#C98FA8' }] }],
  'meeting-table': [
    { model: 'tableCross', dx: -0.85 },
    { model: 'tableCross', dx: 0.85 },
    { model: 'plantSmall1', dy: 0.7 },
  ],
  'coffee-table': [{ model: 'tableCoffee' }, { model: 'books', dy: 0.46, dx: 0.2 }],
  'cabinet-3': [
    { model: 'bookcaseOpenLow', dx: -0.4 },
    { model: 'bookcaseOpenLow', dx: 0.4 },
    { model: 'books', dy: 0.8, dx: -0.35 },
    { model: 'radio', dy: 0.8, dx: 0.4 },
  ],
  counter: [
    { model: 'kitchenCabinetDrawer', dx: -1.29 },
    { model: 'kitchenSink', dx: -0.43 },
    { model: 'kitchenCabinet', dx: 0.43 },
    { model: 'kitchenCabinet', dx: 1.29 },
    { model: 'kitchenCoffeeMachine', dx: 0.43, dy: COUNTER_TOP },
    { model: 'kitchenMicrowave', dx: 1.29, dy: COUNTER_TOP },
  ],
};

/** 健身器材為 1:1 公尺的模型，不套 Kenney 的 2 倍 */
const GYM_MAT: Recolor[] = [{ from: [0, 0, 0], to: '#6C8EBF' }];
const BARBELL: Recolor[] = [
  { from: [0.02, 0.02, 0.02], to: '#2F343B' },
  { from: [0.25, 0.25, 0.25], to: '#9AA3AD' },
  { from: [0.06, 0.06, 0.06], to: '#4B5563' },
];

const BY_TYPE: Partial<Record<string, Part[]>> = {
  // 模型的控制面板在 -Z 端，轉 180° 讓面板落在跑者（面向 -Z 鏡子）前方
  treadmill: [{ model: 'gym/treadmill', scale: 1.3, rotY: Math.PI }],
  gymmat: [{ model: 'gym/gymmat', scale: 1.15, recolor: GYM_MAT }],
  barbell: [{ model: 'gym/barbell', scale: 0.46, recolor: BARBELL }],
  dumbbell: [{ model: 'gym/dumbbell', scale: 1 }],
  chair: [{ model: 'chairDesk', recolor: OFFICE_CHAIR }],
  'meeting-chair': [{ model: 'chairModernCushion', scale: 2.2, recolor: MEETING_CHAIR }],
  table: [{ model: 'tableCross' }],
  sofa: [{ model: 'loungeSofa', recolor: SOFA }],
  'lounge-chair': [{ model: 'loungeChair', recolor: LOUNGE }],
  cabinet: [{ model: 'bookcaseClosedWide' }],
  plant: [{ model: 'pottedPlant' }],
  fridge: [{ model: 'kitchenFridgeLarge' }],
  rug: [{ model: 'rugRectangle', scale: 3, recolor: RUG }],
  trashcan: [{ model: 'trashcan' }],
  coatrack: [{ model: 'coatRackStanding' }],
  lamp: [{ model: 'lampRoundFloor' }],
};

/** 回傳配方；null 代表沒有對應模型（沿用程式生成幾何） */
export function getRecipe(f: FurnitureDef): Part[] | null {
  if (f.type === 'desk') return deskRecipe(f);
  if (BY_ID[f.id]) return BY_ID[f.id];
  const key = f.variant ?? f.type;
  return BY_TYPE[key] ?? null;
}

export function partToProps(p: Part): KitModelProps {
  return {
    model: p.model,
    position: [p.dx ?? 0, p.dy ?? 0, p.dz ?? 0],
    rotY: p.rotY ?? 0,
    scale: p.scale ?? KIT_SCALE,
    recolor: p.recolor,
  };
}

/** 預先載入所有會用到的模型 */
const ALL_MODELS = new Set<string>();
for (const parts of [...Object.values(BY_ID), ...Object.values(BY_TYPE)]) {
  parts?.forEach((p) => ALL_MODELS.add(p.model));
}
['desk', 'laptop', 'computerScreen', 'computerKeyboard', 'plantSmall2', 'gym/treadmill', 'gym/gymmat', 'gym/barbell', 'gym/dumbbell'].forEach((m) =>
  ALL_MODELS.add(m),
);
ALL_MODELS.forEach((m) => useGLTF.preload(kitUrl(m)));
