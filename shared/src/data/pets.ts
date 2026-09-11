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
