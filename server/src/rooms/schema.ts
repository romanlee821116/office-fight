import { MapSchema, Schema, type } from '@colyseus/schema';
import type { AnimState, PetAnim } from '@office/shared';

export class Player extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('string') avatarId: string = '';
  @type('number') x: number = 0;
  @type('number') z: number = 0;
  @type('number') rotY: number = 0;
  @type('string') anim: AnimState = 'idle';
  @type('string') status: string = '';
  @type('string') seatId: string = '';
  @type('boolean') fightMode: boolean = false;
  @type('number') hp: number = 200;
  @type('string') duelWith: string = '';
  @type('string') weaponId: string = '';
  @type('number') ammo: number = 0;
  @type('boolean') onFire: boolean = false;
  @type('number') lastSeen: number = 0;
}

export class Pickup extends Schema {
  @type('string') id: string = '';
  @type('string') weaponId: string = '';
  @type('number') x: number = 0;
  @type('number') z: number = 0;
  @type('number') y: number = 0;
}

export class Pet extends Schema {
  @type('string') id: string = '';
  @type('string') petType: string = '';
  @type('number') x: number = 0;
  @type('number') z: number = 0;
  @type('number') rotY: number = 0;
  @type('string') anim: PetAnim = 'idle';
  @type('number') hp: number = 100;
  @type('string') carrierId: string = '';
  @type('number') feedCount: number = 0;
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Pickup }) pickups = new MapSchema<Pickup>();
  @type({ map: Pet }) pets = new MapSchema<Pet>();
  /** 瓦斯爐上的食物（weapon id，空字串 = 沒有） */
  @type('string') stoveFoodId: string = '';
  /** '' | 'cooking' | 'burning' */
  @type('string') stoveStage: string = '';
}
