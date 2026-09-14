import { GYM_WALL_X, ROOM_MAX_X, ROOM_MAX_Z, ROOM_MIN_Z } from '../constants';
import type { FurnitureDef } from '../types';

/**
 * 辦公室家具配置（單位：公尺；原點在房間中央，X 向右、Z 向前/下）
 * 房間 24 x 16，牆在 -X（左）與 -Z（後）兩側，形成等角開放視角的 L 型。
 *
 * w/d 為世界座標的碰撞 AABB（已依 Kenney 模型 x2 後的實際尺寸校正），rotY 只影響外觀；
 * 旋轉 90° 的家具請直接把 w/d 互換填寫。
 *
 * 區域：
 *  - 左半：兩排共 8 張辦公桌（工作區）
 *  - 右上：會議桌
 *  - 右下：沙發休息區
 *  - 後牆：文件櫃與白板
 *  - 左下：茶水間
 *  - x 12～20：健身房（玻璃隔間，入口在前側）
 */
const desks: FurnitureDef[] = [];
const chairs: FurnitureDef[] = [];

const deskRows = [-4.5, 0.5];
const deskCols = [-9, -6.6, -4.2, -1.8];
deskRows.forEach((z, r) => {
  deskCols.forEach((x, c) => {
    const i = r * deskCols.length + c;
    desks.push({ id: `desk-${i}`, type: 'desk', x, z, w: 1.5, d: 0.8, h: 0.76, color: '#F5EFE6' });
    chairs.push({ id: `chair-${i}`, type: 'chair', x, z: z + 0.9, w: 0.65, d: 0.65, h: 1.2, color: '#5B7C99', rotY: Math.PI });
  });
});

const meetingChairs: FurnitureDef[] = [
  { x: 5.5, z: -4.6 },
  { x: 6.6, z: -4.6 },
  { x: 7.7, z: -4.6 },
  { x: 5.5, z: -2.4 },
  { x: 6.6, z: -2.4 },
  { x: 7.7, z: -2.4 },
].map((p, i) => ({
  id: `mchair-${i}`,
  type: 'chair' as const,
  variant: 'meeting-chair',
  x: p.x,
  z: p.z,
  w: 0.45,
  d: 0.45,
  h: 0.9,
  color: '#6D8B74',
  rotY: p.z < -3.5 ? 0 : Math.PI,
}));

export const FURNITURE: FurnitureDef[] = [
  ...desks,
  ...chairs,
  { id: 'trash-0', type: 'prop', variant: 'trashcan', x: -10.1, z: 1.4, w: 0.45, d: 0.45, h: 0.9, color: '#9AA5B1' },
  { id: 'trash-1', type: 'prop', variant: 'trashcan', x: -0.7, z: -3.6, w: 0.45, d: 0.45, h: 0.9, color: '#9AA5B1' },

  // 會議區
  { id: 'meeting-table', type: 'table', x: 6.6, z: -3.5, w: 3.4, d: 0.95, h: 0.7, color: '#D9B99B' },
  ...meetingChairs,
  { id: 'whiteboard', type: 'whiteboard', x: 6.6, z: -7.85, w: 3, d: 0.1, h: 1.4, color: '#FFFFFF', solid: false },

  // 後牆文件櫃
  { id: 'cabinet-0', type: 'cabinet', x: -9.8, z: -7.72, w: 1.6, d: 0.5, h: 1.6, color: '#A9B7C6' },
  { id: 'cabinet-1', type: 'cabinet', x: -8.15, z: -7.72, w: 1.6, d: 0.5, h: 1.6, color: '#A9B7C6' },
  { id: 'cabinet-2', type: 'cabinet', x: -6.5, z: -7.72, w: 1.6, d: 0.5, h: 1.6, color: '#A9B7C6' },
  { id: 'cabinet-3', type: 'cabinet', x: 1.0, z: -7.72, w: 1.6, d: 0.5, h: 0.8, color: '#C7B8A5' },

  // 休息區
  { id: 'rug', type: 'rug', x: 7.5, z: 4.5, w: 4.7, d: 2.8, h: 0.02, color: '#E8D5C4', solid: false },
  { id: 'sofa-0', type: 'sofa', x: 7.5, z: 5.8, w: 2.0, d: 0.85, h: 0.92, color: '#8FA3BF', rotY: Math.PI },
  { id: 'sofa-1', type: 'sofa', x: 9.7, z: 4.4, w: 0.85, d: 2.0, h: 0.92, color: '#8FA3BF', rotY: -Math.PI / 2 },
  { id: 'lounge-chair', type: 'chair', variant: 'lounge-chair', x: 5.3, z: 4.4, w: 0.85, d: 1.0, h: 0.92, color: '#B08968', rotY: Math.PI / 2 },
  { id: 'coffee-table', type: 'table', x: 7.5, z: 4.2, w: 1.35, d: 0.85, h: 0.46, color: '#B08968' },
  { id: 'lamp', type: 'prop', variant: 'lamp', x: 10.6, z: 6.4, w: 0.35, d: 0.35, h: 1.7, color: '#E9E4DE' },

  // 小廚房茶水間（左前角）：左牆料理檯（面向 +X）、前排咖啡吧（面向 -Z）、中間早餐吧檯與高腳椅
  // rotY 只影響外觀，碰撞 w/d 已依世界座標軸換算
  { id: 'fridge', type: 'fridge', x: -11.5, z: 2.45, w: 0.85, d: 1.05, h: 1.84, color: '#DCE3EA', rotY: Math.PI / 2 },
  { id: 'kitchen-run', type: 'counter', x: -11.52, z: 4.84, w: 0.9, d: 3.44, h: 0.9, color: '#E9E4DE', rotY: Math.PI / 2 },
  { id: 'kitchen-upper-0', type: 'prop', variant: 'kitchen-upper', x: -11.76, y: 1.45, z: 4.45, w: 0.45, d: 0.86, h: 0.78, color: '#E9E4DE', rotY: Math.PI / 2, solid: false },
  { id: 'kitchen-upper-1', type: 'prop', variant: 'kitchen-upper', x: -11.76, y: 1.45, z: 5.31, w: 0.45, d: 0.86, h: 0.78, color: '#E9E4DE', rotY: Math.PI / 2, solid: false },
  { id: 'counter', type: 'counter', x: -9.8, z: 7.4, w: 4.3, d: 0.9, h: 0.9, color: '#E9E4DE', rotY: Math.PI },
  { id: 'kitchen-bar', type: 'counter', x: -8.6, z: 4.6, w: 0.42, d: 2.98, h: 0.84, color: '#D9B99B', rotY: Math.PI / 2 },
  { id: 'stool-0', type: 'prop', variant: 'stool', x: -7.7, z: 3.74, w: 0.46, d: 0.54, h: 0.88, color: '#8A7A6A', rotY: -Math.PI / 2 },
  { id: 'stool-1', type: 'prop', variant: 'stool', x: -7.7, z: 4.6, w: 0.46, d: 0.54, h: 0.88, color: '#8A7A6A', rotY: -Math.PI / 2 },
  { id: 'stool-2', type: 'prop', variant: 'stool', x: -7.7, z: 5.46, w: 0.46, d: 0.54, h: 0.88, color: '#8A7A6A', rotY: -Math.PI / 2 },

  // 入口
  { id: 'coatrack', type: 'prop', variant: 'coatrack', x: -2.6, z: 7.3, w: 0.55, d: 0.55, h: 1.55, color: '#8A7A6A' },

  // 盆栽
  { id: 'plant-0', type: 'plant', x: -11.4, z: -7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-1', type: 'plant', x: 11.4, z: -7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-2', type: 'plant', x: 11.4, z: 7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-3', type: 'plant', x: 3.0, z: 7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-4', type: 'plant', x: 3.2, z: -7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
];

/** 健身房：玻璃隔間 + 器材。分隔牆在 x=12，入口為 z 3.6～6.4 的缺口 */
const GYM_CENTER_X = (GYM_WALL_X + ROOM_MAX_X) / 2; // 16
const DOOR_MIN_Z = 3.6;
const DOOR_MAX_Z = 6.4;
const gym: FurnitureDef[] = [
  // 分隔牆兩段（半高玻璃）
  {
    id: 'gym-wall-0',
    type: 'partition',
    x: GYM_WALL_X,
    z: (ROOM_MIN_Z + DOOR_MIN_Z) / 2,
    w: 0.16,
    d: DOOR_MIN_Z - ROOM_MIN_Z,
    h: 1.6,
    color: '#BFD7EA',
  },
  {
    id: 'gym-wall-1',
    type: 'partition',
    x: GYM_WALL_X,
    z: (DOOR_MAX_Z + ROOM_MAX_Z) / 2,
    w: 0.16,
    d: ROOM_MAX_Z - DOOR_MAX_Z,
    h: 1.6,
    color: '#BFD7EA',
  },
  // 橡膠地墊（整區）
  { id: 'gym-floor', type: 'gymfloor', x: GYM_CENTER_X, z: 0, w: ROOM_MAX_X - GYM_WALL_X - 0.3, d: 15.6, h: 0.02, color: '#6B7280', solid: false },

  // 跑步機 ×3：靠後牆，跑者面向 -Z（牆上有鏡子）
  { id: 'treadmill-0', type: 'treadmill', x: 13.8, z: -6.2, w: 0.9, d: 1.7, h: 1.2, color: '#374151', rotY: Math.PI },
  { id: 'treadmill-1', type: 'treadmill', x: 16.0, z: -6.2, w: 0.9, d: 1.7, h: 1.2, color: '#374151', rotY: Math.PI },
  { id: 'treadmill-2', type: 'treadmill', x: 18.2, z: -6.2, w: 0.9, d: 1.7, h: 1.2, color: '#374151', rotY: Math.PI },

  // 瑜珈墊 ×3：中央，長邊沿 Z
  { id: 'gymmat-0', type: 'gymmat', x: 13.8, z: -1.5, w: 0.9, d: 1.9, h: 0.04, color: '#6C8EBF', solid: false },
  { id: 'gymmat-1', type: 'gymmat', x: 16.0, z: -1.5, w: 0.9, d: 1.9, h: 0.04, color: '#8FB58A', solid: false },
  { id: 'gymmat-2', type: 'gymmat', x: 18.2, z: -1.5, w: 0.9, d: 1.9, h: 0.04, color: '#C98FA8', solid: false },

  // 臥推區：平板椅 + 槓鈴架（槓鈴放在架上，不擋路）
  // rotY=π：使用者面向 -Z（槓鈴架在 -Z 端），起身點落在 +Z 腳端
  { id: 'bench-0', type: 'bench', x: 15.0, z: 3.2, w: 0.6, d: 1.5, h: 0.45, color: '#3E4A59', rotY: Math.PI },
  { id: 'barbell-0', type: 'prop', variant: 'barbell', x: 15.0, y: 1.05, z: 2.75, w: 2.2, d: 0.4, h: 0.4, color: '#2B2B2B', solid: false },
  { id: 'rack-0', type: 'rack', x: 15.0, z: 2.75, w: 2.0, d: 0.3, h: 1.1, color: '#4B5563' },

  // 啞鈴架：靠右牆（露台門在 z 3.6~6.4，別擋出入口），四個啞鈴由伺服端以可撿道具放在架上（見 weapons.ts DUMBBELL_RACK_SLOTS）
  { id: 'dumbbell-rack', type: 'rack', x: 19.3, z: -2.4, w: 0.5, d: 2.2, h: 0.55, color: '#4B5563' },
  // 盆栽點綴
  { id: 'plant-gym-0', type: 'plant', x: 19.4, z: -7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-gym-1', type: 'plant', x: 12.6, z: 7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
];

/** 戶外露台（匹克球場）：與健身房之間的玻璃隔間（缺口 z 3.6~6.4 為出入口）、球網碰撞、觀眾椅 */
const terrace: FurnitureDef[] = [
  { id: 'terrace-wall-0', type: 'partition', x: 20, z: -2.2, w: 0.16, d: 11.6, h: 1.6, color: '#BFD7EA' },
  { id: 'terrace-wall-1', type: 'partition', x: 20, z: 7.2, w: 0.16, d: 1.6, h: 1.6, color: '#BFD7EA' },
  // 球網：碰撞實體，外觀由 PickleCourt 繪製
  { id: 'pickle-net', type: 'prop', variant: 'pickle-net', x: 29, z: 0, w: 0.14, d: 6.7, h: 0.92 },
  // 觀眾椅（可坐，面向球場）
  { id: 'court-chair-0', type: 'chair', variant: 'meeting-chair', x: 27, z: 6.4, w: 0.45, d: 0.45, h: 0.9, color: '#6D8B74', rotY: Math.PI },
  { id: 'court-chair-1', type: 'chair', variant: 'meeting-chair', x: 29, z: 6.4, w: 0.45, d: 0.45, h: 0.9, color: '#6D8B74', rotY: Math.PI },
  { id: 'court-chair-2', type: 'chair', variant: 'meeting-chair', x: 31, z: 6.4, w: 0.45, d: 0.45, h: 0.9, color: '#6D8B74', rotY: Math.PI },
  { id: 'plant-terrace-0', type: 'plant', x: 20.8, z: -7.4, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
  { id: 'plant-terrace-1', type: 'plant', x: 37.3, z: 7.3, w: 0.5, d: 0.5, h: 1.3, color: '#5E8C61' },
];
FURNITURE.push(...terrace);

FURNITURE.push(...gym);

export const SOLID_FURNITURE = FURNITURE.filter((f) => f.solid !== false);
