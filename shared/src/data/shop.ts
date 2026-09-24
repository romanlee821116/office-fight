import type { ShopItem } from '../types';

/**
 * 商店商品。全部沿用專案裡已有的模型與貼圖，不需要額外美術資產。
 *
 * - outfit：18 個角色的貼圖逐頂點共用同一套 UV，所以任何貼圖都能套到任何角色身上。
 *   asset 為 client/public/models/characters/Textures/<asset>.png。
 * - hat：掛在角色 head 節點下，縮放與位置由 bounding box 反推（見 HeadProp）。
 *   asset 為 client/public/models/<asset>.glb。
 */

const hats: ShopItem[] = [
  { id: 'hat-tophat', kind: 'hat', name: '紳士高帽', price: 800, asset: 'holiday/snowman-hat', fit: { width: 7.5, baseY: 7.6 } },
  { id: 'hat-pan', kind: 'hat', name: '平底鍋', price: 300, asset: 'food/frying-pan', fit: { width: 10, baseY: 7.8 } },
  { id: 'hat-pizza', kind: 'hat', name: '披薩', price: 300, asset: 'food/pizza', fit: { width: 9.5, baseY: 7.9 } },
  { id: 'hat-cake', kind: 'hat', name: '生日蛋糕', price: 500, asset: 'food/cake', fit: { width: 8, baseY: 7.6 } },
  { id: 'hat-turkey', kind: 'hat', name: '烤火雞', price: 500, asset: 'food/turkey', fit: { width: 9, baseY: 7.7 } },
  { id: 'hat-coffee', kind: 'hat', name: '咖啡杯', price: 300, asset: 'food/cup-coffee', fit: { width: 6.5, baseY: 7.8 } },
  { id: 'hat-donut', kind: 'hat', name: '甜甜圈', price: 300, asset: 'food/donut-sprinkles', fit: { width: 8.5, baseY: 7.9 } },
  { id: 'hat-present', kind: 'hat', name: '禮物盒', price: 600, asset: 'holiday/present-a-cube', fit: { width: 7.5, baseY: 7.7 } },
  { id: 'hat-tree', kind: 'hat', name: '小聖誕樹', price: 900, asset: 'holiday/tree-snow-a', fit: { width: 7, baseY: 7.6 } },
];

/** 服裝：<id, 貼圖檔名, 顯示名, 價格> */
const OUTFIT_SOURCE: [string, string, string, number][] = [
  // 自製貼圖（scripts/gen-outfits.mts 產生），不是任何角色的原始外觀
  ['outfit-gown', 'outfit-gown', '婚紗', 2000],
  ['outfit-y2k', 'outfit-y2k', 'Y2K 辣妹裝', 1200],
  ['outfit-swim', 'outfit-swim', '泳褲', 900],
  ['outfit-bikini', 'outfit-bikini', '比基尼', 900],
  ['outfit-boss', 'texture-q', '老闆的西裝', 1500],
  ['outfit-officer', 'texture-j', '警察制服', 1200],
  ['outfit-ninja', 'texture-r', '忍者裝', 1200],
  ['outfit-pirate', 'texture-p', '海盜服', 1000],
  ['outfit-ranger', 'texture-m', '探險家裝', 800],
  ['outfit-kimono', 'texture-n', '和服', 800],
  ['outfit-robot', 'texture-g', '機器人外殼', 1000],
  ['outfit-robot2', 'texture-h', '紫電外殼', 1000],
  ['outfit-zombie', 'texture-l', '殭屍皮', 700],
  ['outfit-zombie2', 'texture-o', '殭屍大叔皮', 700],
  ['outfit-dummy', 'texture-d', '假人裝', 600],
  ['outfit-ally', 'texture-a', '艾莉的便服', 500],
  ['outfit-kai', 'texture-b', '阿凱的便服', 500],
  ['outfit-david', 'texture-c', '大衛的便服', 500],
  ['outfit-violet', 'texture-e', '小紫的便服', 500],
  ['outfit-lily', 'texture-f', '莉莉的便服', 500],
  ['outfit-chou', 'texture-i', '老周的便服', 500],
  ['outfit-derek', 'texture-k', '阿德的便服', 500],
];

const outfits: ShopItem[] = OUTFIT_SOURCE.map(([id, asset, name, price]) => ({ id, kind: 'outfit', name, price, asset }));

/**
 * 武器：asset 是 weapons.ts 裡的武器 id。買下後可在福利社裝備成隨身武器，
 * 進場就拿在手上、丟不掉、倒地重生後還在，彈藥打完會自動慢慢回填。
 * 強度一律對齊撿得到的食物武器，賣的是造型與方便。
 */
const WEAPON_SOURCE: [string, string, string, number][] = [
  ['weapon-pocket', 'blaster-pocket', '口袋泡棉槍', 800],
  ['weapon-rapid', 'blaster-rapid', '連發泡棉槍', 1200],
  ['weapon-rifle', 'blaster-rifle', '會議室步槍', 1600],
  ['weapon-heavy', 'blaster-heavy', '重裝泡棉砲', 2200],
  ['weapon-sniper', 'blaster-sniper', '遠端工作狙擊槍', 2800],
];

const weapons: ShopItem[] = WEAPON_SOURCE.map(([id, asset, name, price]) => ({ id, kind: 'weapon', name, price, asset }));

/**
 * 跟班寵物：asset 是 pets.ts 的寵物種類 id。
 * 買下後在福利社帶上，牠會一直跟在你身後，不會被任何人打死、也抱不走。
 * 和場上隨機出現的野生寵物是兩回事。
 */
const PET_SOURCE: [string, string, string, number][] = [
  ['pet-cat', 'cat', '小貓', 1500],
  ['pet-dog', 'dog', '小狗', 1500],
  ['pet-bunny', 'bunny', '兔兔', 1800],
  ['pet-chick', 'chick', '小雞', 1200],
  ['pet-penguin', 'penguin', '企鵝', 2400],
  ['pet-fox', 'fox', '狐狸', 2400],
  ['pet-panda', 'panda', '熊貓', 3000],
  ['pet-pig', 'pig', '小豬', 1800],
  ['pet-koala', 'koala', '無尾熊', 2400],
  ['pet-monkey', 'monkey', '猴子', 2000],
];

const pets: ShopItem[] = PET_SOURCE.map(([id, asset, name, price]) => ({ id, kind: 'pet', name, price, asset }));

export const SHOP_ITEMS: ShopItem[] = [...hats, ...outfits, ...weapons, ...pets];

export const SHOP_ITEM_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

export function getShopItem(id: string): ShopItem | null {
  return SHOP_ITEM_BY_ID.get(id) ?? null;
}

/** 檢查某個 id 是不是指定類型的合法商品（穿戴驗證用；空字串代表脫下） */
export function isItemOfKind(id: string, kind: ShopItem['kind']): boolean {
  if (id === '') return true;
  return SHOP_ITEM_BY_ID.get(id)?.kind === kind;
}
