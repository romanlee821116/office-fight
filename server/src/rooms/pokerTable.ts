import { POKER, evaluateHand, makeDeck, shuffle, type HandResult } from '@office/shared';
import { randomInt } from 'node:crypto';

/**
 * 德州撲克牌局引擎。
 *
 * 刻意不碰 Colyseus：這裡只有牌、籌碼與規則，時間一律由外面傳 `now` 進來，
 * 推進則統一走 tick()。好處是一整手牌可以在測試裡用假時間快轉跑完
 * （見 scripts/poker-check.mts），不必真的等三十秒的行動超時。
 *
 * 底牌只存在這個物件裡，永遠不會進 schema——state 是廣播給全場的，
 * 底牌一旦放進去，任何人開 devtools 就能看到整桌的牌。
 */

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionKind = 'fold' | 'check' | 'call' | 'raise';

export interface Seat {
  id: string;
  name: string;
  isNpc: boolean;
  /** 桌上籌碼（買入時從帳號金幣換來，離座時換回去） */
  chips: number;
  /** 本輪已投入 */
  bet: number;
  /** 本手累計投入，邊池就是照這個分層 */
  committed: number;
  folded: boolean;
  allIn: boolean;
  hole: number[];
  /** 這手牌有沒有參與（中途入座的人要等下一手） */
  inHand: boolean;
  /** 本輪行動過沒有：大盲的 option 靠這個判斷 */
  acted: boolean;
}

export interface Pot {
  amount: number;
  /** 有資格爭這個池的座位 id */
  eligible: string[];
}

export interface ShowdownEntry {
  id: string;
  hole: number[];
  hand: HandResult;
}

/** 引擎吐出來的事件，由外層決定要廣播什麼、怎麼播 */
export type PokerEvent =
  | { kind: 'handStart'; dealer: number; sb: string; bb: string }
  | { kind: 'hole'; id: string; cards: number[] }
  | { kind: 'action'; id: string; action: ActionKind; amount: number; allIn: boolean }
  | { kind: 'street'; street: Street; board: number[] }
  | { kind: 'showdown'; entries: ShowdownEntry[] }
  | { kind: 'payout'; winners: { id: string; amount: number; reason: string }[] }
  | { kind: 'handEnd' };

/**
 * 把每個人這手牌投入的籌碼切成主池與邊池。
 *
 * 做法是照「投入額」分層：每個不同的投入額是一道界線，該層的金額由所有人
 * 各出「不超過自己投入額」的那一段，有資格分的是蓋牌以外、投入達到該層的人。
 * 蓋牌者的籌碼留在池子裡（只是沒資格分），這點是常見的實作錯誤。
 */
export function buildPots(seats: readonly Pick<Seat, 'id' | 'committed' | 'folded'>[]): Pot[] {
  const levels = [...new Set(seats.filter((s) => s.committed > 0).map((s) => s.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.min(s.committed, level) - Math.min(s.committed, prev);
    const eligible = seats.filter((s) => !s.folded && s.committed >= level).map((s) => s.id);
    if (amount <= 0) {
      prev = level;
      continue;
    }
    // 這一層沒人有資格（全部蓋牌）就併進上一個池，錢不會憑空消失
    if (eligible.length === 0 && pots.length > 0) pots[pots.length - 1].amount += amount;
    else if (eligible.length > 0) pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

/**
 * 依各池的資格與牌力分錢。
 *
 * 平分除不盡的零頭給「位置最前」的贏家（order 是從莊家左手邊算起的順序），
 * 這是賭場的慣例，也保證同樣的牌局每次分法一致。
 */
export function settlePots(pots: readonly Pot[], scores: ReadonlyMap<string, number>, order: readonly string[]): Map<string, number> {
  const payout = new Map<string, number>();
  for (const pot of pots) {
    const contenders = pot.eligible.filter((id) => scores.has(id));
    if (contenders.length === 0) continue;
    let best = -Infinity;
    for (const id of contenders) best = Math.max(best, scores.get(id)!);
    const winners = contenders.filter((id) => scores.get(id) === best);
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const ordered = [...winners].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const id of ordered) {
      let take = share;
      if (remainder > 0) {
        take += 1;
        remainder -= 1;
      }
      payout.set(id, (payout.get(id) ?? 0) + take);
    }
  }
  return payout;
}

export class PokerTable {
  readonly seats: (Seat | null)[] = Array.from({ length: POKER.seatCount }, () => null);
  street: Street = 'idle';
  board: number[] = [];
  dealer = -1;
  /** 輪到誰（座位索引），-1 代表現在不等任何人行動 */
  toAct = -1;
  /** 行動期限或下一步的排程時間 */
  deadline = 0;
  /** 本輪最高下注額 */
  currentBet = 0;
  /** 下一次加注至少要比 currentBet 多多少 */
  minRaise = POKER.bigBlind;
  /** 已結算但還在展示的池子總額（UI 顯示用） */
  pot = 0;
  events: PokerEvent[] = [];
  /** 攤牌結果，供外層廣播與 UI 顯示 */
  lastShowdown: ShowdownEntry[] = [];

  private deck: number[] = [];
  /** 下一手的排程時間；0 代表沒有排程 */
  private nextHandAt = 0;

  // ---- 座位管理 ----

  seatOf(id: string): number {
    return this.seats.findIndex((s) => s?.id === id);
  }

  occupied(): Seat[] {
    return this.seats.filter((s): s is Seat => s !== null);
  }

  /** 還能行動的人（沒蓋牌、沒全下） */
  private actives(): Seat[] {
    return this.occupied().filter((s) => s.inHand && !s.folded && !s.allIn);
  }

  /** 還在這手牌裡的人（含全下） */
  private contenders(): Seat[] {
    return this.occupied().filter((s) => s.inHand && !s.folded);
  }

  sit(index: number, seat: Omit<Seat, 'bet' | 'committed' | 'folded' | 'allIn' | 'hole' | 'inHand' | 'acted'>): boolean {
    if (index < 0 || index >= this.seats.length || this.seats[index]) return false;
    this.seats[index] = { ...seat, bet: 0, committed: 0, folded: false, allIn: false, hole: [], inHand: false, acted: false };
    return true;
  }

  /** 空位索引，從 0 開始找 */
  freeSeat(): number {
    return this.seats.findIndex((s) => s === null);
  }

  /**
   * 離座。回傳要退還的桌上籌碼。
   * 牌局進行中離座視同蓋牌，已經投入池子的籌碼拿不回來（跟真實牌桌一樣）。
   */
  leave(id: string): number {
    const index = this.seatOf(id);
    if (index < 0) return 0;
    const seat = this.seats[index]!;
    const refund = seat.chips;
    if (seat.inHand && !seat.folded) {
      seat.folded = true;
      // 正在等他行動就把行動權交出去，別讓牌桌卡住
      if (this.toAct === index) this.afterAction(index);
    }
    this.seats[index] = null;
    if (this.street !== 'idle' && this.contenders().length <= 1) this.finishHand();
    return refund;
  }

  // ---- 一手牌的流程 ----

  canStart(): boolean {
    return this.street === 'idle' && this.occupied().filter((s) => s.chips > 0).length >= 2;
  }

  startHand(now: number): void {
    if (!this.canStart()) return;
    const players = this.occupied().filter((s) => s.chips > 0);
    this.deck = shuffle(makeDeck(), (n) => randomInt(n));
    this.board = [];
    this.pot = 0;
    this.lastShowdown = [];
    this.nextHandAt = 0;

    for (const s of this.occupied()) {
      s.bet = 0;
      s.committed = 0;
      s.folded = false;
      s.allIn = false;
      s.acted = false;
      s.hole = [];
      s.inHand = s.chips > 0;
    }

    // 莊家鈕往左移到下一個有籌碼的人
    this.dealer = this.nextOccupied(this.dealer, (s) => s.inHand);
    const headsUp = players.length === 2;
    // 單挑時莊家就是小盲；三人以上莊家左手邊是小盲
    const sbIndex = headsUp ? this.dealer : this.nextOccupied(this.dealer, (s) => s.inHand);
    const bbIndex = this.nextOccupied(sbIndex, (s) => s.inHand);

    for (const s of this.contenders()) s.hole = [this.deck.pop()!, this.deck.pop()!];

    this.postBlind(sbIndex, POKER.smallBlind);
    this.postBlind(bbIndex, POKER.bigBlind);
    this.currentBet = POKER.bigBlind;
    this.minRaise = POKER.bigBlind;
    this.street = 'preflop';

    this.events.push({ kind: 'handStart', dealer: this.dealer, sb: this.seats[sbIndex]!.id, bb: this.seats[bbIndex]!.id });
    for (const s of this.contenders()) this.events.push({ kind: 'hole', id: s.id, cards: s.hole });

    // 盲注不算「行動過」，大盲因此保有最後加注的權利（option）
    this.seats[sbIndex]!.acted = false;
    this.seats[bbIndex]!.acted = false;
    // 單挑時莊家（小盲）preflop 先行動，否則從大盲左手邊開始
    this.beginAction(headsUp ? sbIndex : this.nextOccupied(bbIndex, (s) => s.inHand && !s.folded && !s.allIn), now);
  }

  private postBlind(index: number, amount: number): void {
    const seat = this.seats[index]!;
    const put = Math.min(amount, seat.chips);
    seat.chips -= put;
    seat.bet += put;
    seat.committed += put;
    if (seat.chips === 0) seat.allIn = true;
  }

  /** 從 index 往左找下一個符合條件的座位；找不到回傳 index 本身 */
  private nextOccupied(index: number, ok: (s: Seat) => boolean): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step++) {
      const i = (index + step + n) % n;
      const s = this.seats[i];
      if (s && ok(s)) return i;
    }
    return index;
  }

  private beginAction(index: number, now: number): void {
    const seat = this.seats[index];
    if (!seat || seat.folded || seat.allIn || !seat.inHand) {
      this.afterAction(index, now);
      return;
    }
    this.toAct = index;
    this.deadline = now + (seat.isNpc ? randomInt(POKER.npcThinkMinMs, POKER.npcThinkMaxMs) : POKER.actionTimeoutMs);
  }

  /** 跟注需要補的額度（可能超過手上籌碼，代表只能全下） */
  callAmount(seat: Seat): number {
    return Math.max(0, this.currentBet - seat.bet);
  }

  /** 這個人現在合法的最小／最大加注「總額」 */
  raiseBounds(seat: Seat): { min: number; max: number } {
    const max = seat.bet + seat.chips;
    const min = Math.min(this.currentBet + this.minRaise, max);
    return { min, max };
  }

  /**
   * 執行一個動作。回傳 false 代表不合法（外層應該忽略，不要當成棄牌）。
   * `amount` 只有 raise 會用到，指的是「這一輪下注的總額」而不是加注的增量。
   */
  act(id: string, action: ActionKind, amount: number, now: number): boolean {
    const index = this.seatOf(id);
    if (index < 0 || index !== this.toAct) return false;
    const seat = this.seats[index]!;
    if (seat.folded || seat.allIn || !seat.inHand) return false;

    const toCall = this.callAmount(seat);
    switch (action) {
      case 'fold': {
        seat.folded = true;
        this.events.push({ kind: 'action', id, action: 'fold', amount: 0, allIn: false });
        break;
      }
      case 'check': {
        if (toCall > 0) return false;
        this.events.push({ kind: 'action', id, action: 'check', amount: 0, allIn: false });
        break;
      }
      case 'call': {
        const put = Math.min(toCall, seat.chips);
        seat.chips -= put;
        seat.bet += put;
        seat.committed += put;
        if (seat.chips === 0) seat.allIn = true;
        this.events.push({ kind: 'action', id, action: 'call', amount: put, allIn: seat.allIn });
        break;
      }
      case 'raise': {
        const { min, max } = this.raiseBounds(seat);
        const target = Math.floor(amount);
        // 籌碼不夠正規加注時只能全下；其餘一律要達到最小加注
        if (target > max) return false;
        if (target < min && target !== max) return false;
        if (target <= seat.bet) return false;
        const put = target - seat.bet;
        seat.chips -= put;
        seat.bet = target;
        seat.committed += put;
        if (seat.chips === 0) seat.allIn = true;
        // 只有達到合法加注幅度才會重開下注輪（短全下不重開）
        const raiseBy = target - this.currentBet;
        if (raiseBy >= this.minRaise) {
          this.minRaise = raiseBy;
          for (const s of this.occupied()) if (s !== seat && !s.folded && !s.allIn) s.acted = false;
        }
        this.currentBet = Math.max(this.currentBet, target);
        this.events.push({ kind: 'action', id, action: 'raise', amount: target, allIn: seat.allIn });
        break;
      }
      default:
        return false;
    }
    seat.acted = true;
    this.afterAction(index, now);
    return true;
  }

  /** 行動結束後決定下一步：換人、進下一條街、或結束這手 */
  private afterAction(index: number, now = 0): void {
    this.toAct = -1;
    if (this.contenders().length <= 1) {
      this.finishHand();
      return;
    }
    const next = this.nextOccupied(index, (s) => s.inHand && !s.folded && !s.allIn);
    const seat = this.seats[next];
    const roundDone =
      !seat ||
      this.actives().length === 0 ||
      this.actives().every((s) => s.acted && (s.bet === this.currentBet || s.allIn));
    if (roundDone) this.nextStreet(now);
    else this.beginAction(next, now);
  }

  private nextStreet(now: number): void {
    for (const s of this.occupied()) {
      s.bet = 0;
      s.acted = false;
    }
    this.currentBet = 0;
    this.minRaise = POKER.bigBlind;

    const order: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const next = order[order.indexOf(this.street) + 1] ?? 'showdown';
    this.street = next;

    if (next === 'showdown') {
      this.deadline = now + POKER.streetPauseMs;
      return;
    }
    // 燒牌再發，照賭場慣例（也讓牌堆位置與真實牌局一致）
    this.deck.pop();
    const count = next === 'flop' ? 3 : 1;
    for (let i = 0; i < count; i++) this.board.push(this.deck.pop()!);
    this.events.push({ kind: 'street', street: next, board: [...this.board] });
    this.deadline = now + POKER.streetPauseMs;
  }

  /** 發完剩下的公共牌（所有人都全下時直接開到底） */
  private runOutBoard(): void {
    while (this.board.length < 5) {
      this.deck.pop();
      this.board.push(this.deck.pop()!);
    }
  }

  /**
   * 退還沒有人跟的那段下注。
   *
   * 下注 3000 但最高只有人跟到 800 時，多出來的 2200 沒有任何人能爭，
   * 照規則要在結算前直接還給下注的人。不退的話它會變成一個「只有他有資格」
   * 的邊池，金額雖然照樣回到他手上，但底池會虛高，播報也會變成
   * 「牌最小的人贏最多」——看牌的人完全無法理解發生了什麼事。
   */
  private refundUncalled(): void {
    const live = this.occupied().filter((s) => s.committed > 0);
    if (live.length < 2) return;
    const sorted = [...live].sort((a, b) => b.committed - a.committed);
    const excess = sorted[0].committed - sorted[1].committed;
    if (excess <= 0) return;
    sorted[0].chips += excess;
    sorted[0].committed -= excess;
    sorted[0].allIn = sorted[0].chips === 0;
  }

  /** 結算這手牌：只剩一人就直接給，否則攤牌比牌力 */
  private finishHand(): void {
    this.refundUncalled();
    const all = this.occupied();
    const pots = buildPots(all.map((s) => ({ id: s.id, committed: s.committed, folded: s.folded })));
    this.pot = pots.reduce((sum, p) => sum + p.amount, 0);
    const left = this.contenders();
    // 從莊家左手邊算起的座位順序，決定零頭給誰
    const order: string[] = [];
    for (let step = 1; step <= this.seats.length; step++) {
      const s = this.seats[(this.dealer + step) % this.seats.length];
      if (s) order.push(s.id);
    }

    let payout: Map<string, number>;
    let reason = '所有人蓋牌';
    if (left.length <= 1) {
      // 無人跟到底：贏家拿走全部，不必亮牌
      const scores = new Map<string, number>();
      if (left[0]) scores.set(left[0].id, 1);
      payout = settlePots(pots, scores, order);
    } else {
      this.runOutBoard();
      const scores = new Map<string, number>();
      const entries: ShowdownEntry[] = [];
      for (const s of left) {
        const hand = evaluateHand([...s.hole, ...this.board]);
        scores.set(s.id, hand.score);
        entries.push({ id: s.id, hole: s.hole, hand });
      }
      this.lastShowdown = entries;
      this.events.push({ kind: 'showdown', entries });
      payout = settlePots(pots, scores, order);
      reason = '攤牌';
    }

    const winners: { id: string; amount: number; reason: string }[] = [];
    for (const [id, amount] of payout) {
      const seat = this.seats[this.seatOf(id)];
      if (seat) seat.chips += amount;
      winners.push({ id, amount, reason });
    }
    this.events.push({ kind: 'payout', winners });
    this.events.push({ kind: 'handEnd' });

    this.street = 'idle';
    this.toAct = -1;
    for (const s of this.occupied()) s.inHand = false;
  }

  /**
   * 時間推進：處理行動超時、街道之間的停頓與下一手的排程。
   * NPC 的決策不在這裡，外層看到 toAct 指向 NPC 時自己呼叫 act()。
   */
  tick(now: number): void {
    if (this.street === 'idle') {
      if (this.nextHandAt && now >= this.nextHandAt && this.canStart()) this.startHand(now);
      return;
    }
    if (this.toAct >= 0) {
      if (now < this.deadline) return;
      const seat = this.seats[this.toAct];
      if (!seat) {
        this.afterAction(this.toAct, now);
        return;
      }
      // 超時：能過牌就過牌，否則蓋牌
      if (seat.isNpc) return; // NPC 由外層決策，不在這裡自動蓋牌
      const action: ActionKind = this.callAmount(seat) === 0 ? 'check' : 'fold';
      this.act(seat.id, action, 0, now);
      return;
    }
    // 不等人行動：時間到就推進到下一條街或攤牌
    if (now < this.deadline) return;
    if (this.street === 'showdown') {
      this.finishHand();
      return;
    }
    // 還有人能下注就開下一輪，否則繼續發牌
    if (this.actives().length >= 2) {
      const first = this.nextOccupied(this.dealer, (s) => s.inHand && !s.folded && !s.allIn);
      this.beginAction(first, now);
    } else {
      this.nextStreet(now);
    }
  }

  /**
   * 排一手新牌。
   * 給人看牌的時間不在這裡——PokerRoom 會等桌上的人都按過「繼續」才呼叫這個方法。
   */
  scheduleNextHand(now: number): void {
    if (this.street !== 'idle' || this.nextHandAt) return;
    this.nextHandAt = now + POKER.nextHandMs;
  }

  takeEvents(): PokerEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
