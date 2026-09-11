import { create } from 'zustand';
import { BUBBLE_DURATION_MS, CHAT_HISTORY } from '@office/shared';

export type Phase = 'lobby' | 'connecting' | 'office' | 'reconnecting';

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
  /** 決鬥對手 sessionId，空字串代表未在決鬥 */
  duelWith: string;
  /** 手上的武器 id，空字串代表拳頭 */
  weaponId: string;
  ammo: number;
}

export interface PetInfo {
  id: string;
  petType: string;
  hp: number;
  /** 抱著牠的玩家 sessionId，空字串代表在地上 */
  carrierId: string;
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
  /** 地上的武器 */
  pickups: Record<string, PickupInfo>;
  /** 辦公室寵物 */
  pets: Record<string, PetInfo>;
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
  upsertPickup: (pickup: PickupInfo) => void;
  removePickup: (id: string) => void;
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
  pickups: {},
  pets: {},
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
  upsertPickup: (pickup) => set((s) => ({ pickups: { ...s.pickups, [pickup.id]: pickup } })),
  removePickup: (id) =>
    set((s) => {
      const pickups = { ...s.pickups };
      delete pickups[id];
      return { pickups };
    }),
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

  reset: () => set({ ...initial }),
}));
