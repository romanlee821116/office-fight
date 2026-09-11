import type { WeaponDef } from '../types';

/**
 * 食物武器（Kenney Food Kit，CC0）。
 * grip 為相對角色右手臂節點的位置（角色模型單位，手掌約在 (-0.2, -0.95, 0)）：
 * 長條狀武器把長軸轉到 +Z 並讓握把端落在手上；手臂抬平時 +Z 會朝上，像舉著球棒。
 */
export const WEAPONS: WeaponDef[] = [
  {
    id: 'baguette',
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
];

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

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
export const SPAWNABLE_WEAPONS = WEAPONS.filter((w) => w.spawnable !== false);

/** 啞鈴架上四個啞鈴的初始位置（配合 furniture.ts 的 dumbbell-rack） */
export const DUMBBELL_RACK_SLOTS = [-0.8, -0.27, 0.27, 0.8].map((dz) => ({ x: 19.3, z: 4.6 + dz, y: 0.55 }));

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPON_BY_ID.get(id);
}

/** 投射物顯示縮放（奶油放大一點才看得見） */
export const PROJECTILE_SCALE: Record<string, number> = { 'whipped-cream': 2.2 };
