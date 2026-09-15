import { Room, type Client } from '@colyseus/core';
import {
  ANIM_STATES,
  AVATAR_IDS,
  DUEL,
  FIGHT,
  IDLE,
  PET,
  PETS,
  PET_EAT_MS,
  COURT,
  EAT,
  OVEN,
  STOVE,
  WEATHER,
  getPet,
  petSizeFactor,
  DUMBBELL_RACK_SLOTS,
  KITCHEN_CROISSANT_SPOT,
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
  type CourtShotEvent,
  type CourtSide,
  type DuelAction,
  type DuelEvent,
  type HitEvent,
  type IdleEvent,
  type JoinOptions,
  type MovePayload,
  type PetFlightEvent,
  type PickupPayload,
  type ProjectileEvent,
  type RespawnEvent,
  type SitPayload,
  type SwingPayload,
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
  /** 最後一次操作時間（僅伺服端，閒置判定用；不進同步 schema 以免高頻廣播） */
  lastActivityAt: number;
  lastMoveAt: number;
  chatTimestamps: number[];
  lastAttackAt: number;
  respawnTimer: { clear(): void } | null;
  /** 溜滑梯這類一次性設施的自動起身計時器 */
  rideTimer: { clear(): void } | null;
  /** 最後一次被爐火燒到的時間 */
  lastBurnAt: number;
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
  private stoveBurnTimer: { clear(): void } | null = null;
  /** 匹克球：進行中那一拍的資訊（落地判定用） */
  private courtShot: {
    shotId: number;
    toSide: CourtSide;
    shotAt: number;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    flightMs: number;
    bounceToX: number;
    bounceToZ: number;
    bounceMs: number;
    timer: { clear(): void };
  } | null = null;
  private courtTimer: { clear(): void } | null = null;
  private courtShotSeq = 0;
  private lastSwingAt = new Map<string, number>();
  /** 下一分由誰發球 */
  private courtServeSide: CourtSide = 'A';
  private stoveGoneTimer: { clear(): void } | null = null;
  private stovePlacedBy = '';
  private ovenTimer: { clear(): void } | null = null;

  /** 註冊訊息處理，並統一把任何操作記為活動時間（閒置判定用） */
  private onPlayerMessage<T>(type: string, handler: (client: Client, payload: T) => void): void {
    this.onMessage<T>(type, (client, payload) => {
      const meta = this.meta.get(client.sessionId);
      if (meta) meta.lastActivityAt = Date.now();
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
    this.onPlayerMessage<{ petId: string }>(Messages.petPickup, (client, payload) => this.handlePetPickup(client, payload));
    this.onPlayerMessage(Messages.petDrop, (client) => this.handlePetDrop(client));
    this.onPlayerMessage(Messages.petThrow, (client) => this.handlePetThrow(client));
    this.onPlayerMessage<{ petId: string }>(Messages.feedPet, (client, payload) => this.handleFeedPet(client, payload));
    this.onPlayerMessage(Messages.stovePlace, (client) => this.handleStovePlace(client));
    this.onPlayerMessage(Messages.stoveTake, (client) => this.handleStoveTake(client));
    this.onPlayerMessage(Messages.ovenPlace, (client) => this.handleOvenPlace(client));
    this.onPlayerMessage(Messages.ovenTake, (client) => this.handleOvenTake(client));
    this.onPlayerMessage(Messages.eat, (client) => this.handleEat(client));
    this.onPlayerMessage<{ side: CourtSide }>(Messages.courtJoin, (client, payload) => this.handleCourtJoin(client, payload));
    this.onPlayerMessage(Messages.courtLeave, (client) => this.handleCourtLeave(client));
    this.onPlayerMessage<SwingPayload>(Messages.swing, (client, payload) => this.handleSwing(client, payload));
    // 分頁顯示狀態本身不算「操作」，所以不走 onPlayerMessage
    this.onMessage<boolean>(Messages.visibility, (client, hidden) => this.handleVisibility(client, hidden));

    for (let i = 0; i < PICKUPS.initial; i++) this.spawnPickup();
    for (const slot of DUMBBELL_RACK_SLOTS) this.addPickup('dumbbell', slot.x, slot.z, slot.y, false);
    this.restockKitchen();
    this.clock.setInterval(() => this.spawnPickup(), PICKUPS.intervalMs);
    this.clock.setInterval(() => this.restockKitchen(), PICKUPS.kitchenRestockMs);
    this.clock.setInterval(() => this.checkIdlePlayers(), IDLE.checkIntervalMs);

    for (let i = 0; i < PET.count; i++) this.spawnPet(false);
    this.clock.setInterval(() => this.tickPets(), PET.aiTickMs);
    this.clock.setInterval(() => this.tickStoveBurn(), STOVE.burnTickMs);

    void this.refreshWeather();
    this.clock.setInterval(() => void this.refreshWeather(), WEATHER.refreshMs);

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
    meta.lastActivityAt = Date.now();
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
      const inactiveFor = now - meta.lastActivityAt;
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

    this.state.players.set(client.sessionId, player);
    this.meta.set(client.sessionId, {
      lastActivityAt: Date.now(),
      lastMoveAt: 0,
      chatTimestamps: [],
      lastAttackAt: 0,
      respawnTimer: null,
      rideTimer: null,
      lastBurnAt: 0,
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

    const leavingMeta = this.meta.get(client.sessionId);
    leavingMeta?.respawnTimer?.clear();
    leavingMeta?.rideTimer?.clear();
    this.clearInvitesFor(client.sessionId);
    if (player.duelWith) {
      const opponent = this.state.players.get(player.duelWith);
      if (opponent) this.endDuel(opponent, player, 'forfeit');
    }
    this.dropWeapon(player);
    this.dropCarriedPet(player.id);
    this.leaveCourtIfPlaying(player.id, true);
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
    meta.lastActivityAt = now;
    meta.lastMoveAt = now;
  }

  private handleSit(client: Client, payload: SitPayload): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || player.seatId || player.hp <= 0 || player.duelWith || this.courtSideOf(player.id)) return;

    const seat = SEAT_BY_ID.get(payload?.seatId ?? '');
    if (!seat) return;
    if (seatDistance(seat, player.x, player.z) > SEAT_INTERACT_DISTANCE + SIT_DISTANCE_TOLERANCE) return;
    for (const other of this.state.players.values()) {
      if (other.seatId === seat.id) return; // 已有人
    }

    this.dropCarriedPet(player.id);
    player.seatId = seat.id;
    player.x = seat.x;
    player.z = seat.z;
    player.rotY = seat.rotY;
    player.anim = seat.anim;
    meta.lastActivityAt = Date.now();
    meta.lastMoveAt = Date.now();

    // 溜滑梯是一次性體驗：滑完自動起身，免得有人卡在滑道上佔著設施
    meta.rideTimer?.clear();
    meta.rideTimer = null;
    if (seat.rideMs) {
      meta.rideTimer = this.clock.setTimeout(() => {
        const meta2 = this.meta.get(client.sessionId);
        if (meta2) meta2.rideTimer = null;
        // 期間可能已經自己起身或又坐到別的設施，只處理還在同一個座位的情況
        if (this.state.players.get(client.sessionId)?.seatId === seat.id) this.handleStand(client);
      }, seat.rideMs);
    }
  }

  private handleStand(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || !player.seatId) return;

    meta.rideTimer?.clear();
    meta.rideTimer = null;
    const seat = SEAT_BY_ID.get(player.seatId);
    const point = seat ? standPointForSeat(seat) : { x: player.x, z: player.z };
    player.seatId = '';
    player.x = point.x;
    player.z = point.z;
    player.anim = 'idle';
    meta.lastActivityAt = Date.now();
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
    // 匹克球比賽中的雙方不參與格鬥
    if (this.courtSideOf(attacker.id) || this.courtSideOf(other.id)) return false;
    return true;
  }

  /** 攻擊：依手上武器決定近戰揮擊或投射物 */
  private handleAttack(client: Client): void {
    const attacker = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!attacker || !meta || !attacker.fightMode || attacker.hp <= 0 || attacker.seatId) return;

    if (this.courtSideOf(attacker.id)) return; // 比賽中空白鍵是揮拍
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
        if (pet.anim === 'dead' || pet.anim === 'thrown' || pet.carrierId) continue;
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
    if (targetMeta) {
      targetMeta.lastActivityAt = now;
      targetMeta.lastMoveAt = now;
    }

    const killed = target.hp === 0;
    if (killed) {
      target.anim = 'dead';
      this.dropWeapon(target);
      this.dropCarriedPet(target.id);
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
    // 架上的啞鈴與吧檯上的可頌放在檯面（y > 0），不算在地面隨機生成的上限內
    let randomCount = 0;
    for (const p of this.state.pickups.values()) if (p.y === 0 && WEAPON_BY_ID.get(p.weaponId)?.spawnable !== false) randomCount++;
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

  /** 廚房吧檯固定供應一個可頌：被拿走（或被拿去烤）後就再放一個回檯面 */
  private restockKitchen(): void {
    const spot = KITCHEN_CROISSANT_SPOT;
    for (const p of this.state.pickups.values()) {
      if (p.weaponId === 'croissant' && Math.hypot(p.x - spot.x, p.z - spot.z) < 0.3) return;
    }
    this.addPickup('croissant', spot.x, spot.z, spot.y, false);
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
    if (player.weaponId === 'paddle') {
      player.weaponId = '';
      player.ammo = 0;
      return;
    }
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
      if (this.courtSideOf(me.id) || this.courtSideOf(target.id)) return; // 比賽中不打擾
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
      this.dropCarriedPet(p.id);
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
    // 盡量挑場上沒有的種類，避免同時三隻小貓
    const inUse = new Set([...this.state.pets.values()].map((p) => p.petType));
    const pool = PETS.filter((d) => !inUse.has(d.id));
    const candidates = pool.length > 0 ? pool : PETS;
    const def = candidates[Math.floor(Math.random() * candidates.length)];
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
      if (pet.carrierId) {
        const carrier = this.state.players.get(pet.carrierId);
        if (!carrier || carrier.hp <= 0) {
          this.dropCarriedPet(pet.carrierId);
          continue;
        }
        pet.x = carrier.x;
        pet.z = carrier.z;
        pet.rotY = carrier.rotY;
        continue;
      }
      const ai = this.petAi.get(pet.id);
      if (!ai || pet.anim === 'dead' || pet.anim === 'thrown') continue;
      if (now < ai.staggerUntil) continue;
      if (pet.anim === 'hit' || pet.anim === 'eat') pet.anim = 'idle'; // 僵直 / 進食結束

      if (ai.mode === 'walk') {
        const dx = ai.tx - pet.x;
        const dz = ai.tz - pet.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.15 || now > ai.until) {
          this.setPetIdle(ai, pet, now);
          continue;
        }
        const step = (PET.walkSpeed * PET.aiTickMs) / 1000;
        const next = moveWithCollision({ x: pet.x, z: pet.z }, (dx / dist) * step, (dz / dist) * step, PET.radius * petSizeFactor(pet.feedCount, PET.feedMax));
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

  /** 玩家抱著的寵物（一次最多一隻） */
  private carriedPetOf(playerId: string): Pet | null {
    for (const pet of this.state.pets.values()) if (pet.carrierId === playerId) return pet;
    return null;
  }

  private handlePetPickup(client: Client, payload: { petId: string }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId || player.duelWith || this.courtSideOf(player.id)) return;
    if (this.carriedPetOf(player.id)) return;
    const pet = this.state.pets.get(payload?.petId ?? '');
    if (!pet || pet.carrierId || pet.anim === 'dead' || pet.anim === 'thrown') return;
    if (Math.hypot(pet.x - player.x, pet.z - player.z) > PET.pickupRange + 0.6) return;

    pet.carrierId = player.id;
    pet.anim = 'idle';
    this.petAi.delete(pet.id);
    this.broadcastSystem(`🐾 ${player.name} 抱起了${getPet(pet.petType).name}`);
  }

  private handlePetDrop(client: Client): void {
    this.dropCarriedPet(client.sessionId, true);
  }

  /** 把玩家抱著的寵物放到腳邊；gently 為主動放下（放在面前而不是原地） */
  private dropCarriedPet(playerId: string, gently = false): void {
    const pet = this.carriedPetOf(playerId);
    if (!pet) return;
    const carrier = this.state.players.get(playerId);
    let x = pet.x;
    let z = pet.z;
    if (carrier && gently) {
      x = carrier.x + Math.sin(carrier.rotY) * 0.7;
      z = carrier.z + Math.cos(carrier.rotY) * 0.7;
    }
    const pos = resolvePosition(x, z, PET.radius);
    pet.carrierId = '';
    pet.x = pos.x;
    pet.z = pos.z;
    pet.anim = 'idle';
    this.petAi.set(pet.id, { mode: 'idle', until: Date.now() + randIn(PET.idleMs), tx: pos.x, tz: pos.z, staggerUntil: 0 });
  }

  /** 把抱著的寵物往面向方向丟出去：拋物線由前端播，落點與後續由伺服端決定 */
  private handlePetThrow(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const pet = this.carriedPetOf(player.id);
    if (!pet) return;

    const dirX = Math.sin(player.rotY);
    const dirZ = Math.cos(player.rotY);
    const from = { x: player.x, z: player.z };
    const to = moveWithCollision(from, dirX * PET.throwDist, dirZ * PET.throwDist, PET.radius);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const durationMs = Math.max(250, (dist / PET.throwSpeed) * 1000);

    pet.carrierId = '';
    pet.x = to.x;
    pet.z = to.z;
    pet.rotY = player.rotY;
    pet.anim = 'thrown';

    const event: PetFlightEvent = { petId: pet.id, fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, durationMs };
    this.broadcast(Messages.petFlight, event);
    this.broadcastSystem(`🐾 ${player.name} 把${getPet(pet.petType).name}丟了出去！`);

    const petId = pet.id;
    this.clock.setTimeout(() => {
      const landed = this.state.pets.get(petId);
      if (!landed || landed.anim === 'dead' || landed.carrierId) return;
      landed.anim = 'hit'; // 落地後生氣抖一下
      this.petAi.set(petId, {
        mode: 'idle',
        until: Date.now() + PET.landStaggerMs,
        tx: landed.x,
        tz: landed.z,
        staggerUntil: Date.now() + PET.landStaggerMs,
      });
    }, durationMs);
  }

  /** 拿著食物餵寵物：食物消耗、寵物回滿血並播進食動畫 */
  private handleFeedPet(client: Client, payload: { petId: string }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const weapon = WEAPON_BY_ID.get(player.weaponId);
    if (!weapon?.edible) return;
    const pet = this.state.pets.get(payload?.petId ?? '');
    if (!pet || pet.carrierId || pet.anim === 'dead' || pet.anim === 'thrown') return;
    if (Math.hypot(pet.x - player.x, pet.z - player.z) > PET.pickupRange + 0.6) return;

    player.weaponId = '';
    player.ammo = 0;
    pet.hp = PET.maxHp;
    pet.anim = 'eat';
    pet.rotY = Math.atan2(player.x - pet.x, player.z - pet.z); // 面向餵食的人
    const grew = pet.feedCount < PET.feedMax;
    if (grew) pet.feedCount += 1;
    const now = Date.now();
    this.petAi.set(pet.id, { mode: 'idle', until: now + PET_EAT_MS, tx: pet.x, tz: pet.z, staggerUntil: now + PET_EAT_MS });
    const name = getPet(pet.petType).name;
    this.broadcastSystem(
      grew
        ? pet.feedCount === PET.feedMax
          ? `🐾 ${player.name} 餵${name}吃了${weapon.name}，${name}長成超巨大了！`
          : `🐾 ${player.name} 餵${name}吃了${weapon.name}，${name}長大了一點`
        : `🐾 ${player.name} 餵${name}吃了${weapon.name}，但${name}已經吃得超飽`,
    );
  }

  // ---------- 烤箱 ----------

  private nearOven(player: Player): boolean {
    return Math.hypot(player.x - OVEN.x, player.z - OVEN.z) <= OVEN.range + 0.6;
  }

  private clearOven(): void {
    this.ovenTimer?.clear();
    this.ovenTimer = null;
    this.state.ovenFoodId = '';
    this.state.ovenStage = '';
  }

  /** 把手上可以烤的食物放進烤箱；OVEN.bakeMs 後出爐，變成 bakesTo 指定的放大版 */
  private handleOvenPlace(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const weapon = WEAPON_BY_ID.get(player.weaponId);
    if (!weapon?.bakesTo) return;
    if (this.state.ovenFoodId || !this.nearOven(player)) return;

    player.weaponId = '';
    player.ammo = 0;
    this.state.ovenFoodId = weapon.id;
    this.state.ovenStage = 'baking';
    this.broadcastSystem(`🥐 ${player.name} 把${weapon.name}放進烤箱`);

    this.ovenTimer = this.clock.setTimeout(() => {
      if (this.state.ovenStage !== 'baking' || this.state.ovenFoodId !== weapon.id) return;
      const baked = WEAPON_BY_ID.get(weapon.bakesTo ?? '');
      this.state.ovenFoodId = baked?.id ?? weapon.id;
      this.state.ovenStage = 'done';
      this.broadcastSystem(`🔔 烤箱叮了一聲，${baked?.name ?? weapon.name}出爐了！`);
    }, OVEN.bakeMs);
  }

  /** 空手把烤箱裡的食物拿出來（還在烤就拿回原本那個） */
  private handleOvenTake(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId || player.weaponId) return;
    if (!this.state.ovenFoodId || !this.nearOven(player)) return;
    const weapon = WEAPON_BY_ID.get(this.state.ovenFoodId);
    this.clearOven();
    if (!weapon) return;
    player.weaponId = weapon.id;
    player.ammo = weapon.ammo ?? 0;
  }

  // ---------- 吃東西 ----------

  /** 吃掉手上的食物：食物消耗、回復血量（上限 FIGHT.maxHp），進食動作由客戶端播放 */
  private handleEat(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const weapon = WEAPON_BY_ID.get(player.weaponId);
    if (!weapon?.edible) return;

    const before = player.hp;
    player.hp = Math.min(FIGHT.maxHp, player.hp + (weapon.heal ?? EAT.healHp));
    player.weaponId = '';
    player.ammo = 0;
    const gained = player.hp - before;
    this.broadcastSystem(
      gained > 0 ? `🍽️ ${player.name} 吃掉了${weapon.name}，回復 ${gained} 點血量` : `🍽️ ${player.name} 吃掉了${weapon.name}，但已經很飽了`,
    );
  }

  // ---------- 瓦斯爐 ----------

  private nearStove(player: Player): boolean {
    return Math.hypot(player.x - STOVE.x, player.z - STOVE.z) <= STOVE.range + 0.6;
  }

  private clearStove(): void {
    this.stoveBurnTimer?.clear();
    this.stoveGoneTimer?.clear();
    this.stoveBurnTimer = null;
    this.stoveGoneTimer = null;
    this.state.stoveFoodId = '';
    this.state.stoveStage = '';
  }

  /** 把手上的食物放上瓦斯爐；放太久會燒起來、再久化成灰 */
  private handleStovePlace(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId) return;
    const weapon = WEAPON_BY_ID.get(player.weaponId);
    if (!weapon?.edible) return;
    if (this.state.stoveFoodId || !this.nearStove(player)) return;

    player.weaponId = '';
    player.ammo = 0;
    this.state.stoveFoodId = weapon.id;
    this.state.stoveStage = 'cooking';
    this.stovePlacedBy = player.name;
    this.broadcastSystem(`🍳 ${player.name} 把${weapon.name}放上了爐子`);

    this.stoveBurnTimer = this.clock.setTimeout(() => {
      if (this.state.stoveStage !== 'cooking') return;
      this.state.stoveStage = 'burning';
      this.broadcastSystem(`🔥 爐子上的${weapon.name}燒起來了！`);
      this.stoveGoneTimer = this.clock.setTimeout(() => {
        if (this.state.stoveStage !== 'burning') return;
        this.clearStove();
        this.broadcastSystem(`💨 ${this.stovePlacedBy} 留在爐子上的${weapon.name}燒成灰了…`);
      }, STOVE.goneAfterMs);
    }, STOVE.burnAfterMs);
  }

  /** 空手把煎著的食物拿回來（燒起來就拿不回來了） */
  private handleStoveTake(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hp <= 0 || player.seatId || player.weaponId) return;
    if (this.state.stoveStage !== 'cooking' || !this.nearStove(player)) return;
    const weapon = WEAPON_BY_ID.get(this.state.stoveFoodId);
    this.clearStove();
    if (!weapon) return;
    player.weaponId = weapon.id;
    player.ammo = weapon.ammo ?? 0;
  }

  /** 爐火延燒：著火時靠近的玩家持續掉血並冒火，離開一段時間後熄滅 */
  private tickStoveBurn(): void {
    const now = Date.now();
    const burning = this.state.stoveStage === 'burning';
    for (const player of this.state.players.values()) {
      const meta = this.meta.get(player.id);
      if (!meta) continue;
      const inRange = burning && player.hp > 0 && Math.hypot(player.x - STOVE.x, player.z - STOVE.z) <= STOVE.burnRadius;
      if (inRange) {
        meta.lastBurnAt = now;
        player.onFire = true;
        player.hp = Math.max(0, player.hp - STOVE.burnDamage);
        if (player.hp === 0) this.killByFire(player);
      } else if (player.onFire && now - meta.lastBurnAt > STOVE.fireLingerMs) {
        player.onFire = false;
      }
    }
  }

  private killByFire(player: Player): void {
    player.anim = 'dead';
    this.dropWeapon(player);
    this.dropCarriedPet(player.id);
    this.leaveCourtIfPlaying(player.id, true);
    if (player.duelWith) {
      const opponent = this.state.players.get(player.duelWith);
      if (opponent) this.endDuel(opponent, player, 'ko');
    }
    this.broadcastSystem(`🔥 ${player.name} 被爐火燒倒了！`);
    logger.info(`爐火擊倒：${player.name}`);
    const meta = this.meta.get(player.id);
    meta?.respawnTimer?.clear();
    const playerId = player.id;
    if (meta) meta.respawnTimer = this.clock.setTimeout(() => this.respawn(playerId), FIGHT.respawnMs);
  }

  /** 對寵物結算一次命中：擊退、扣血、倒地與重生排程 */
  private applyHitToPet(attacker: Player, pet: Pet, dirX: number, dirZ: number, weapon: WeaponDef, impactOffset: number): void {
    const now = Date.now();
    // 吃越胖越重，擊退距離隨體型縮短
    const kb = (weapon.knockback * PET.knockbackFactor) / petSizeFactor(pet.feedCount, PET.feedMax);
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
      if (pet.anim === 'dead' || pet.anim === 'thrown' || pet.carrierId) continue;
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
    player.onFire = false;
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

  /** 抓當地即時天氣寫進房間狀態；失敗就沿用上一次的資料 */
  private async refreshWeather(): Promise<void> {
    const lat = process.env.WEATHER_LAT ?? String(WEATHER.defaultLat);
    const lon = process.env.WEATHER_LON ?? String(WEATHER.defaultLon);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
      const current = data.current;
      if (!current || typeof current.weather_code !== 'number') throw new Error('缺少 current 欄位');
      this.state.weatherCode = current.weather_code;
      this.state.weatherTemp = Math.round(current.temperature_2m ?? 0);
      this.state.weatherIsDay = current.is_day !== 0;
      logger.info(`天氣更新：code ${this.state.weatherCode}、${this.state.weatherTemp}°C、${this.state.weatherIsDay ? '白天' : '夜間'}`);
    } catch (err) {
      logger.warn('天氣更新失敗，沿用上一次資料', err instanceof Error ? err.message : err);
    }
  }

  // ---------- 匹克球 ----------

  private courtSideOf(sessionId: string): CourtSide | null {
    if (this.state.courtPlayerA === sessionId) return 'A';
    if (this.state.courtPlayerB === sessionId) return 'B';
    return null;
  }

  private courtPlayerOf(side: CourtSide): Player | null {
    const id = side === 'A' ? this.state.courtPlayerA : this.state.courtPlayerB;
    return id ? (this.state.players.get(id) ?? null) : null;
  }

  private clearCourtTimers(): void {
    this.courtTimer?.clear();
    this.courtTimer = null;
    this.courtShot?.timer.clear();
    this.courtShot = null;
  }

  private handleCourtJoin(client: Client, payload: { side: CourtSide }): void {
    const player = this.state.players.get(client.sessionId);
    const side = payload?.side;
    if (!player || (side !== 'A' && side !== 'B')) return;
    if (player.hp <= 0 || player.seatId || player.duelWith || this.courtSideOf(player.id)) return;
    const st = this.state;
    if (st.courtStatus === 'over') return; // 結算畫面中，等清場
    if ((side === 'A' && st.courtPlayerA) || (side === 'B' && st.courtPlayerB)) return; // 該側已有人
    const slot = side === 'A' ? COURT.slotA : COURT.slotB;
    if (Math.hypot(player.x - slot.x, player.z - slot.z) > COURT.joinRange + 0.6) return;

    this.dropCarriedPet(player.id);
    this.dropWeapon(player);
    player.weaponId = 'paddle';
    player.ammo = 0;
    if (side === 'A') st.courtPlayerA = player.id;
    else st.courtPlayerB = player.id;

    if (st.courtPlayerA && st.courtPlayerB) {
      st.courtScoreA = 0;
      st.courtScoreB = 0;
      this.courtServeSide = 'A';
      this.startCourtCountdown();
      this.broadcastSystem(`🏓 匹克球開打：${this.courtPlayerOf('A')?.name} vs ${this.courtPlayerOf('B')?.name}，先拿 ${COURT.winScore} 分獲勝`);
    } else {
      st.courtStatus = 'waiting';
      this.broadcastSystem(`🏓 ${player.name} 在匹克球場等待對手（到另一側報名點按 E 加入）`);
    }
  }

  private handleCourtLeave(client: Client): void {
    this.leaveCourtIfPlaying(client.sessionId, false);
  }

  /** 退出比賽：比賽進行中退出視為棄權，對手獲勝 */
  private leaveCourtIfPlaying(sessionId: string, silent: boolean): void {
    const side = this.courtSideOf(sessionId);
    if (!side) return;
    const st = this.state;
    const leaver = this.state.players.get(sessionId);
    if (leaver?.weaponId === 'paddle') leaver.weaponId = '';

    const opponentSide: CourtSide = side === 'A' ? 'B' : 'A';
    const opponent = this.courtPlayerOf(opponentSide);
    const inMatch = st.courtPlayerA && st.courtPlayerB && st.courtStatus !== 'over';

    if (inMatch && opponent) {
      if (!silent || true) {
        this.broadcastSystem(`🏓 ${leaver?.name ?? '對手'}離開了比賽，${opponent.name} 不戰而勝`);
      }
      this.finishCourt(opponentSide, false);
      return;
    }
    // 只有一個人在等，直接清空
    if (side === 'A') st.courtPlayerA = '';
    else st.courtPlayerB = '';
    if (!st.courtPlayerA && !st.courtPlayerB) st.courtStatus = 'idle';
  }

  private startCourtCountdown(): void {
    this.clearCourtTimers();
    this.state.courtStatus = 'countdown';
    this.courtTimer = this.clock.setTimeout(() => this.courtServe(), COURT.serveDelayMs);
  }

  /** 發球：從發球方目前位置（限制在自己半場）往對面丟 */
  private courtServe(): void {
    const server = this.courtPlayerOf(this.courtServeSide);
    const receiver = this.courtPlayerOf(this.courtServeSide === 'A' ? 'B' : 'A');
    if (!server || !receiver) return;
    this.state.courtStatus = 'rally';
    const fromX = clampNum(server.x, this.courtServeSide === 'A' ? COURT.minX : COURT.netX + 0.8, this.courtServeSide === 'A' ? COURT.netX - 0.8 : COURT.maxX);
    const fromZ = clampNum(server.z, COURT.minZ, COURT.maxZ);
    this.launchShot(server.id, this.courtServeSide === 'A' ? 'B' : 'A', fromX, fromZ, 0);
  }

  /** 打出一拍：目標落在 toSide 半場內，lateral 為壓角偏好（-1~1） */
  private launchShot(byId: string, toSide: CourtSide, fromX: number, fromZ: number, lateral: number): void {
    const deep = 0.6 + Math.random() * 0.35; // 0.6~0.95：偏後場
    const half = COURT.netX;
    const toX =
      toSide === 'B'
        ? half + (COURT.maxX - half - 0.5) * deep
        : half - (half - COURT.minX - 0.5) * deep;
    const toZ = clampNum(lateral * 2.3 + (Math.random() - 0.5) * 1.2, COURT.minZ + 0.35, COURT.maxZ - 0.35);
    const dist = Math.hypot(toX - fromX, toZ - fromZ);
    const flightMs = clampNum((dist / COURT.ballSpeed) * 1000, COURT.flightMinMs, COURT.flightMaxMs);
    const arcH = 1.35 + dist * 0.055;
    const shotId = ++this.courtShotSeq;

    // 第一次落地後往前彈一小段，第二次觸地才算失分（可截擊也可等彈起）
    const dirX = dist > 1e-6 ? (toX - fromX) / dist : 1;
    const dirZ = dist > 1e-6 ? (toZ - fromZ) / dist : 0;
    const bounceDist = clampNum(dist * COURT.bounceDistFactor, 0.8, 2.4);
    const bounceToX = clampNum(toX + dirX * bounceDist, COURT.minX - 1.2, COURT.maxX + 1.2);
    const bounceToZ = clampNum(toZ + dirZ * bounceDist, COURT.minZ - 1.6, COURT.maxZ + 1.6);
    const bounceMs = clampNum(flightMs * COURT.bounceMsFactor, COURT.bounceMsMin, COURT.bounceMsMax);

    this.courtShot?.timer.clear();
    this.courtShot = {
      shotId,
      toSide,
      shotAt: Date.now(),
      fromX,
      fromZ,
      toX,
      toZ,
      flightMs,
      bounceToX,
      bounceToZ,
      bounceMs,
      timer: this.clock.setTimeout(() => this.courtBallLanded(shotId), flightMs + bounceMs + COURT.secondTouchGraceMs),
    };
    const event: CourtShotEvent = { shotId, byId, fromX, fromZ, toX, toZ, flightMs, arcH, bounceToX, bounceToZ, bounceMs, bounceArcH: arcH * COURT.bounceArcFactor };
    this.broadcast(Messages.courtShot, event);
  }

  /** 球在飛行或反彈中的目前地面位置 */
  private courtBallPosAt(now: number): { x: number; z: number } | null {
    const shot = this.courtShot;
    if (!shot) return null;
    const t = now - shot.shotAt;
    if (t <= shot.flightMs) {
      const p = Math.max(0, t / shot.flightMs);
      return { x: shot.fromX + (shot.toX - shot.fromX) * p, z: shot.fromZ + (shot.toZ - shot.fromZ) * p };
    }
    const tb = Math.min(1, (t - shot.flightMs) / shot.bounceMs);
    return { x: shot.toX + (shot.bounceToX - shot.toX) * tb, z: shot.toZ + (shot.bounceToZ - shot.toZ) * tb };
  }

  /** 球落地沒人接到：打這拍的一方得分 */
  private courtBallLanded(shotId: number): void {
    if (this.courtShot?.shotId !== shotId) return;
    const toSide = this.courtShot.toSide;
    this.courtShot = null;
    const scorerSide: CourtSide = toSide === 'A' ? 'B' : 'A';
    const scorer = this.courtPlayerOf(scorerSide);
    const loser = this.courtPlayerOf(toSide);
    if (!scorer || !loser) return;

    if (scorerSide === 'A') this.state.courtScoreA += 1;
    else this.state.courtScoreB += 1;
    const a = this.state.courtScoreA;
    const b = this.state.courtScoreB;

    if (a >= COURT.winScore || b >= COURT.winScore) {
      this.broadcastSystem(`🏓 ${scorer.name} 得分（${a}:${b}）`);
      this.finishCourt(scorerSide, true);
      return;
    }
    this.state.courtStatus = 'between';
    this.broadcastSystem(`🏓 ${scorer.name} 得分（${a}:${b}）`);
    this.courtServeSide = scorerSide; // 得分者發下一球
    this.courtTimer?.clear();
    this.courtTimer = this.clock.setTimeout(() => this.startCourtCountdown(), COURT.betweenPointsMs);
  }

  /** 結束比賽並在幾秒後清場 */
  private finishCourt(winnerSide: CourtSide, announce: boolean): void {
    this.clearCourtTimers();
    const winner = this.courtPlayerOf(winnerSide);
    if (announce && winner) {
      this.broadcastSystem(`🏆 匹克球比賽結束，${winner.name} 獲勝（${this.state.courtScoreA}:${this.state.courtScoreB}）！`);
    }
    for (const side of ['A', 'B'] as const) {
      const p = this.courtPlayerOf(side);
      if (p?.weaponId === 'paddle') p.weaponId = '';
    }
    this.state.courtStatus = 'over';
    this.courtTimer = this.clock.setTimeout(() => {
      this.state.courtPlayerA = '';
      this.state.courtPlayerB = '';
      this.state.courtScoreA = 0;
      this.state.courtScoreB = 0;
      this.state.courtStatus = 'idle';
    }, COURT.overResetMs);
  }

  /** 揮拍：球在自己半場、距離與時間窗內就回擊 */
  private handleSwing(client: Client, payload: SwingPayload): void {
    const side = this.courtSideOf(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!side || !player) return;
    const now = Date.now();
    const last = this.lastSwingAt.get(client.sessionId) ?? 0;
    if (now - last < COURT.swingCooldownMs) return;
    this.lastSwingAt.set(client.sessionId, now);

    const shot = this.courtShot;
    if (!shot || this.state.courtStatus !== 'rally') return;
    if (shot.toSide !== side) return; // 球不是往你這邊飛
    // 有效時間：第一次落地前的截擊窗，一直到反彈段結束（第二次觸地）
    const firstLandAt = shot.shotAt + shot.flightMs;
    const secondTouchAt = firstLandAt + shot.bounceMs;
    if (now < firstLandAt - COURT.hitWindowMs || now > secondTouchAt + COURT.secondTouchGraceMs) return;
    const ball = this.courtBallPosAt(now);
    if (!ball || Math.hypot(player.x - ball.x, player.z - ball.z) > COURT.hitRange) return; // 人不在球邊

    // 回擊成功：以球目前位置為起點打回去，壓角由揮拍瞬間的面向決定
    const lateral = clampNum((payload?.aimZ ?? 0) * 1.2, -1, 1);
    shot.timer.clear();
    this.courtShot = null;
    this.launchShot(player.id, side === 'A' ? 'B' : 'A', ball.x, ball.z, lateral);
  }

  private broadcastSystem(text: string): void {
    const message: SystemMessage = { text, ts: Date.now() };
    this.broadcast(Messages.system, message);
  }
}
