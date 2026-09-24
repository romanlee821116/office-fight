/** 辦公室寵物（Kenney Cube Pets，CC0）。model 對應 client/public/models/pets/<model>.glb */
export interface PetDef {
  id: string;
  name: string;
  model: string;
}

export const PETS: PetDef[] = [
  { id: 'cat', name: '小貓', model: 'animal-cat' },
  { id: 'dog', name: '小狗', model: 'animal-dog' },
  { id: 'bunny', name: '兔兔', model: 'animal-bunny' },
  { id: 'chick', name: '小雞', model: 'animal-chick' },
  { id: 'penguin', name: '企鵝', model: 'animal-penguin' },
  { id: 'fox', name: '狐狸', model: 'animal-fox' },
  { id: 'panda', name: '熊貓', model: 'animal-panda' },
  { id: 'pig', name: '小豬', model: 'animal-pig' },
  { id: 'koala', name: '無尾熊', model: 'animal-koala' },
  { id: 'monkey', name: '猴子', model: 'animal-monkey' },
];

export const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));

export function getPet(id: string): PetDef {
  return PET_BY_ID.get(id) ?? PETS[0];
}

/** 體型倍率：每餵一次線性長大，餵滿 PET.feedMax 次為 2 倍 */
export function petSizeFactor(feedCount: number, feedMax: number): number {
  return 1 + Math.min(Math.max(feedCount, 0), feedMax) / feedMax;
}

/** 寵物染色的固定色票；id 存進資料庫，空字串代表原色 */
export interface PetTintDef {
  id: string;
  name: string;
  /** 目標顏色，貼圖改寫時取它的色相與飽和度 */
  color: string;
}

export const PET_TINTS: PetTintDef[] = [
  { id: 'rose', name: '櫻花粉', color: '#FF8AB8' },
  { id: 'sky', name: '天空藍', color: '#6BB8FF' },
  { id: 'mint', name: '薄荷綠', color: '#5FD0A8' },
  { id: 'butter', name: '奶油黃', color: '#FFCE5C' },
  { id: 'lavender', name: '薰衣草', color: '#B39DFF' },
  { id: 'coral', name: '珊瑚橘', color: '#FF8C61' },
  { id: 'charcoal', name: '墨黑', color: '#5A5A68' },
  { id: 'cream', name: '奶茶', color: '#D8B58C' },
];

export const PET_TINT_BY_ID = new Map(PET_TINTS.map((t) => [t.id, t]));

export function getPetTint(id: string): PetTintDef | null {
  return PET_TINT_BY_ID.get(id) ?? null;
}

/** 染一次的價錢，換色要再付一次 */
export const PET_TINT_PRICE = 400;
