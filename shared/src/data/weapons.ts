import { FIGHT, OVEN, SNOWFIGHT } from '../constants';
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

/**
 * 雪球：打雪仗模式的唯一武器，由伺服端在進場時配發（不會出現在地上、不能吃）。
 *
 * 用 shoot 類而不是 throw 類，因為丟出去的是「一顆彈藥」而不是手上那件武器——
 * 丟完不該掉在地上變成可撿的道具，而是打光一輪後走去雪堆補（keepWhenEmpty）。
 * shoot 類走直線，加上兩倍於漢堡的速度，瞄哪裡打哪裡，遠距離也好命中。
 */
WEAPONS.push({
  id: 'snowball',
  name: '雪球',
  // 沒有現成的雪球模型，前端用程式生成的白球（Snowball.tsx）
  model: '',
  kind: 'shoot',
  damage: SNOWFIGHT.damage,
  range: 14,
  knockback: 1.2,
  cooldownMs: 450,
  ammo: SNOWFIGHT.maxBalls,
  projectileSpeed: 18,
  projectileModel: 'snowball',
  keepWhenEmpty: true,
  scale: 1,
  // 和漢堡一樣平放在手上
  grip: { position: [-0.2, -1.05, 0.2], rotation: [0, 0, 0], scale: 1 / 0.65 },
  spawnable: false,
});

/**
 * 泡棉玩具槍（Kenney Blaster Kit，CC0）：福利社買來的隨身武器。
 *
 * 設計上刻意不比撿來的食物武器強——同樣是 shoot 類，總傷害輸出對齊蛋糕噴奶油，
 * 賣的是造型與「進場就有」的方便，而不是戰力。差別只在手感：射程遠一點、
 * 彈匣大一點、射速各有不同，換來的是傷害更低。
 *
 * gear 為 true 代表這是裝備欄的武器：不會出現在地上、丟不掉、倒地重生後還在，
 * 彈藥打完留在手上慢慢自動回填（keepWhenEmpty）。
 */
interface BlasterSpec {
  id: string;
  model: string;
  name: string;
  damage: number;
  range: number;
  cooldownMs: number;
  ammo: number;
  /** 顯示縮放：原始模型 0.42～1.64m，太長的縮到跟角色比例合理 */
  scale: number;
  /** 握把落在手掌的位置，由 scripts/blaster-grip.mts 從模型頂點算出 */
  grip: [number, number, number];
}

/**
 * 握持姿勢由 scripts/blaster-grip.mts 從模型頂點算出，要調整請改腳本重跑而不是手調。
 *
 * rotation 兩段都是必要的：
 * - 繞 Y 180°：五把槍的模型槍口一律朝 -Z，而角色面向 +Z。
 * - 繞 X 90°：武器掛在 arm-right 節點下，手臂垂下時那個節點的 Z 軸是垂直的，
 *   不補這一下槍會直挺挺立在手邊。
 *
 * position 是握把的補償值——這五個模型的原點沒有對齊，握把在模型裡的位置
 * 從 z = -0.12 到 z = +0.79 都有，所以每把都不一樣。
 */
const BLASTER_GRIP_ROTATION: [number, number, number] = [Math.PI / 2, Math.PI, 0];
const BLASTERS: BlasterSpec[] = [
  { id: 'blaster-pocket', model: 'blaster-b', name: '口袋泡棉槍', damage: 16, range: 9, cooldownMs: 260, ammo: 10, scale: 1, grip: [-0.2, -1.07, 0.19] },
  { id: 'blaster-rapid', model: 'blaster-i', name: '連發泡棉槍', damage: 14, range: 10, cooldownMs: 200, ammo: 14, scale: 1, grip: [-0.2, -0.82, 0.19] },
  { id: 'blaster-rifle', model: 'blaster-a', name: '會議室步槍', damage: 22, range: 12, cooldownMs: 420, ammo: 8, scale: 1, grip: [-0.2, -1.06, 0.22] },
  { id: 'blaster-heavy', model: 'blaster-p', name: '重裝泡棉砲', damage: 30, range: 11, cooldownMs: 650, ammo: 6, scale: 0.9, grip: [-0.2, -0.89, 0.1] },
  { id: 'blaster-sniper', model: 'blaster-e', name: '遠端工作狙擊槍', damage: 38, range: 18, cooldownMs: 900, ammo: 4, scale: 0.9, grip: [-0.25, -2.1, 0.13] },
];

for (const spec of BLASTERS) {
  WEAPONS.push({
    id: spec.id,
    name: spec.name,
    model: `blaster/${spec.model}`,
    kind: 'shoot',
    damage: spec.damage,
    range: spec.range,
    knockback: 1.2,
    cooldownMs: spec.cooldownMs,
    ammo: spec.ammo,
    projectileSpeed: 20,
    projectileModel: 'blaster/bullet-foam-tip',
    keepWhenEmpty: true,
    scale: spec.scale,
    grip: { position: spec.grip, rotation: BLASTER_GRIP_ROTATION, scale: spec.scale / 0.65 },
    spawnable: false,
    gear: true,
  });
}

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

/** 裝備欄武器（福利社買的），不會出現在地上也丟不掉 */
export function isGearWeapon(id: string): boolean {
  return WEAPON_BY_ID.get(id)?.gear === true;
}

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
