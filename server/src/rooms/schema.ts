import { MapSchema, Schema, type } from '@colyseus/schema';
import { NPC, type AnimState, type PetAnim } from '@office/shared';

export class Player extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('string') avatarId: string = '';
  @type('float32') x: number = 0;
  @type('float32') z: number = 0;
  @type('float32') rotY: number = 0;
  @type('string') anim: AnimState = 'idle';
  @type('string') status: string = '';
  @type('string') seatId: string = '';
  @type('boolean') fightMode: boolean = false;
  @type('number') hp: number = 200;
  @type('string') duelWith: string = '';
  @type('string') weaponId: string = '';
  @type('number') ammo: number = 0;
  @type('boolean') onFire: boolean = false;
}

export class Pickup extends Schema {
  @type('string') id: string = '';
  @type('string') weaponId: string = '';
  @type('float32') x: number = 0;
  @type('float32') z: number = 0;
  @type('float32') y: number = 0;
}

export class Pet extends Schema {
  @type('string') id: string = '';
  @type('string') petType: string = '';
  @type('float32') x: number = 0;
  @type('float32') z: number = 0;
  @type('float32') rotY: number = 0;
  @type('string') anim: PetAnim = 'idle';
  @type('number') hp: number = 100;
  @type('string') carrierId: string = '';
  @type('number') feedCount: number = 0;
}

/** 路人 NPC：場上固定一位，不會攻擊人，但可以被打倒 */
export class Npc extends Schema {
  @type('float32') x: number = 0;
  @type('float32') z: number = 0;
  @type('float32') rotY: number = 0;
  @type('string') anim: AnimState = 'idle';
  @type('number') hp: number = NPC.maxHp;
  /** 正在拖他的玩家 sessionId */
  @type('string') carrierId: string = '';
  /** '' | 'stove' | 'pond' */
  @type('string') pinnedAt: string = '';
  @type('boolean') onFire: boolean = false;
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Pickup }) pickups = new MapSchema<Pickup>();
  @type({ map: Pet }) pets = new MapSchema<Pet>();
  /** 路人 NPC（固定一位，始終存在） */
  @type(Npc) npc = new Npc();
  /** 瓦斯爐上的食物（weapon id，空字串 = 沒有） */
  @type('string') stoveFoodId: string = '';
  /** '' | 'cooking' | 'burning' */
  @type('string') stoveStage: string = '';
  /** 烤箱裡的食物（weapon id，空字串 = 沒有）；烤好後會換成烤過的版本 */
  @type('string') ovenFoodId: string = '';
  /** '' | 'baking' | 'done' */
  @type('string') ovenStage: string = '';
  /** 匹克球：idle | waiting | countdown | rally | between | over */
  @type('string') courtStatus: string = 'idle';
  @type('string') courtPlayerA: string = '';
  @type('string') courtPlayerB: string = '';
  @type('uint8') courtScoreA: number = 0;
  @type('uint8') courtScoreB: number = 0;
  /** WMO 天氣代碼，-1 = 尚未取得 */
  @type('number') weatherCode: number = -1;
  @type('number') weatherTemp: number = 0;
  @type('boolean') weatherIsDay: boolean = true;
}
