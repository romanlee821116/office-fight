import { create } from 'zustand';
import { BUBBLE_DURATION_MS, CHAT_HISTORY } from '@office/shared';

export type Phase = 'lobby' | 'connecting' | 'office' | 'reconnecting';

const WEATHER_FX_KEY = 'office:weatherFx';
const SCENE_THEME_KEY = 'office:sceneTheme';

/** 即時天氣效果的個人偏好，預設開啟 */
function readWeatherEnabled(): boolean {
  try {
    return localStorage.getItem(WEATHER_FX_KEY) !== '0';
  } catch {
    return true;
  }
}

/** 場景主題的個人偏好，預設原本的辦公室（未知 id 由 getTheme 退回預設） */
function readSceneTheme(): string {
  try {
    return localStorage.getItem(SCENE_THEME_KEY) ?? 'office';
  } catch {
    return 'office';
  }
}

/** 名單 / 名牌用的玩家資訊（不含高頻位置） */
export interface PlayerInfo {
  sessionId: string;
  name: string;
  avatarId: string;
  status: string;
  /** 目前坐的座位 id，空字串代表站立 */
  seatId: string;
  fightMode: boolean;
  hp: number;
  /** 被爐火燒到，頭上冒火中 */
  onFire: boolean;
  /** 決鬥對手 sessionId，空字串代表未在決鬥 */
  duelWith: string;
  /** 手上的武器 id，空字串代表拳頭 */
  weaponId: string;
  ammo: number;
}

/** 路人 NPC 的名牌資料；位置與朝向不進 store，走 runtime 的 npcTarget 逐幀插補 */
export interface NpcInfo {
  hp: number;
  anim: string;
}

export interface PetInfo {
  id: string;
  petType: string;
  hp: number;
  /** 抱著牠的玩家 sessionId，空字串代表在地上 */
  carrierId: string;
  /** 目前動作（顯示進食愛心用） */
  anim: string;
  /** 被餵了幾次（影響體型與名牌高度） */
  feedCount: number;
}

export interface PickupInfo {
  id: string;
  weaponId: string;
  x: number;
  z: number;
  y: number;
}

export interface DuelInviteInfo {
  fromId: string;
  fromName: string;
  expiresAt: number;
}

export interface DuelInfo {
  aId: string;
  bId: string;
  startsAt: number;
  /** 結束後填入，用於顯示結果橫幅 */
  winnerId?: string;
  winnerName?: string;
  loserName?: string;
  endedAt?: number;
}

export interface LocalIdentity {
  sessionId: string;
  name: string;
  avatarId: string;
}

export interface ChatEntry {
  id: string;
  kind: 'chat' | 'system';
  senderId?: string;
  name?: string;
  text: string;
  ts: number;
}

interface Bubble {
  text: string;
  until: number;
}

interface GameState {
  phase: Phase;
  error: string | null;
  me: LocalIdentity | null;
  players: Record<string, PlayerInfo>;
  messages: ChatEntry[];
  bubbles: Record<string, Bubble>;
  unread: number;
  chatOpen: boolean;
  statusOpen: boolean;
  /** 本地玩家附近可坐的座位 */
  nearSeatId: string | null;
  /** 本地玩家附近可撿的武器 */
  nearPickupId: string | null;
  /** 本地玩家附近可抱起的寵物 */
  nearPetId: string | null;
  /** 本地玩家是否在瓦斯爐互動範圍內 */
  nearStove: boolean;
  /** 瓦斯爐狀態（伺服端同步） */
  stove: { foodId: string; stage: string };
  /** 本地玩家是否在烤箱互動範圍內 */
  nearOven: boolean;
  /** 烤箱狀態（伺服端同步） */
  oven: { foodId: string; stage: string };
  /** 即時天氣（伺服端每 30 分鐘更新） */
  weather: { code: number; temp: number; isDay: boolean };
  /** 是否套用即時天氣效果（個人設定，存 localStorage，預設開） */
  weatherEnabled: boolean;
  /** 場景主題 id（只影響自己的畫面，存 localStorage） */
  sceneTheme: string;
  /** 主題模型載入中（HUD 顯示提示） */
  sceneThemeLoading: boolean;
  /** 匹克球比賽狀態（伺服端同步） */
  court: { status: string; aId: string; bId: string; scoreA: number; scoreB: number };
  /** 本地玩家附近的報名點 */
  nearCourtSlot: 'A' | 'B' | null;
  /** 地上的武器 */
  pickups: Record<string, PickupInfo>;
  /** 辦公室寵物 */
  pets: Record<string, PetInfo>;
  /** 路人 NPC（場上固定一位） */
  npc: NpcInfo;
  /** 本地玩家是否坐著 */
  seated: boolean;
  /** 本地玩家倒地的復活時間（Date.now 基準），null 代表存活 */
  deadUntil: number | null;
  /** 收到的決鬥邀請 */
  duelInvite: DuelInviteInfo | null;
  /** 我送出、尚未回應的邀請對象名稱 */
  pendingDuelTo: string | null;
  /** 場上進行中（或剛結束）的決鬥 */
  duel: DuelInfo | null;
  /** 短暫提示 */
  toast: string | null;
  /** 重連進度說明（phase 為 reconnecting 時顯示） */
  reconnectStatus: string | null;
  /** 閒置警告：到期時間（Date.now 基準）與原因 */
  idleWarning: { reason: 'hidden' | 'inactive'; deadline: number } | null;

  setPhase: (phase: Phase) => void;
  setError: (error: string | null) => void;
  setMe: (me: LocalIdentity | null) => void;
  upsertPlayer: (player: PlayerInfo) => void;
  removePlayer: (sessionId: string) => void;
  resetPlayers: () => void;
  pushMessage: (entry: ChatEntry) => void;
  showBubble: (sessionId: string, text: string) => void;
  clearBubble: (sessionId: string, until: number) => void;
  setChatOpen: (open: boolean) => void;
  setStatusOpen: (open: boolean) => void;
  setNearSeat: (seatId: string | null) => void;
  setNearPickup: (pickupId: string | null) => void;
  setNearPet: (petId: string | null) => void;
  setNearStove: (near: boolean) => void;
  setStove: (stove: { foodId: string; stage: string }) => void;
  setNearOven: (near: boolean) => void;
  setOven: (oven: { foodId: string; stage: string }) => void;
  setWeather: (weather: { code: number; temp: number; isDay: boolean }) => void;
  setWeatherEnabled: (enabled: boolean) => void;
  setSceneTheme: (id: string) => void;
  setSceneThemeLoading: (loading: boolean) => void;
  setCourt: (court: { status: string; aId: string; bId: string; scoreA: number; scoreB: number }) => void;
  setNearCourtSlot: (slot: 'A' | 'B' | null) => void;
  upsertPickup: (pickup: PickupInfo) => void;
  removePickup: (id: string) => void;
  setNpc: (npc: NpcInfo) => void;
  upsertPet: (pet: PetInfo) => void;
  removePet: (id: string) => void;
  setSeated: (seated: boolean) => void;
  setDeadUntil: (deadUntil: number | null) => void;
  setDuelInvite: (invite: DuelInviteInfo | null) => void;
  setPendingDuelTo: (name: string | null) => void;
  setDuel: (duel: DuelInfo | null) => void;
  showToast: (text: string) => void;
  setReconnectStatus: (text: string | null) => void;
  setIdleWarning: (warning: { reason: 'hidden' | 'inactive'; deadline: number } | null) => void;
  reset: () => void;
}

const initial = {
  phase: 'lobby' as Phase,
  error: null,
  me: null,
  players: {},
  messages: [],
  bubbles: {},
  unread: 0,
  chatOpen: false,
  statusOpen: false,
  nearSeatId: null,
  nearPickupId: null,
  nearPetId: null,
  nearStove: false,
  stove: { foodId: '', stage: '' },
  nearOven: false,
  oven: { foodId: '', stage: '' },
  weather: { code: -1, temp: 0, isDay: true },
  weatherEnabled: readWeatherEnabled(),
  sceneTheme: readSceneTheme(),
  sceneThemeLoading: false,
  court: { status: 'idle', aId: '', bId: '', scoreA: 0, scoreB: 0 },
  nearCourtSlot: null,
  pickups: {},
  pets: {},
  npc: { hp: 0, anim: 'idle' },
  seated: false,
  deadUntil: null,
  duelInvite: null,
  pendingDuelTo: null,
  duel: null,
  toast: null,
  reconnectStatus: null,
  idleWarning: null,
};

export const useGame = create<GameState>((set) => ({
  ...initial,

  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  setMe: (me) => set({ me }),

  upsertPlayer: (player) =>
    set((s) => ({ players: { ...s.players, [player.sessionId]: player } })),

  removePlayer: (sessionId) =>
    set((s) => {
      const players = { ...s.players };
      delete players[sessionId];
      const bubbles = { ...s.bubbles };
      delete bubbles[sessionId];
      return { players, bubbles };
    }),

  resetPlayers: () => set({ players: {}, bubbles: {}, pickups: {}, pets: {} }),

  pushMessage: (entry) =>
    set((s) => ({
      messages: [...s.messages, entry].slice(-CHAT_HISTORY),
      unread: s.chatOpen || entry.kind === 'system' ? s.unread : s.unread + 1,
    })),

  showBubble: (sessionId, text) => {
    const until = Date.now() + BUBBLE_DURATION_MS;
    set((s) => ({ bubbles: { ...s.bubbles, [sessionId]: { text, until } } }));
    setTimeout(() => useGame.getState().clearBubble(sessionId, until), BUBBLE_DURATION_MS);
  },

  clearBubble: (sessionId, until) =>
    set((s) => {
      if (s.bubbles[sessionId]?.until !== until) return s;
      const bubbles = { ...s.bubbles };
      delete bubbles[sessionId];
      return { bubbles };
    }),

  setChatOpen: (open) => set((s) => ({ chatOpen: open, unread: open ? 0 : s.unread })),
  setStatusOpen: (open) => set({ statusOpen: open }),
  setNearSeat: (nearSeatId) => set((s) => (s.nearSeatId === nearSeatId ? s : { nearSeatId })),
  setNearPickup: (nearPickupId) => set((s) => (s.nearPickupId === nearPickupId ? s : { nearPickupId })),
  setNearPet: (nearPetId) => set((s) => (s.nearPetId === nearPetId ? s : { nearPetId })),
  setNearStove: (nearStove) => set((s) => (s.nearStove === nearStove ? s : { nearStove })),
  setStove: (stove) => set({ stove }),
  setNearOven: (nearOven) => set((s) => (s.nearOven === nearOven ? s : { nearOven })),
  setOven: (oven) => set({ oven }),
  setWeather: (weather) => set({ weather }),
  setCourt: (court) => set({ court }),
  setNearCourtSlot: (nearCourtSlot) => set((s) => (s.nearCourtSlot === nearCourtSlot ? s : { nearCourtSlot })),
  setWeatherEnabled: (weatherEnabled) => {
    try {
      localStorage.setItem(WEATHER_FX_KEY, weatherEnabled ? '1' : '0');
    } catch {
      // 忽略儲存失敗
    }
    set({ weatherEnabled });
  },
  setSceneTheme: (sceneTheme) => {
    try {
      localStorage.setItem(SCENE_THEME_KEY, sceneTheme);
    } catch {
      // 忽略儲存失敗
    }
    set({ sceneTheme });
  },
  setSceneThemeLoading: (sceneThemeLoading) => set((s) => (s.sceneThemeLoading === sceneThemeLoading ? s : { sceneThemeLoading })),
  upsertPickup: (pickup) => set((s) => ({ pickups: { ...s.pickups, [pickup.id]: pickup } })),
  removePickup: (id) =>
    set((s) => {
      const pickups = { ...s.pickups };
      delete pickups[id];
      return { pickups };
    }),
  setNpc: (npc) => set({ npc }),
  upsertPet: (pet) => set((s) => ({ pets: { ...s.pets, [pet.id]: pet } })),
  removePet: (id) =>
    set((s) => {
      const pets = { ...s.pets };
      delete pets[id];
      return { pets };
    }),
  setSeated: (seated) => set((s) => (s.seated === seated ? s : { seated })),
  setDeadUntil: (deadUntil) => set({ deadUntil }),
  setDuelInvite: (duelInvite) => set({ duelInvite }),
  setPendingDuelTo: (pendingDuelTo) => set({ pendingDuelTo }),
  setDuel: (duel) => set({ duel }),
  setReconnectStatus: (reconnectStatus) => set({ reconnectStatus }),
  setIdleWarning: (idleWarning) => set({ idleWarning }),
  showToast: (text) => {
    set({ toast: text });
    setTimeout(() => {
      if (useGame.getState().toast === text) set({ toast: null });
    }, 4000);
  },

  // 回大廳重置時保留個人偏好，否則會退回進場當下的 localStorage 值
  reset: () => set((s) => ({ ...initial, weatherEnabled: s.weatherEnabled, sceneTheme: s.sceneTheme })),
}));
