import { Room, type Client } from '@colyseus/core';
import {
  ANIM_STATES,
  AVATAR_IDS,
  DUEL,
  FIGHT,
  IDLE,
  PET,
  PETS,
  getPet,
  DUMBBELL_RACK_SLOTS,
  PICKUPS,
  SEAT_BY_ID,
  SPAWNABLE_WEAPONS,
  WEAPON_BY_ID,
  SEAT_INTERACT_DISTANCE,
  CHAT_RATE_LIMIT,
  DEFAULT_AVATAR_ID,
  MAX_CLIENTS,
  Messages,
  RECONNECT_WINDOW_SEC,
  RUN_SPEED,
  SPAWN_POINT,
  SYNC_INTERVAL_MS,
  findFreeSpawn,
  moveWithCollision,
  resolveAll,
  resolvePosition,
  sanitizeChat,
  sanitizeName,
  sanitizeStatus,
  seatDistance,
  standPointForSeat,
  type ChatMessage,
  type DuelAction,
  type DuelEvent,
  type HitEvent,
  type IdleEvent,
  type JoinOptions,
  type MovePayload,
  type PickupPayload,
  type ProjectileEvent,
  type RespawnEvent,
  type SitPayload,
  type SystemMessage,
  type WeaponDef,
} from '@office/shared';
import { logger } from '../logger';
import { OfficeState, Pet, Pickup, Player } from './schema';

/** 拳頭 */
const FIST: WeaponDef = {
  id: '',
  name: '拳頭',
  model: '',
  kind: 'melee',
  damage: FIGHT.damage,
  range: FIGHT.range,
  knockback: FIGHT.knockback,
  cooldownMs: FIGHT.cooldownMs,
  scale: 1,
  grip: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
};

const ANIMS = new Set<string>(ANIM_STATES);

/** 進場密碼：設定 JOIN_CODE 環境變數後，所有人進場都需輸入（公開網址部署時務必設定） */
const JOIN_CODE = (process.env.JOIN_CODE ?? '').trim();

/** 坐下距離的伺服端容忍（客戶端預測 + 網路延遲） */
const SIT_DISTANCE_TOLERANCE = 0.6;

/** 速度驗證容忍係數（網路抖動 + 客戶端插補） */
const SPEED_TOLERANCE = 1.6;
const MIN_DT_MS = 10;

interface ClientMeta {
  lastMoveAt: number;
  chatTimestamps: number[];
  lastAttackAt: number;
  respawnTimer: { clear(): void } | null;
  /** 分頁切到背景的時間戳，null 代表分頁在前景 */
  hiddenSince: number | null;
  /** 已發出閒置警告，避免重複發送 */
  idleWarned: boolean;
}

/** 讓前端不要自動重連的關閉碼（等同使用者主動離開） */
const CLOSE_CONSENTED = 4000;

interface PetAi {
  mode: 'idle' | 'walk' | 'dance';
  until: number;
  tx: number;
  tz: number;
  staggerUntil: number;
}

function randIn([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function clampNum(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

interface DuelInvite {
  fromId: string;
  toId: string;
  expiresAt: number;
  timer: { clear(): void };
}

interface Duel {
  aId: string;
  bId: string;
  startsAt: number;
}

export class OfficeRoom extends Room<OfficeState> {
  maxClients = MAX_CLIENTS;
  patchRate = SYNC_INTERVAL_MS;

  private meta = new Map<string, ClientMeta>();
  private chatSeq = 0;
  /** 以被邀請者 id 為 key 的待回應邀請（一人同時只會有一個） */
  private invites = new Map<string, DuelInvite>();
  private duels: Duel[] = [];
  private pickupSeq = 0;
  private projectileSeq = 0;
  private petSeq = 0;
  private petAi = new Map<string, PetAi>();

  /** 註冊訊息處理，並統一把任何操作記為活動時間（閒置判定用） */
  private onPlayerMessage<T>(type: string, handler: (client: Client, payload: T) => void): void {
    this.onMessage<T>(type, (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      const meta = this.meta.get(client.sessionId);
      if (player) player.lastSeen = Date.now();
      if (meta?.idleWarned) {
        meta.idleWarned = false;
        client.send(Messages.idle, { kind: 'clear' } satisfies IdleEvent);
      }
      handler(client, payload);
    });
  }

  onCreate(): void {
    this.setState(new OfficeState());

    this.onPlayerMessage<MovePayload>(Messages.move, (client, payload) => this.handleMove(client, payload));
    this.onPlayerMessage<string>(Messages.setStatus, (client, text) => this.handleStatus(client, text));
    this.onPlayerMessage<SitPayload>(Messages.sit, (client, payload) => this.handleSit(client, payload));
    this.onPlayerMessage(Messages.stand, (client) => this.handleStand(client));
    this.onPlayerMessage<boolean>(Messages.toggleFight, (client, on) => this.handleToggleFight(client, on));
    this.onPlayerMessage(Messages.attack, (client) => this.handleAttack(client));
    this.onPlayerMessage<DuelAction>(Messages.duel, (client, action) => this.handleDuel(client, action));
    this.onPlayerMessage<PickupPayload>(Messages.pickup, (client, payload) => this.handlePickup(client, payload));
    this.onPlayerMessage(Messages.drop, (client) => this.handleDrop(client));
    this.onPlayerMessage<string>(Messages.chat, (client, text) => this.handleChat(client, text));
    // 分頁顯示狀態本身不算「操作」，所以不走 onPlayerMessage
    this.onMessage<boolean>(Messages.visibility, (client, hidden) => this.handleVisibility(client, hidden));

    for (let i = 0; i < PICKUPS.initial; i++) this.spawnPickup();
    for (const slot of DUMBBELL_RACK_SLOTS) this.addPickup('dumbbell', slot.x, slot.z, slot.y, false);
    this.clock.setInterval(() => this.spawnPickup(), PICKUPS.intervalMs);
    this.clock.setInterval(() => this.checkIdlePlayers(), IDLE.checkIntervalMs);

    for (let i = 0; i < PET.count; i++) this.spawnPet(false);
    this.clock.setInterval(() => this.tickPets(), PET.aiTickMs);

    logger.info(`房間建立：${this.roomId}`);
  }

  private handleVisibility(client: Client, hidden: boolean): void {
    const meta = this.meta.get(client.sessionId);
    if (!meta) return;
    if (hidden) {
      meta.hiddenSince = meta.hiddenSince ?? Date.now();
      return;
    }
    // 回到前景視為活動，清掉警告
    meta.hiddenSince = null;
    const player = this.state.players.get(client.sessionId);
    if (player) player.lastSeen = Date.now();
    if (meta.idleWarned) {
      meta.idleWarned = false;
      client.send(Messages.idle, { kind: 'clear' } satisfies IdleEvent);
    }
  }

  /**
   * 閒置檢查：分頁在背景過久，或完全沒有操作過久，就先警告再請對方離開。
   * 目的是讓忘記關的分頁不會一直讓免費雲端方案保持喚醒。
   */
  private checkIdlePlayers(): void {
    const now = Date.now();
    for (const player of [...this.state.players.values()]) {
      const meta = this.meta.get(player.id);
      if (!meta) continue;

      const hiddenFor = meta.hiddenSince ? now - meta.hiddenSince : 0;
      const inactiveFor = now - player.lastSeen;
      const reason: IdleEvent['reason'] | null =
        hiddenFor >= IDLE.hiddenMs ? 'hidden' : inactiveFor >= IDLE.inactiveMs ? 'inactive' : null;

      if (reason) {
        this.kickIdle(player.id, player.name, reason);
        continue;
      }

      const warnHidden = meta.hiddenSince !== null && hiddenFor >= IDLE.hiddenMs - IDLE.warnBeforeMs;
      const warnInactive = inactiveFor >= IDLE.inactiveMs - IDLE.warnBeforeMs;
      if (!meta.idleWarned && (warnHidden || warnInactive)) {
        meta.idleWarned = true;
        const remainingMs = warnHidden ? IDLE.hiddenMs - hiddenFor : IDLE.inactiveMs - inactiveFor;
        const client = this.clients.find((c) => c.sessionId === player.id);
        client?.send(Messages.idle, { kind: 'warn', reason: warnHidden ? 'hidden' : 'inactive', remainingMs } satisfies IdleEvent);
      }
    }
  }

  private kickIdle(sessionId: string, name: string, reason: NonNullable<IdleEvent['reason']>): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    this.broadcastSystem(`${name} 閒置過久，已自動離開`);
    logger.info(`閒置移出：${name}（${reason}）`);
    if (!client) return;
    client.send(Messages.idle, { kind: 'kick', reason } satisfies IdleEvent);
    // 用 consented 關閉碼，前端才不會嘗試自動重連
    client.leave(CLOSE_CONSENTED);
  }

  onJoin(client: Client, options: JoinOptions): void {
    // 進場密碼（與暱稱驗證同一條路徑：throw 會被 Colyseus 轉成前端可讀的錯誤）
    if (JOIN_CODE && (typeof options?.joinCode !== 'string' || options.joinCode.trim() !== JOIN_CODE)) {
      throw new Error('進場密碼不正確');
    }

    const name = sanitizeName(options?.name);
    if (!name) {
      throw new Error('暱稱需為 2～12 個字');
    }
    const avatarId = AVATAR_IDS.has(options?.avatarId) ? options.avatarId : DEFAULT_AVATAR_ID;

    const player = new Player();
    player.id = client.sessionId;
    player.name = name;
    player.avatarId = avatarId;
    const spawn = findFreeSpawn(SPAWN_POINT, this.obstaclePlayers());
    player.x = spawn.x;
    player.z = spawn.z;
    player.rotY = 0; // 面向 +Z（鏡頭側）
    player.anim = 'idle';
    player.status = '';
    player.seatId = '';
    player.fightMode = false;
    player.hp = FIGHT.maxHp;
    player.duelWith = '';
    player.weaponId = '';
    player.ammo = 0;
    player.lastSeen = Date.now();

    this.state.players.set(client.sessionId, player);
    this.meta.set(client.sessionId, {
      lastMoveAt: 0,
      chatTimestamps: [],
      lastAttackAt: 0,
      respawnTimer: null,
      hiddenSince: null,
      idleWarned: false,
    });

    this.broadcastSystem(`${name} 進入了辦公室`);
    logger.info(`加入：${name} (${client.sessionId})，目前 ${this.state.players.size} 人`);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    // onJoin 驗證失敗被拒絕的連線沒有對應玩家，直接略過
    if (!player) return;
    const name = player.name;

    if (!consented) {
      try {
        logger.info(`斷線：${name}，等待重連 ${RECONNECT_WINDOW_SEC} 秒`);
        await this.allowReconnection(client, RECONNECT_WINDOW_SEC);
        logger.info(`重連成功：${name}`);
        return;
      } catch {
        // 逾時未重連，往下清理
      }
    }

    this.meta.get(client.sessionId)?.respawnTimer?.clear();
    this.clearInvitesFor(client.sessionId);
    if (player.duelWith) {
      const opponent = this.state.players.get(player.duelWith);
      if (opponent) this.endDuel(opponent, player, 'forfeit');
    }
    this.dropWeapon(player);
    this.state.players.delete(client.sessionId);
    this.meta.delete(client.sessionId);
    this.broadcastSystem(`${name} 離開了辦公室`);
    logger.info(`離開：${name}，目前 ${this.state.players.size} 人`);
  }

  onDispose(): void {
    logger.info(`房間釋放：${this.roomId}`);
  }

  private handleMove(client: Client, payload: MovePayload): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || !payload) return;
    // 坐著或倒地時位置由伺服端鎖定
    if (player.seatId || player.hp <= 0) return;

    const { x, z, rotY, anim } = payload;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotY)) return;

    const now = Date.now();
    const dtMs = meta.lastMoveAt ? Math.max(now - meta.lastMoveAt, MIN_DT_MS) : SYNC_INTERVAL_MS;
    const dist = Math.hypot(x - player.x, z - player.z);
    const maxDist = (RUN_SPEED * dtMs) / 1000 * SPEED_TOLERANCE + 0.1;
    if (dist > maxDist) {
      // 速度異常：拒絕這次更新，保留伺服端版本
      logger.warn(`拒絕移動：${player.name} 位移 ${dist.toFixed(2)}m / ${dtMs}ms`);
      meta.lastMoveAt = now;
      return;
    }

    const resolved = resolveAll(x, z, this.obstaclePlayers(player.id));
    player.x = resolved.x;
    player.z = resolved.z;
    player.rotY = rotY;
    player.anim = ANIMS.has(anim) ? anim : 'idle';
    player.lastSeen = now;
    meta.lastMoveAt = now;
  }

  private handleSit(client: Client, payload: SitPayload): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || player.seatId || player.hp <= 0 || player.duelWith) return;

    const seat = SEAT_BY_ID.get(payload?.seatId ?? '');
    if (!seat) return;
    if (seatDistance(seat, player.x, player.z) > SEAT_INTERACT_DISTANCE + SIT_DISTANCE_TOLERANCE) return;
    for (const other of this.state.players.values()) {
      if (other.seatId === seat.id) return; // 已有人
    }

    player.seatId = seat.id;
    player.x = seat.x;
    player.z = seat.z;
    player.rotY = seat.rotY;
    player.anim = seat.anim;
    player.lastSeen = Date.now();
    meta.lastMoveAt = Date.now();
  }

  private handleStand(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || !player.seatId) return;

    const seat = SEAT_BY_ID.get(player.seatId);
    const point = seat ? standPointForSeat(seat) : { x: player.x, z: player.z };
    player.seatId = '';
    player.x = point.x;
    player.z = point.z;
    player.anim = 'idle';
    player.lastSeen = Date.now();
    meta.lastMoveAt = Date.now();
  }

  private handleToggleFight(client: Client, on: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.duelWith) return;
    player.fightMode = Boolean(on);
    if (player.fightMode) player.hp = FIGHT.maxHp;
  }

  /** 是否可作為 attacker 的攻擊目標（格鬥模式、存活、決鬥規則） */
  private canTarget(attacker: Player, other: Player): boolean {
    if (other === attacker || !other.fightMode || other.hp <= 0) return false;
    if (attacker.duelWith ? other.id !== attacker.duelWith : other.duelWith !== '') return false;
    return true;
  }

  /** 攻擊：依手上武器決定近戰揮擊或投射物 */
  private handleAttack(client: Client): void {
    const attacker = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!attacker || !meta || !attacker.fightMode || attacker.hp <= 0 || attacker.seatId) return;

    const weapon = WEAPON_BY_ID.get(attacker.weaponId) ?? FIST;
    const now = Date.now();
    if (now - meta.lastAttackAt < weapon.cooldownMs) return;
    meta.lastAttackAt = now;

    // 決鬥中：倒數期間不能出拳，且只能打對手；非決鬥者打不到決鬥中的人
    const duel = attacker.duelWith ? this.findDuel(attacker.id) : null;
    if (attacker.duelWith && (!duel || now < duel.startsAt)) return;

    const fx = Math.sin(attacker.rotY);
    const fz = Math.cos(attacker.rotY);

    if (weapon.kind === 'melee') {
      let target: Player | null = null;
      let bestDist = weapon.range;
      for (const other of this.state.players.values()) {
        if (!this.canTarget(attacker, other)) continue;
        const dx = other.x - attacker.x;
        const dz = other.z - attacker.z;
        const dist = Math.hypot(dx, dz);
        if (dist > bestDist || dist < 1e-3) continue;
        if ((dx * fx + dz * fz) / dist < FIGHT.coneCos) continue;
        target = other;
        bestDist = dist;
      }
      if (!target) {
        // 沒有玩家目標時看看有沒有寵物
        const pet = this.findPetTarget(attacker, fx, fz, weapon.range);
        if (pet) {
          const dx = pet.x - attacker.x;
          const dz = pet.z - attacker.z;
          const len = Math.hypot(dx, dz) || 1;
          this.applyHitToPet(attacker, pet, dx / len, dz / len, weapon, len * 0.6);
        }
        return;
      }
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const len = Math.hypot(dx, dz) || 1;
      this.applyHit(attacker, target, dx / len, dz / len, weapon, len * 0.6);
      return;
    }

    // 投擲 / 射擊：沿面向方向的走廊找最近目標，命中在飛行到達時才結算
    let target: Player | null = null;
    let travel = weapon.range;
    for (const other of this.state.players.values()) {
      if (!this.canTarget(attacker, other)) continue;
      const dx = other.x - attacker.x;
      const dz = other.z - attacker.z;
      const along = dx * fx + dz * fz;
      if (along <= 0.2 || along > travel) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > PICKUPS.corridorHalfWidth) continue;
      target = other;
      travel = along;
    }

    // 走廊內沒有玩家時，看看有沒有寵物（決鬥中不行）
    let petTarget: Pet | null = null;
    if (!target && !attacker.duelWith) {
      for (const pet of this.state.pets.values()) {
        if (pet.anim === 'dead') continue;
        const dx = pet.x - attacker.x;
        const dz = pet.z - attacker.z;
        const along = dx * fx + dz * fz;
        if (along <= 0.2 || along > travel) continue;
        const side = Math.abs(dx * fz - dz * fx);
        if (side > PICKUPS.corridorHalfWidth) continue;
        petTarget = pet;
        travel = along;
      }
    }

    const speed = weapon.projectileSpeed ?? 10;
    const model = weapon.kind === 'shoot' ? (weapon.projectileModel ?? weapon.model) : weapon.model;
    const event: ProjectileEvent = {
      id: `p${++this.projectileSeq}`,
      shooterId: attacker.id,
      weaponId: weapon.id,
      model,
      kind: weapon.kind,
      fromX: attacker.x,
      fromZ: attacker.z,
      dirX: fx,
      dirZ: fz,
      distance: travel,
      speed,
    };
    this.broadcast(Messages.projectile, event);

    if (weapon.kind === 'throw') {
      attacker.weaponId = '';
      attacker.ammo = 0;
    } else {
      attacker.ammo = Math.max(0, attacker.ammo - 1);
      if (attacker.ammo === 0) attacker.weaponId = '';
    }

    const targetId = target?.id ?? null;
    const petId = petTarget?.id ?? null;
    const flightMs = (travel / speed) * 1000;
    const attackerId = attacker.id;
    this.clock.setTimeout(() => {
      const shooter = this.state.players.get(attackerId);
      const victim = targetId ? this.state.players.get(targetId) : null;
      let landX = event.fromX + fx * travel;
      let landZ = event.fromZ + fz * travel;
      if (shooter && victim && this.canTarget(shooter, victim)) {
        this.applyHit(shooter, victim, fx, fz, weapon, 0);
        landX = victim.x;
        landZ = victim.z;
      } else if (shooter && petId) {
        const pet = this.state.pets.get(petId);
        if (pet && pet.anim !== 'dead') {
          this.applyHitToPet(shooter, pet, fx, fz, weapon, 0);
          landX = pet.x;
          landZ = pet.z;
        }
      }
      // 丟出去的食物落地後可以再撿
      if (weapon.kind === 'throw') this.addPickup(weapon.id, landX, landZ);
    }, flightMs);
  }

  /** 結算一次命中：扣血、擊退、倒地、廣播 */
  private applyHit(attacker: Player, target: Player, dirX: number, dirZ: number, weapon: WeaponDef, impactOffset: number): void {
    const now = Date.now();
    const targetMeta = this.meta.get(target.id);

    if (target.seatId) target.seatId = '';
    const to = moveWithCollision(
      { x: target.x, z: target.z },
      dirX * weapon.knockback,
      dirZ * weapon.knockback,
      undefined,
      this.obstaclePlayers(target.id),
    );
    const impactX = impactOffset ? attacker.x + dirX * impactOffset : target.x;
    const impactZ = impactOffset ? attacker.z + dirZ * impactOffset : target.z;
    target.x = to.x;
    target.z = to.z;
    target.rotY = Math.atan2(-dirX, -dirZ); // 面向攻擊者
    target.hp = Math.max(0, target.hp - weapon.damage);
    target.lastSeen = now;
    if (targetMeta) targetMeta.lastMoveAt = now;

    const killed = target.hp === 0;
    if (killed) {
      target.anim = 'dead';
      this.dropWeapon(target);
      if (attacker.duelWith === target.id) this.endDuel(attacker, target, 'ko');
      else this.broadcastSystem(`${attacker.name} 用${weapon.name}擊倒了 ${target.name}`);
      const targetId = target.id;
      targetMeta?.respawnTimer?.clear();
      if (targetMeta) targetMeta.respawnTimer = this.clock.setTimeout(() => this.respawn(targetId), FIGHT.respawnMs);
    } else {
      target.anim = 'hit';
    }

    const event: HitEvent = {
      attackerId: attacker.id,
      targetId: target.id,
      x: impactX,
      z: impactZ,
      dirX,
      dirZ,
      toX: to.x,
      toZ: to.z,
      hp: target.hp,
      killed,
    };
    this.broadcast(Messages.hit, event);
  }

  // ---------- 武器道具 ----------

  /** 放一個道具；resolve=false 時保留原座標（架上的啞鈴位於架子的碰撞盒內） */
  private addPickup(weaponId: string, x: number, z: number, y = 0, resolve = true): void {
    const pos = resolve ? resolvePosition(x, z) : { x, z };
    const pickup = new Pickup();
    pickup.id = `w${++this.pickupSeq}`;
    pickup.weaponId = weaponId;
    pickup.x = pos.x;
    pickup.z = pos.z;
    pickup.y = y;
    this.state.pickups.set(pickup.id, pickup);
  }

  /** 定時在空地隨機生成一把武器 */
  private spawnPickup(): void {
    // 架上的啞鈴不算在隨機生成的上限內
    let randomCount = 0;
    for (const p of this.state.pickups.values()) if (WEAPON_BY_ID.get(p.weaponId)?.spawnable !== false) randomCount++;
    if (randomCount >= PICKUPS.max) return;
    const { area, clearance } = PICKUPS;
    for (let attempt = 0; attempt < 20; attempt++) {
      const raw = { x: area.minX + Math.random() * (area.maxX - area.minX), z: area.minZ + Math.random() * (area.maxZ - area.minZ) };
      const pos = resolvePosition(raw.x, raw.z);
      // 被家具推開太多代表落在家具裡，換一個點
      if (Math.hypot(pos.x - raw.x, pos.z - raw.z) > 0.05) continue;
      let clear = true;
      for (const p of this.state.pickups.values()) if (Math.hypot(p.x - pos.x, p.z - pos.z) < clearance) clear = false;
      for (const p of this.state.players.values()) if (Math.hypot(p.x - pos.x, p.z - pos.z) < clearance) clear = false;
      if (!clear) continue;
      const weapon = SPAWNABLE_WEAPONS[Math.floor(Math.random() * SPAWNABLE_WEAPONS.length)];
      this.addPickup(weapon.id, pos.x, pos.z);
      return;
    }
  }

  private handlePickup(client: Client, payload: PickupPayload): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const pickup = this.state.pickups.get(payload?.pickupId ?? '');
    if (!pickup) return;
    if (Math.hypot(pickup.x - player.x, pickup.z - player.z) > PICKUPS.interactDistance + 0.6) return;
    const weapon = WEAPON_BY_ID.get(pickup.weaponId);
    if (!weapon) {
      this.state.pickups.delete(pickup.id);
      return;
    }
    // 手上已有武器：放回原地交換
    if (player.weaponId) this.dropWeapon(player);
    this.state.pickups.delete(pickup.id);
    player.weaponId = weapon.id;
    player.ammo = weapon.ammo ?? 0;
  }

  private handleDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0) return;
    this.dropWeapon(player);
  }

  /** 把手上的武器放到腳邊（蛋糕若已用過幾發仍可撿，彈藥重算） */
  private dropWeapon(player: Player): void {
    if (!player.weaponId) return;
    this.addPickup(player.weaponId, player.x + 0.4, player.z + 0.4);
    player.weaponId = '';
    player.ammo = 0;
  }

  private handleDuel(client: Client, action: DuelAction): void {
    const me = this.state.players.get(client.sessionId);
    if (!me || !action) return;

    if (action.action === 'invite') {
      const target = this.state.players.get(action.targetId);
      if (!target || target === me || me.duelWith || me.hp <= 0) return;
      if (target.duelWith || target.hp <= 0 || this.invites.has(target.id) || this.hasOutgoingInvite(me.id)) {
        this.sendDuel(client, { kind: 'declined', byId: target.id, byName: target.name, reason: 'busy' });
        return;
      }
      const expiresAt = Date.now() + DUEL.inviteTtlMs;
      const timer = this.clock.setTimeout(() => this.expireInvite(target.id), DUEL.inviteTtlMs);
      this.invites.set(target.id, { fromId: me.id, toId: target.id, expiresAt, timer });
      this.sendDuel(client, { kind: 'sent', toId: target.id, toName: target.name, expiresAt });
      this.sendDuelTo(target.id, { kind: 'invite', fromId: me.id, fromName: me.name, expiresAt });
      return;
    }

    const invite = this.invites.get(me.id);
    if (!invite || invite.fromId !== action.fromId) return;
    invite.timer.clear();
    this.invites.delete(me.id);
    const from = this.state.players.get(invite.fromId);
    if (!from) return;

    if (action.action === 'decline') {
      this.sendDuelTo(from.id, { kind: 'declined', byId: me.id, byName: me.name, reason: 'declined' });
      return;
    }

    // accept：雙方需仍可決鬥
    if (from.duelWith || from.hp <= 0 || me.duelWith || me.hp <= 0) {
      this.sendDuelTo(from.id, { kind: 'declined', byId: me.id, byName: me.name, reason: 'busy' });
      return;
    }
    this.startDuel(from, me);
  }

  private startDuel(a: Player, b: Player): void {
    for (const p of [a, b]) {
      p.duelWith = p === a ? b.id : a.id;
      p.fightMode = true;
      p.hp = FIGHT.maxHp;
      if (p.seatId) {
        const seat = SEAT_BY_ID.get(p.seatId);
        const point = seat ? standPointForSeat(seat) : { x: p.x, z: p.z };
        p.seatId = '';
        p.x = point.x;
        p.z = point.z;
        p.anim = 'idle';
      }
    }
    const startsAt = Date.now() + DUEL.countdownMs;
    this.duels.push({ aId: a.id, bId: b.id, startsAt });
    this.broadcast(Messages.duel, { kind: 'start', aId: a.id, bId: b.id, startsAt } satisfies DuelEvent);
    this.broadcastSystem(`⚔️ ${a.name} 與 ${b.name} 的決鬥即將開始`);
    logger.info(`決鬥開始：${a.name} vs ${b.name}`);
  }

  private endDuel(winner: Player, loser: Player, reason: 'ko' | 'forfeit'): void {
    this.duels = this.duels.filter((d) => !(d.aId === winner.id || d.bId === winner.id));
    winner.duelWith = '';
    winner.fightMode = false;
    if (winner.hp > 0) winner.hp = FIGHT.maxHp;
    loser.duelWith = '';
    loser.fightMode = false;
    this.broadcast(Messages.duel, {
      kind: 'end',
      winnerId: winner.id,
      winnerName: winner.name,
      loserId: loser.id,
      loserName: loser.name,
      reason,
    } satisfies DuelEvent);
    this.broadcastSystem(reason === 'ko' ? `🏆 ${winner.name} 在決鬥中擊倒了 ${loser.name}` : `🏆 ${loser.name} 離開，${winner.name} 不戰而勝`);
    logger.info(`決鬥結束：${winner.name} 勝（${reason}）`);
  }

  private findDuel(playerId: string): Duel | null {
    return this.duels.find((d) => d.aId === playerId || d.bId === playerId) ?? null;
  }

  private hasOutgoingInvite(fromId: string): boolean {
    for (const inv of this.invites.values()) if (inv.fromId === fromId) return true;
    return false;
  }

  private expireInvite(toId: string): void {
    const invite = this.invites.get(toId);
    if (!invite) return;
    this.invites.delete(toId);
    const to = this.state.players.get(toId);
    this.sendDuelTo(invite.fromId, { kind: 'declined', byId: toId, byName: to?.name ?? '', reason: 'timeout' });
  }

  /** 玩家離開時清掉與其相關的邀請 */
  private clearInvitesFor(id: string): void {
    for (const [toId, inv] of [...this.invites]) {
      if (toId === id || inv.fromId === id) {
        inv.timer.clear();
        this.invites.delete(toId);
        if (inv.fromId !== id) {
          this.sendDuelTo(inv.fromId, { kind: 'declined', byId: id, byName: '', reason: 'declined' });
        }
      }
    }
  }

  private sendDuel(client: Client, event: DuelEvent): void {
    client.send(Messages.duel, event);
  }

  private sendDuelTo(sessionId: string, event: DuelEvent): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (client) client.send(Messages.duel, event);
  }

  // ---------- 辦公室寵物 ----------

  /** 在範圍內找一個沒有家具的落點；around 給定時在其附近取點（散步用） */
  private randomOpenPoint(
    area: { minX: number; maxX: number; minZ: number; maxZ: number },
    tries: number,
    around?: { x: number; z: number; maxDist: number },
  ): { x: number; z: number } | null {
    for (let i = 0; i < tries; i++) {
      let raw: { x: number; z: number };
      if (around) {
        const ang = Math.random() * Math.PI * 2;
        const d = 1.5 + Math.random() * Math.max(0.5, around.maxDist - 1.5);
        raw = {
          x: clampNum(around.x + Math.sin(ang) * d, area.minX, area.maxX),
          z: clampNum(around.z + Math.cos(ang) * d, area.minZ, area.maxZ),
        };
      } else {
        raw = {
          x: area.minX + Math.random() * (area.maxX - area.minX),
          z: area.minZ + Math.random() * (area.maxZ - area.minZ),
        };
      }
      const pos = resolvePosition(raw.x, raw.z, PET.radius);
      // 被家具推開太多代表落在家具裡
      if (Math.hypot(pos.x - raw.x, pos.z - raw.z) > 0.05) continue;
      return pos;
    }
    return null;
  }

  private spawnPet(announce = true): void {
    if (this.state.pets.size >= PET.count) return;
    const def = PETS[Math.floor(Math.random() * PETS.length)];
    const pos = this.randomOpenPoint(PET.area, 20);
    if (!pos) return;

    const pet = new Pet();
    pet.id = `pet${++this.petSeq}`;
    pet.petType = def.id;
    pet.x = pos.x;
    pet.z = pos.z;
    pet.rotY = Math.random() * Math.PI * 2;
    pet.anim = 'idle';
    pet.hp = PET.maxHp;
    this.state.pets.set(pet.id, pet);
    this.petAi.set(pet.id, { mode: 'idle', until: Date.now() + randIn(PET.idleMs), tx: pos.x, tz: pos.z, staggerUntil: 0 });
    if (announce) this.broadcastSystem(`🐾 ${def.name}來到了辦公室`);
    logger.info(`寵物出生：${def.name} (${pet.id})`);
  }

  private setPetIdle(ai: PetAi, pet: Pet, now: number): void {
    ai.mode = 'idle';
    ai.until = now + randIn(PET.idleMs);
    pet.anim = 'idle';
  }

  /** 寵物 AI：走動 → 停頓 → 偶爾跳舞 */
  private tickPets(): void {
    const now = Date.now();
    for (const pet of this.state.pets.values()) {
      const ai = this.petAi.get(pet.id);
      if (!ai || pet.anim === 'dead') continue;
      if (now < ai.staggerUntil) continue;
      if (pet.anim === 'hit') pet.anim = 'idle'; // 僵直結束

      if (ai.mode === 'walk') {
        const dx = ai.tx - pet.x;
        const dz = ai.tz - pet.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.15 || now > ai.until) {
          this.setPetIdle(ai, pet, now);
          continue;
        }
        const step = (PET.walkSpeed * PET.aiTickMs) / 1000;
        const next = moveWithCollision({ x: pet.x, z: pet.z }, (dx / dist) * step, (dz / dist) * step, PET.radius);
        // 幾乎沒前進代表被家具卡住，放棄這個目標
        if (Math.hypot(next.x - pet.x, next.z - pet.z) < step * 0.2) {
          this.setPetIdle(ai, pet, now);
          continue;
        }
        pet.rotY = Math.atan2(dx / dist, dz / dist);
        pet.x = next.x;
        pet.z = next.z;
        pet.anim = 'walk';
        continue;
      }

      if (now < ai.until) continue;
      const roll = Math.random();
      if (roll < 0.55) {
        const target = this.randomOpenPoint(PET.area, 10, { x: pet.x, z: pet.z, maxDist: PET.wanderDist });
        if (target) {
          ai.mode = 'walk';
          ai.tx = target.x;
          ai.tz = target.z;
          ai.until = now + PET.walkTimeoutMs;
        } else {
          this.setPetIdle(ai, pet, now);
        }
      } else if (roll < 0.8) {
        ai.mode = 'dance';
        ai.until = now + randIn(PET.danceMs);
        pet.anim = 'dance';
      } else {
        this.setPetIdle(ai, pet, now);
      }
    }
  }

  /** 對寵物結算一次命中：擊退、扣血、倒地與重生排程 */
  private applyHitToPet(attacker: Player, pet: Pet, dirX: number, dirZ: number, weapon: WeaponDef, impactOffset: number): void {
    const now = Date.now();
    const kb = weapon.knockback * PET.knockbackFactor;
    const to = moveWithCollision({ x: pet.x, z: pet.z }, dirX * kb, dirZ * kb, PET.radius);
    const impactX = impactOffset ? attacker.x + dirX * impactOffset : pet.x;
    const impactZ = impactOffset ? attacker.z + dirZ * impactOffset : pet.z;
    pet.x = to.x;
    pet.z = to.z;
    pet.rotY = Math.atan2(-dirX, -dirZ); // 面向攻擊者
    pet.hp = Math.max(0, pet.hp - weapon.damage);

    const killed = pet.hp === 0;
    const def = getPet(pet.petType);
    if (killed) {
      pet.anim = 'dead';
      this.petAi.delete(pet.id);
      this.broadcastSystem(`🐾 ${attacker.name} 用${weapon.name}打倒了${def.name}…新朋友幾秒後會來`);
      logger.info(`寵物被打倒：${def.name} by ${attacker.name}`);
      const petId = pet.id;
      this.clock.setTimeout(() => this.state.pets.delete(petId), PET.deadMs);
      this.clock.setTimeout(() => this.spawnPet(), PET.respawnMs);
    } else {
      pet.anim = 'hit';
      const ai = this.petAi.get(pet.id);
      if (ai) {
        ai.staggerUntil = now + PET.staggerMs;
        ai.mode = 'idle';
        ai.until = now + PET.staggerMs;
      }
    }

    const event: HitEvent = {
      attackerId: attacker.id,
      targetId: pet.id,
      x: impactX,
      z: impactZ,
      dirX,
      dirZ,
      toX: to.x,
      toZ: to.z,
      hp: pet.hp,
      killed,
    };
    this.broadcast(Messages.hit, event);
  }

  /** 在攻擊者正前方扇形內找最近的活寵物（決鬥中不能打寵物） */
  private findPetTarget(attacker: Player, fx: number, fz: number, range: number): Pet | null {
    if (attacker.duelWith) return null;
    let target: Pet | null = null;
    let bestDist = range;
    for (const pet of this.state.pets.values()) {
      if (pet.anim === 'dead') continue;
      const dx = pet.x - attacker.x;
      const dz = pet.z - attacker.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist || dist < 1e-3) continue;
      if ((dx * fx + dz * fz) / dist < FIGHT.coneCos) continue;
      target = pet;
      bestDist = dist;
    }
    return target;
  }

  private respawn(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    const meta = this.meta.get(sessionId);
    if (!player) return;
    if (meta) meta.respawnTimer = null;
    const spawn = findFreeSpawn(SPAWN_POINT, this.obstaclePlayers(sessionId));
    player.x = spawn.x;
    player.z = spawn.z;
    player.rotY = 0;
    player.hp = FIGHT.maxHp;
    player.anim = 'idle';
    player.seatId = '';
    if (meta) meta.lastMoveAt = Date.now();
    const event: RespawnEvent = { sessionId, x: spawn.x, z: spawn.z };
    this.broadcast(Messages.respawn, event);
  }

  private handleStatus(client: Client, text: string): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.status = sanitizeStatus(text);
  }

  private handleChat(client: Client, raw: string): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta) return;

    const text = sanitizeChat(raw);
    if (!text) return;

    const now = Date.now();
    meta.chatTimestamps = meta.chatTimestamps.filter((t) => now - t < CHAT_RATE_LIMIT.windowMs);
    if (meta.chatTimestamps.length >= CHAT_RATE_LIMIT.count) return;
    meta.chatTimestamps.push(now);

    const message: ChatMessage = {
      id: `${now}-${++this.chatSeq}`,
      senderId: client.sessionId,
      name: player.name,
      text,
      ts: now,
    };
    this.broadcast(Messages.chat, message);
  }

  /** 會擋路的其他玩家：排除自己、倒地者（躺在地上不擋路）與坐著的人（椅子本身已有碰撞） */
  private obstaclePlayers(excludeId?: string): { x: number; z: number }[] {
    const list: { x: number; z: number }[] = [];
    for (const p of this.state.players.values()) {
      if (p.id === excludeId || p.hp <= 0 || p.seatId) continue;
      list.push({ x: p.x, z: p.z });
    }
    return list;
  }

  private broadcastSystem(text: string): void {
    const message: SystemMessage = { text, ts: Date.now() };
    this.broadcast(Messages.system, message);
  }
}
