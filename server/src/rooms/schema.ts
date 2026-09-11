import { MapSchema, Schema, type } from '@colyseus/schema';
import type { AnimState } from '@office/shared';

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
  @type('number') lastSeen: number = 0;
}

export class Pickup extends Schema {
  @type('string') id: string = '';
  @type('string') weaponId: string = '';
  @type('number') x: number = 0;
  @type('number') z: number = 0;
  @type('number') y: number = 0;
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Pickup }) pickups = new MapSchema<Pickup>();
}
