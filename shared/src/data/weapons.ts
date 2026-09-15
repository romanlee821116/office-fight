import { FIGHT, OVEN } from '../constants';
import type { WeaponDef } from '../types';

/** 可頌基準尺寸（模型 0.35 x 0.19 x 0.48）；和漢堡差不多大，手持時才不會擋住角色 */
const CROISSANT_SCALE = 0.7;
/** 烤過的可頌：OVEN.bakeScale 倍大 */
const BAKED_SCALE = CROISSANT_SCALE * OVEN.bakeScale;

/**
 * 食物武器（Kenney Food Kit，CC0）。
 * grip 為相對角色右手臂節點的位置（角色模型單位，手掌約在 (-0.2, -0.95, 0)）：
 * 長條狀武器把長軸轉到 +Z 並讓握把端落在手上；手臂抬平時 +Z 會朝上，像舉著球棒。
 */
export const WEAPONS: WeaponDef[] = [
  {
    id: 'baguette',
    edible: true,
    name: '法國麵包',
    model: 'loaf-baguette',
    kind: 'melee',
    damage: 40,
    range: 2.0,
    knockback: 2.5,
    cooldownMs: 700,
    scale: 1.1,
    grip: { position: [-0.2, -1.0, 0.55], rotation: [-0.35, -Math.PI / 2, 0], scale: 1.1 / 0.65 },
  },
  {
    id: 'chicken',
    edible: true,
    name: '烤雞腿',
    model: 'turkey',
    kind: 'melee',
    damage: 45,
    range: 1.9,
    knockback: 3.0,
    cooldownMs: 800,
    scale: 0.85,
    grip: { position: [-0.2, -1.0, 0.5], rotation: [-0.35, -Math.PI / 2, 0], scale: 0.85 / 0.65 },
  },
  {
    id: 'burger',
    edible: true,
    name: '漢堡',
    model: 'burger',
    kind: 'throw',
    damage: 30,
    range: 7,
    knockback: 1.5,
    cooldownMs: 800,
    projectileSpeed: 9,
    scale: 1,
    grip: { position: [-0.2, -1.05, 0.2], rotation: [0, 0, 0], scale: 1 / 0.65 },
  },
  {
    id: 'soda',
    edible: true,
    name: '飲料罐',
    model: 'soda-can',
    kind: 'throw',
    damage: 25,
    range: 8,
    knockback: 1.2,
    cooldownMs: 700,
    projectileSpeed: 11,
    scale: 1,
    grip: { position: [-0.2, -1.05, 0.15], rotation: [0, 0, 0], scale: 1 / 0.65 },
  },
  {
    id: 'cake',
    edible: true,
    name: '蛋糕（噴奶油）',
    model: 'cake',
    kind: 'shoot',
    damage: 20,
    range: 8,
    knockback: 0.8,
    cooldownMs: 350,
    ammo: 6,
    projectileSpeed: 12,
    projectileModel: 'whipped-cream',
    scale: 0.8,
    grip: { position: [-0.25, -1.05, 0.25], rotation: [0, 0, 0], scale: 0.7 / 0.65 },
  },
  {
    id: 'croissant',
    edible: true,
    name: '可頌',
    model: 'croissant',
    kind: 'melee',
    damage: 35,
    range: 1.7,
    knockback: 2.2,
    cooldownMs: 650,
    scale: CROISSANT_SCALE,
    // 和漢堡一樣平放在手上（不像法國麵包那樣立起來當球棒），才不會遮住角色上半身
    grip: { position: [-0.2, -1.05, 0.2], rotation: [0, 0, 0], scale: CROISSANT_SCALE / 0.65 },
    bakesTo: 'croissant-baked',
  },
];

/**
 * 巨無霸可頌：可頌在烤箱烤 5 秒的產物，體型三倍大、吃下去回滿血。
 * 傷害與擊退刻意維持和原味可頌一樣，只有判定距離配合長度加長，才不會破壞格鬥平衡。
 */
WEAPONS.push({
  id: 'croissant-baked',
  edible: true,
  heal: FIGHT.maxHp,
  name: '巨無霸可頌',
  model: 'croissant',
  kind: 'melee',
  damage: 35,
  range: 2.1,
  knockback: 2.2,
  cooldownMs: 650,
  scale: BAKED_SCALE,
  // 長度到 1m，握點再往下往前挪，讓它掛在手前方而不是蓋住頭
  grip: { position: [-0.2, -1.18, 0.45], rotation: [0, 0, 0], scale: BAKED_SCALE / 0.65 },
  spawnable: false,
});

/** 健身器材：只出現在啞鈴架上，可當重型近戰武器，也可在非格鬥模式做彎舉 */
WEAPONS.push({
  id: 'dumbbell',
  name: '啞鈴',
  model: 'gym/dumbbell',
  kind: 'melee',
  damage: 50,
  range: 1.7,
  knockback: 2.8,
  cooldownMs: 1000,
  scale: 1,
  grip: { position: [-0.2, -1.0, 0.1], rotation: [0, 0, 0], scale: 1 / 0.65 },
  spawnable: false,
  exercise: 'curl',
});

/** 匹克球拍：比賽中由伺服端配發（不會出現在地上、不能攻擊、不能吃） */
WEAPONS.push({
  id: 'paddle',
  name: '球拍',
  model: '',
  kind: 'melee',
  damage: 0,
  range: 0,
  knockback: 0,
  cooldownMs: 999999,
  scale: 1,
  grip: { position: [-0.2, -1.0, 0.15], rotation: [0.3, 0, 0], scale: 1 / 0.65 },
  spawnable: false,
});

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
export const SPAWNABLE_WEAPONS = WEAPONS.filter((w) => w.spawnable !== false);

/**
 * 廚房早餐吧檯上固定供應的可頌（配合 furniture.ts 的 kitchen-bar，檯面高 0.84）。
 * 被拿走後伺服端會再放一個，所以隨時走進廚房都拿得到可頌去烤。
 */
export const KITCHEN_CROISSANT_SPOT = { x: -8.6, z: 3.45, y: 0.84 };

/** 啞鈴架上四個啞鈴的初始位置（配合 furniture.ts 的 dumbbell-rack） */
export const DUMBBELL_RACK_SLOTS = [-0.8, -0.27, 0.27, 0.8].map((dz) => ({ x: 22.6, z: -2.4 + dz, y: 0.55 }));

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPON_BY_ID.get(id);
}

/** 投射物顯示縮放（奶油放大一點才看得見） */
export const PROJECTILE_SCALE: Record<string, number> = { 'whipped-cream': 2.2 };
