import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import {
  DUEL,
  EAT,
  FIGHT,
  Messages,
  NPC,
  SEAT_BY_ID,
  type ChatMessage,
  type CourtShotEvent,
  type CourtSide,
  type DuelAction,
  type DuelEvent,
  type HitEvent,
  type IdleEvent,
  type JoinOptions,
  type NpcCaughtEvent,
  type NpcSpottedEvent,
  type NpcPinPayload,
  type NpcState,
  type PetFlightEvent,
  type PetState,
  type PickupPayload,
  type PickupState,
  type ProjectileEvent,
  type MovePayload,
  type PlayerState,
  type RespawnEvent,
  type SitPayload,
  type SnowJoinPayload,
  type SnowTeam,
  type SwingPayload,
  type SystemMessage,
} from '@office/shared';
import { useGame } from '../store/useGame';
import { beep, flashTitle, nativeNotify, stopFlashTitle } from '../lib/notify';
import {
  applyKnockback,
  bloodQueue,
  courtBall,
  local,
  npcTarget,
  petTargets,
  projectileQueue,
  remoteTargets,
  resetRuntime,
  startEat,
  triggerSwing,
} from '../scene/runtime';

interface OfficeStateShape {
  players: Map<string, PlayerState>;
  pickups: Map<string, PickupState>;
  pets: Map<string, PetState>;
  npc: NpcState;
  stoveFoodId: string;
  stoveStage: string;
  ovenFoodId: string;
  ovenStage: string;
  courtStatus: string;
  courtPlayerA: string;
  courtPlayerB: string;
  courtScoreA: number;
  courtScoreB: number;
  snowStatus: string;
  snowStartsAt: number;
  snowWinner: string;
  weatherCode: number;
  weatherTemp: number;
  weatherIsDay: boolean;
}

const ROOM_NAME = 'office';
/** 前幾次用 reconnectionToken 接回原座位；之後伺服器可能已重啟，改為重新加入 */
const RECONNECT_TOKEN_ATTEMPTS = 3;
/** 總重試視窗：需涵蓋免費雲端方案的冷啟動（約 30～60 秒） */
const RECONNECT_TOTAL_MS = 150_000;
const RECONNECT_BACKOFF_MS = [1000, 2000, 3000, 5000, 8000, 8000, 8000, 10_000];
/** 有人開著遊戲時定期打一次 /health，讓免費雲端方案不會因為沒有 HTTP 流量而休眠 */
const HEARTBEAT_MS = 4 * 60 * 1000;

/** Colyseus 正常離開的關閉碼（consented） */
const CLOSE_CONSENTED = 4000;
const CLOSE_NORMAL = 1000;

/** 查詢伺服端設定（dev 模式由 Vite proxy 轉發 /api 到 2567） */
export async function fetchServerConfig(): Promise<{ requireJoinCode: boolean }> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return { requireJoinCode: false };
    const data = (await res.json()) as { requireJoinCode?: unknown };
    return { requireJoinCode: data.requireJoinCode === true };
  } catch {
    return { requireJoinCode: false };
  }
}

function endpoint(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  if (import.meta.env.DEV) {
    return `${proto}://${location.hostname}:2567`;
  }
  return `${proto}://${location.host}`;
}

let client: Client | null = null;
let room: Room<OfficeStateShape> | null = null;
let leavingOnPurpose = false;
/** 最近一次成功加入的選項，重連失敗時用來重新加入 */
let lastJoinOptions: JoinOptions | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
/** 回到大廳後要顯示的訊息（例如被閒置移出）；reset() 會清空 store，所以先存在這裡 */
let pendingLobbyMessage: string | null = null;

/** 分頁前景/背景狀態回報，伺服端用來判斷是不是忘記關的分頁 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    room?.send(Messages.visibility, document.hidden);
  });
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeat = setInterval(() => {
    void fetch('/health', { cache: 'no-store' }).catch(() => {});
  }, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function bindRoom(r: Room<OfficeStateShape>): void {
  room = r;
  leavingOnPurpose = false;
  startHeartbeat();
  // 補報目前的分頁狀態（例如在背景分頁重連成功）
  if (typeof document !== 'undefined' && document.hidden) r.send(Messages.visibility, true);
  const store = useGame.getState();
  const $ = getStateCallbacks(r);

  store.resetPlayers();
  resetRuntime();

  $(r.state).players.onAdd((player, sessionId) => {
    const isMe = sessionId === r.sessionId;

    if (isMe) {
      // 以伺服端出生點為準
      local.x = player.x;
      local.z = player.z;
      local.rotY = player.rotY;
      useGame.getState().setMe({ sessionId, name: player.name, avatarId: player.avatarId });
    } else {
      remoteTargets.set(sessionId, { x: player.x, z: player.z, rotY: player.rotY, anim: player.anim, fresh: true });
    }

    const syncInfo = () =>
      useGame.getState().upsertPlayer({
        sessionId,
        name: player.name,
        avatarId: player.avatarId,
        status: player.status,
        seatId: player.seatId,
        fightMode: player.fightMode,
        hp: player.hp,
        duelWith: player.duelWith,
        weaponId: player.weaponId,
        ammo: player.ammo,
        onFire: player.onFire,
        snowMode: player.snowMode,
        snowTeam: player.snowTeam,
        npcSlayer: player.npcSlayer,
      });
    syncInfo();

    $(player).listen('status', syncInfo);
    $(player).listen('name', syncInfo);
    $(player).listen('seatId', syncInfo);
    $(player).listen('fightMode', syncInfo);
    $(player).listen('hp', syncInfo);
    $(player).listen('duelWith', syncInfo);
    $(player).listen('weaponId', syncInfo);
    $(player).listen('ammo', syncInfo);
    $(player).listen('onFire', syncInfo);
    $(player).listen('snowMode', syncInfo);
    $(player).listen('snowTeam', syncInfo);
    $(player).listen('npcSlayer', syncInfo);

    if (isMe) {
      // 坐下 / 起身由伺服端決定位置與朝向，本地收到後直接套用
      $(player).listen('seatId', (seatId) => {
        local.seatId = seatId;
        local.x = player.x;
        local.z = player.z;
        local.rotY = player.rotY;
        local.anim = seatId ? (SEAT_BY_ID.get(seatId)?.anim ?? 'sit') : 'idle';
        local.emote = null;
        useGame.getState().setSeated(Boolean(seatId));
      });
      $(player).listen('fightMode', (on) => {
        local.fightMode = on;
      });
      $(player).listen('weaponId', (id) => {
        local.weaponId = id;
      });
      // 雪仗狀態同步給 runtime：丟球的冷卻與移動夾制都讀這幾個值。
      // 自由模式是「走進場地就自動進入」，所以進出場都提示一下，免得東西突然被放下不知道發生什麼事
      $(player).listen('snowMode', (on) => {
        const was = local.snowMode;
        local.snowMode = on;
        if (on === was) return;
        if (on && !player.snowTeam) useGame.getState().showToast('⛄ 進入打雪仗場地：空白鍵丟雪球、雪堆旁按 E 補');
        else if (!on && !player.snowTeam) useGame.getState().showToast('離開打雪仗場地');
      });
      $(player).listen('snowTeam', (team) => {
        local.snowTeam = (team as SnowTeam) || '';
      });
      $(player).listen('ammo', (ammo) => {
        local.snowAmmo = ammo;
      });
      // 被爐火燒倒沒有 hit 事件，直接看血量歸零
      $(player).listen('hp', (hp) => {
        if (hp === 0 && !local.dead) {
          local.dead = true;
          local.seatId = '';
          local.knockback = null;
          useGame.getState().setSeated(false);
          useGame.getState().setDeadUntil(Date.now() + FIGHT.respawnMs);
        }
      });
    }

    if (!isMe) {
      $(player).onChange(() => {
        const t = remoteTargets.get(sessionId);
        if (!t) return;
        t.x = player.x;
        t.z = player.z;
        t.rotY = player.rotY;
        t.anim = player.anim;
      });
    }
  });

  $(r.state).pickups.onAdd((pickup, id) => {
    const sync = () => useGame.getState().upsertPickup({ id, weaponId: pickup.weaponId, x: pickup.x, z: pickup.z, y: pickup.y });
    sync();
    $(pickup).onChange(sync);
  });
  $(r.state).pickups.onRemove((_pickup, id) => {
    useGame.getState().removePickup(id);
  });

  $(r.state).pets.onAdd((pet, id) => {
    petTargets.set(id, {
      x: pet.x,
      z: pet.z,
      rotY: pet.rotY,
      anim: pet.anim,
      fresh: true,
      carrierId: pet.carrierId,
      feedCount: pet.feedCount,
      flight: null,
    });
    const sync = () =>
      useGame.getState().upsertPet({ id, petType: pet.petType, hp: pet.hp, carrierId: pet.carrierId, anim: pet.anim, feedCount: pet.feedCount });
    sync();
    // 高頻位置走可變 map（不觸發 re-render），血量與抱起狀態走 store
    $(pet).onChange(() => {
      const t = petTargets.get(id);
      if (!t) return;
      t.x = pet.x;
      t.z = pet.z;
      t.rotY = pet.rotY;
      t.anim = pet.anim;
      t.carrierId = pet.carrierId;
      t.feedCount = pet.feedCount;
    });
    $(pet).listen('hp', sync);
    $(pet).listen('carrierId', sync);
    $(pet).listen('anim', sync);
    $(pet).listen('feedCount', sync);
  });

  // 瓦斯爐狀態
  const syncStove = () =>
    useGame.getState().setStove({ foodId: r.state.stoveFoodId ?? '', stage: r.state.stoveStage ?? '' });
  $(r.state).listen('stoveFoodId', syncStove);
  $(r.state).listen('stoveStage', syncStove);

  // 烤箱狀態
  const syncOven = () => useGame.getState().setOven({ foodId: r.state.ovenFoodId ?? '', stage: r.state.ovenStage ?? '' });
  $(r.state).listen('ovenFoodId', syncOven);
  $(r.state).listen('ovenStage', syncOven);

  // 匹克球
  const syncCourt = () =>
    useGame.getState().setCourt({
      status: r.state.courtStatus ?? 'idle',
      aId: r.state.courtPlayerA ?? '',
      bId: r.state.courtPlayerB ?? '',
      scoreA: r.state.courtScoreA ?? 0,
      scoreB: r.state.courtScoreB ?? 0,
    });
  $(r.state).listen('courtStatus', syncCourt);
  $(r.state).listen('courtPlayerA', syncCourt);
  $(r.state).listen('courtPlayerB', syncCourt);
  $(r.state).listen('courtScoreA', syncCourt);
  $(r.state).listen('courtScoreB', syncCourt);

  // 打雪仗
  const syncSnow = () =>
    useGame.getState().setSnow({
      status: r.state.snowStatus ?? 'idle',
      startsAt: r.state.snowStartsAt ?? 0,
      winner: r.state.snowWinner ?? '',
    });
  $(r.state).listen('snowStatus', syncSnow);
  $(r.state).listen('snowStartsAt', syncSnow);
  $(r.state).listen('snowWinner', syncSnow);

  r.onMessage<CourtShotEvent>(Messages.courtShot, (ev) => {
    courtBall.flight = {
      fromX: ev.fromX,
      fromZ: ev.fromZ,
      toX: ev.toX,
      toZ: ev.toZ,
      arcH: ev.arcH,
      startAt: performance.now(),
      durationMs: ev.flightMs,
      bounceToX: ev.bounceToX,
      bounceToZ: ev.bounceToZ,
      bounceMs: ev.bounceMs,
      bounceArcH: ev.bounceArcH,
    };
    // 自動發球時發球者沒按空白鍵，補上揮拍動作
    if (ev.byId === r.sessionId) triggerSwing();
  });

  // 天氣
  const syncWeather = () =>
    useGame.getState().setWeather({ code: r.state.weatherCode ?? -1, temp: r.state.weatherTemp ?? 0, isDay: r.state.weatherIsDay ?? true });
  $(r.state).listen('weatherCode', syncWeather);
  $(r.state).listen('weatherTemp', syncWeather);
  $(r.state).listen('weatherIsDay', syncWeather);

  // 路人 NPC：場上固定一位，但 child schema 要等第一次 patch 才會建立，所以用 listen 等它出現
  const syncNpc = (npc: NpcState) => {
    npcTarget.x = npc.x;
    npcTarget.z = npc.z;
    npcTarget.rotY = npc.rotY;
    npcTarget.anim = npc.anim;
    npcTarget.carrierId = npc.carrierId;
    npcTarget.pinnedAt = npc.pinnedAt;
    useGame.getState().setNpc({ hp: npc.hp, anim: npc.anim, carrierId: npc.carrierId, pinnedAt: npc.pinnedAt, onFire: npc.onFire });
  };
  $(r.state).listen('npc', (npc) => {
    if (!npc) return;
    syncNpc(npc);
    npcTarget.fresh = true;
    $(npc).onChange(() => syncNpc(npc));
  });

  r.onMessage<{ text: string }>(Messages.npcSay, (ev) => {
    useGame.getState().showBubble(NPC.id, ev.text);
  });

  r.onMessage<NpcSpottedEvent>(Messages.npcSpotted, (ev) => {
    // 被他盯上：原地動彈不得，等他念完
    local.frozenUntil = performance.now() + ev.freezeMs;
    local.emote = null;
    local.dance = null;
    local.exercise = null;
    local.eatUntil = 0;
    useGame.getState().showToast(`😨 被${NPC.name}發現了…`);
  });

  r.onMessage<NpcCaughtEvent>(Messages.npcCaught, (ev) => {
    const s = useGame.getState();
    s.setDeskLockUntil(Date.now() + ev.lockMs);
    s.showToast(`⌨️ 被${NPC.name}抓回辦公室了`);
    setTimeout(() => {
      const st = useGame.getState();
      if (st.deskLockUntil !== null && st.deskLockUntil <= Date.now()) st.setDeskLockUntil(null);
    }, ev.lockMs + 50);
  });

  r.onMessage<PetFlightEvent>(Messages.petFlight, (ev) => {
    const t = petTargets.get(ev.petId);
    if (!t) return;
    t.flight = { fromX: ev.fromX, fromZ: ev.fromZ, toX: ev.toX, toZ: ev.toZ, startAt: performance.now(), durationMs: ev.durationMs };
  });
  $(r.state).pets.onRemove((_pet, id) => {
    petTargets.delete(id);
    useGame.getState().removePet(id);
  });

  r.onMessage<ProjectileEvent>(Messages.projectile, (ev) => {
    projectileQueue.push(ev);
  });

  $(r.state).players.onRemove((_player, sessionId) => {
    remoteTargets.delete(sessionId);
    useGame.getState().removePlayer(sessionId);
  });

  r.onMessage<ChatMessage>(Messages.chat, (msg) => {
    const s = useGame.getState();
    s.pushMessage({ id: msg.id, kind: 'chat', senderId: msg.senderId, name: msg.name, text: msg.text, ts: msg.ts });
    s.showBubble(msg.senderId, msg.text);
    if (msg.senderId !== r.sessionId && (document.hidden || !document.hasFocus())) {
      nativeNotify(`${msg.name}`, msg.text);
    }
  });

  r.onMessage<HitEvent>(Messages.hit, (ev) => {
    bloodQueue.push({ x: ev.x, z: ev.z, dirX: ev.dirX, dirZ: ev.dirZ, heavy: ev.killed, snow: ev.snow === true });
    if (ev.targetId !== r.sessionId) return;
    // 自己被打：套用伺服端算好的擊退位置，面向攻擊者
    applyKnockback(ev.toX, ev.toZ, -ev.dirX, -ev.dirZ);
    // 雪球不會真的打死人：血歸零是出局，退出雪仗模式的狀態由 snowMode 欄位帶回來
    if (ev.killed && ev.snow) {
      useGame.getState().showToast('⛄ 你被雪球打出局了');
      return;
    }
    if (ev.killed) {
      local.dead = true;
      local.seatId = '';
      useGame.getState().setSeated(false);
      useGame.getState().setDeadUntil(Date.now() + FIGHT.respawnMs);
    }
  });

  r.onMessage<DuelEvent>(Messages.duel, (ev) => {
    const s = useGame.getState();
    switch (ev.kind) {
      case 'invite':
        s.setDuelInvite({ fromId: ev.fromId, fromName: ev.fromName, expiresAt: ev.expiresAt });
        nativeNotify('⚔️ 戰鬥邀請', `${ev.fromName} 向你發出戰鬥邀請`);
        flashTitle('⚔️ 戰鬥邀請！');
        beep('invite');
        break;
      case 'sent':
        s.setPendingDuelTo(ev.toName);
        s.showToast(`已向 ${ev.toName} 送出戰鬥邀請，等待回應…`);
        break;
      case 'declined':
        s.setPendingDuelTo(null);
        s.showToast(
          ev.reason === 'timeout' ? `${ev.byName} 沒有回應戰鬥邀請` : ev.reason === 'busy' ? `${ev.byName || '對方'} 目前無法決鬥` : `${ev.byName || '對方'} 拒絕了決鬥`,
        );
        break;
      case 'start':
        s.setPendingDuelTo(null);
        if (ev.aId === r.sessionId || ev.bId === r.sessionId) {
          s.setDuelInvite(null);
          stopFlashTitle();
        }
        s.setDuel({ aId: ev.aId, bId: ev.bId, startsAt: ev.startsAt });
        break;
      case 'end': {
        const endedAt = Date.now();
        s.setDuel({ aId: ev.winnerId, bId: ev.loserId, startsAt: 0, winnerId: ev.winnerId, winnerName: ev.winnerName, loserName: ev.loserName, endedAt });
        setTimeout(() => {
          const cur = useGame.getState().duel;
          if (cur?.endedAt === endedAt) useGame.getState().setDuel(null);
        }, DUEL.resultBannerMs);
        break;
      }
    }
  });

  r.onMessage<RespawnEvent>(Messages.respawn, (ev) => {
    if (ev.sessionId !== r.sessionId) return;
    local.x = ev.x;
    local.z = ev.z;
    local.rotY = 0;
    local.dead = false;
    local.knockback = null;
    local.staggerUntil = 0;
    useGame.getState().setDeadUntil(null);
  });

  r.onMessage<IdleEvent>(Messages.idle, (ev) => {
    const s = useGame.getState();
    if (ev.kind === 'warn') {
      s.setIdleWarning({ reason: ev.reason ?? 'inactive', deadline: Date.now() + (ev.remainingMs ?? 0) });
    } else if (ev.kind === 'clear') {
      s.setIdleWarning(null);
    } else {
      s.setIdleWarning(null);
      pendingLobbyMessage =
        ev.reason === 'hidden' ? '分頁閒置過久，已自動離開辦公室' : '閒置過久，已自動離開辦公室';
    }
  });

  r.onMessage<SystemMessage>(Messages.system, (msg) => {
    useGame.getState().pushMessage({ id: `sys-${msg.ts}-${Math.random()}`, kind: 'system', text: msg.text, ts: msg.ts });
  });

  r.onError((code, message) => {
    useGame.getState().setError(`連線錯誤 (${code})：${message ?? ''}`);
  });

  r.onLeave((code) => {
    room = null;
    if (leavingOnPurpose || code === CLOSE_CONSENTED || code === CLOSE_NORMAL) {
      stopHeartbeat();
      resetRuntime();
      useGame.getState().reset();
      if (pendingLobbyMessage) {
        useGame.getState().setError(pendingLobbyMessage);
        pendingLobbyMessage = null;
      }
      return;
    }
    void tryReconnect(r.reconnectionToken);
  });
}

/**
 * 斷線後自動接回。前幾次用 token 接回原座位（涵蓋網路短暫中斷）；
 * 若伺服器已重啟（免費雲端方案休眠後行程是全新的，token 必然失效），
 * 改以原本的暱稱與角色重新加入。總視窗 150 秒，足以等待冷啟動。
 */
async function tryReconnect(token: string): Promise<void> {
  useGame.getState().setPhase('reconnecting');
  const deadline = Date.now() + RECONNECT_TOTAL_MS;
  let attempt = 0;

  while (Date.now() < deadline && client && !leavingOnPurpose) {
    attempt += 1;
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const useToken = attempt <= RECONNECT_TOKEN_ATTEMPTS;
    useGame
      .getState()
      .setReconnectStatus(`${useToken ? '嘗試接回原本的位置' : '伺服器可能正在喚醒，重新加入中'}（第 ${attempt} 次，${secondsLeft} 秒後放棄）`);

    try {
      if (!useToken && !lastJoinOptions) break;
      const r = useToken
        ? await client.reconnect<OfficeStateShape>(token)
        : await client.joinOrCreate<OfficeStateShape>(ROOM_NAME, lastJoinOptions!);
      bindRoom(r);
      const s = useGame.getState();
      s.setPhase('office');
      s.setError(null);
      s.setReconnectStatus(null);
      return;
    } catch {
      const wait = RECONNECT_BACKOFF_MS[Math.min(attempt - 1, RECONNECT_BACKOFF_MS.length - 1)];
      await new Promise((res) => setTimeout(res, wait));
    }
  }

  stopHeartbeat();
  resetRuntime();
  useGame.getState().reset();
  if (!leavingOnPurpose) useGame.getState().setError('與伺服器斷線，請重新進入');
}

/** 放棄重連，回到大廳 */
export function cancelReconnect(): void {
  leavingOnPurpose = true;
  stopHeartbeat();
  resetRuntime();
  useGame.getState().reset();
}

export async function connect(options: JoinOptions): Promise<void> {
  const store = useGame.getState();
  store.setError(null);
  store.setPhase('connecting');

  try {
    client = client ?? new Client(endpoint());
    const r = await client.joinOrCreate<OfficeStateShape>(ROOM_NAME, options);
    lastJoinOptions = options;
    pendingLobbyMessage = null;
    bindRoom(r);
    useGame.getState().setPhase('office');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setPhase('lobby');
    // 伺服端明確回覆的使用者錯誤直接顯示，其餘視為連線問題
    const userFacing = /暱稱|密碼/.test(message);
    store.setError(userFacing ? message : `無法連線到伺服器：${message}`);
  }
}

export function disconnect(): void {
  leavingOnPurpose = true;
  stopHeartbeat();
  room?.leave(true);
  room = null;
}

export function sendMove(payload: MovePayload): void {
  room?.send(Messages.move, payload);
}

export function sendSit(seatId: string): void {
  const payload: SitPayload = { seatId };
  room?.send(Messages.sit, payload);
}

export function sendStand(): void {
  room?.send(Messages.stand);
}

export function sendDuel(action: DuelAction): void {
  room?.send(Messages.duel, action);
}

export function sendPickup(pickupId: string): void {
  const payload: PickupPayload = { pickupId };
  room?.send(Messages.pickup, payload);
}

export function sendDrop(): void {
  room?.send(Messages.drop);
}

export function sendSnowJoin(team: SnowTeam): void {
  const payload: SnowJoinPayload = { team };
  room?.send(Messages.snowJoin, payload);
}

export function sendSnowLeave(): void {
  room?.send(Messages.snowLeave);
}

export function sendSnowReload(): void {
  room?.send(Messages.snowReload);
}

export function sendCourtJoin(side: CourtSide): void {
  room?.send(Messages.courtJoin, { side });
}

export function sendCourtLeave(): void {
  room?.send(Messages.courtLeave);
}

export function sendSwing(payload: SwingPayload): void {
  room?.send(Messages.swing, payload);
}

export function sendFeedPet(petId: string): void {
  room?.send(Messages.feedPet, { petId });
}

export function sendStovePlace(): void {
  room?.send(Messages.stovePlace);
}

export function sendStoveTake(): void {
  room?.send(Messages.stoveTake);
}

export function sendOvenPlace(): void {
  room?.send(Messages.ovenPlace);
}

export function sendOvenTake(): void {
  room?.send(Messages.ovenTake);
}

/**
 * 吃掉手上的食物：本地先播進食動作，咬下第一口時才通知伺服端，
 * 食物才不會在動作一開始就從手上消失。動作播完前重複呼叫會被 startEat 擋掉。
 */
export function eatHeldFood(): void {
  if (!startEat()) return;
  setTimeout(() => room?.send(Messages.eat), EAT.sendDelayMs);
}

export function sendNpcPickup(): void {
  if (performance.now() < local.frozenUntil) return; // 被丁oe念到定住時拖不動他
  room?.send(Messages.npcPickup);
}

export function sendNpcDrop(): void {
  room?.send(Messages.npcDrop);
}

/** 按住／放開「把路人押進危險區」；on=false 一定要送，不然他會被按到死 */
export function sendNpcPin(on: boolean): void {
  const payload: NpcPinPayload = { on };
  room?.send(Messages.npcPin, payload);
}

export function sendPetPickup(petId: string): void {
  room?.send(Messages.petPickup, { petId });
}

export function sendPetDrop(): void {
  room?.send(Messages.petDrop);
}

export function sendPetThrow(): void {
  room?.send(Messages.petThrow);
}

export function sendToggleFight(on: boolean): void {
  room?.send(Messages.toggleFight, on);
}

export function sendAttack(): void {
  room?.send(Messages.attack);
}

export function sendStatus(text: string): void {
  room?.send(Messages.setStatus, text);
}

export function sendChat(text: string): void {
  room?.send(Messages.chat, text);
}

export function isConnected(): boolean {
  return room !== null;
}
