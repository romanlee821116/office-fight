import { ArraySchema } from '@colyseus/schema';
import { POKER, POKER_SEATS, handName, isPokerSeat, type PokerEventPayload } from '@office/shared';
import { logger } from '../logger';
import { POKER_NPCS, decide, type Personality } from './pokerAi';
import { PokerTable } from './pokerTable';
import { PokerSeat, type OfficeState, type Player } from './schema';

/**
 * 牌桌與房間之間的黏合層。
 *
 * 牌局規則本身全在 PokerTable；這裡負責的是跟遊戲世界有關的那些事——
 * 誰能入座、買入要從帳號扣多少錢、NPC 什麼時候補位、把公開狀態寫進 schema、
 * 以及把引擎吐出來的事件翻成看得懂的中文播報。
 *
 * 分成兩個檔案是因為這兩類邏輯的正確性標準不同：牌局規則錯了要算錯錢，
 * 必須能在測試裡快轉跑幾千手驗證（見 scripts/poker-check.mts）；
 * 這裡的邏輯錯了頂多是提示訊息怪怪的。
 */

export interface PokerHost {
  player(sessionId: string): Player | undefined;
  /** 這個人是不是登入會員（訪客沒有金幣，不能上桌） */
  isMember(sessionId: string): boolean;
  /** 從帳號金幣扣款；餘額不足回傳 false */
  charge(sessionId: string, amount: number): Promise<boolean>;
  /** 把桌上籌碼的增減寫回帳號（delta 可為負） */
  settle(sessionId: string, delta: number): Promise<void>;
  send(sessionId: string, payload: PokerEventPayload): void;
  broadcastEvent(payload: PokerEventPayload): void;
  system(text: string): void;
  /** 入座前先把手上的東西放下、關掉格鬥模式 */
  prepareForSeat(sessionId: string): void;
}

/** NPC 的座位 id 一律長這樣，不會跟 sessionId 撞到 */
const NPC_PREFIX = 'npc:';

export class PokerRoom {
  private readonly table = new PokerTable();
  /** NPC 座位 id → 個性 */
  private readonly personas = new Map<string, Personality>();
  /** 每個真人這次上桌的買入額，離座時用來算這趟輸贏（只用於播報） */
  private readonly buyIns = new Map<string, number>();
  /** 桌上沒有真人之後的時間戳，用來把 NPC 收掉 */
  private emptySince = 0;
  /** 要不要讓 NPC 陪打。關掉時桌上的 NPC 會在這一手結束後離席 */
  private npcsEnabled = true;
  /**
   * 這一手結束後，還沒按「繼續」的真人。
   *
   * 結算畫面要停到人自己關掉為止——牌一亮就被下一手收走的話，根本看不到誰是什麼牌。
   * 所以下一手要等這個集合清空；但也不能讓一個掛機的人卡住整桌，
   * 超過 continueDeadline 就當作所有人都按過了。
   */
  private pendingContinue = new Set<string>();
  private continueDeadline = 0;

  /**
   * `now` 可以換掉，是為了讓整合測試用假時鐘快轉——牌局之間本來就有好幾秒的
   * 停頓（發牌、NPC 思考、下一手），照真實時間跑一手要等上半分鐘。
   */
  constructor(
    private readonly state: OfficeState,
    private readonly host: PokerHost,
    private readonly now: () => number = Date.now,
  ) {
    for (let i = 0; i < POKER.seatCount; i++) this.state.pokerSeats.push(new PokerSeat());
  }

  private isNpcId(id: string): boolean {
    return id.startsWith(NPC_PREFIX);
  }

  /** 桌上的真人（不含 NPC） */
  private humans(): string[] {
    return this.table.occupied().map((s) => s.id).filter((id) => !this.isNpcId(id));
  }

  private seatName(index: number): string {
    return this.table.seats[index]?.name ?? '?';
  }

  // ---- 入座與離座 ----

  /**
   * 入座。買入直接從帳號金幣扣，所以只有會員能坐；
   * 金幣不到 minCoins 也擋下來，免得一坐下就被盲注吃光。
   */
  async sit(sessionId: string, seatIndex: number): Promise<void> {
    const player = this.host.player(sessionId);
    if (!player) return;
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= POKER.seatCount) return;
    if (this.table.seatOf(sessionId) >= 0) return;
    if (player.hp <= 0 || player.seatId || player.duelWith) {
      this.host.send(sessionId, { kind: 'error', text: '現在不能入座' });
      return;
    }
    if (!this.host.isMember(sessionId)) {
      this.host.send(sessionId, { kind: 'error', text: '登入後才能上牌桌（籌碼用的是帳號金幣）' });
      return;
    }
    if (player.coins < POKER.minCoins) {
      this.host.send(sessionId, { kind: 'error', text: `金幣不足 ${POKER.minCoins}，先去上班賺一點` });
      return;
    }
    const seat = POKER_SEATS[seatIndex];
    if (Math.hypot(player.x - seat.x, player.z - seat.z) > 2.2) {
      this.host.send(sessionId, { kind: 'error', text: '離座位太遠了' });
      return;
    }
    // 位子被佔走就換一個空位，免得按鈕點下去什麼都沒發生
    let index = seatIndex;
    if (this.table.seats[index]) {
      index = this.table.freeSeat();
      // 全滿的話請一位 NPC 讓座：這張桌子是給人坐的，NPC 只是來湊人數的
      if (index < 0) {
        const npc = this.table.occupied().find((s) => this.isNpcId(s.id));
        if (npc) {
          this.table.leave(npc.id);
          this.personas.delete(npc.id);
          this.host.system(`🃏 ${npc.name} 讓位給 ${player.name}`);
          index = this.table.freeSeat();
        }
      }
      if (index < 0) {
        this.host.send(sessionId, { kind: 'error', text: '牌桌坐滿了' });
        return;
      }
    }

    // 買入不超過身上的金幣：錢少的人就以剩下的全部上桌
    const buyIn = Math.min(POKER.buyIn, player.coins);
    const ok = await this.host.charge(sessionId, buyIn);
    if (!ok) {
      this.host.send(sessionId, { kind: 'error', text: '扣款失敗，請再試一次' });
      return;
    }

    this.host.prepareForSeat(sessionId);
    this.table.sit(index, { id: sessionId, name: player.name, isNpc: false, chips: buyIn });
    this.buyIns.set(sessionId, buyIn);

    const target = POKER_SEATS[index];
    player.seatId = target.id;
    player.x = target.x;
    player.z = target.z;
    player.rotY = target.rotY;
    player.anim = 'sit';

    this.host.system(`🃏 ${player.name} 坐上牌桌，買入 ${buyIn}`);
    this.fillNpcs();
    this.sync();
  }

  /**
   * 離座：桌上剩下的籌碼全數寫回帳號。
   *
   * 帳務只有買入與離座兩個時點——入座時從金幣扣走買入，離座時把桌上剩下的加回去。
   * 中途不碰帳號，因為「帳號餘額 + 桌上籌碼」才是這個人的總資產，
   * 每手都往帳號加一次輸贏會把桌上那份重複算進去。
   * 代價是伺服器中途被重開會損失桌上籌碼，所以 onDispose 要記得兜底結算。
   */
  async leave(sessionId: string): Promise<void> {
    const index = this.table.seatOf(sessionId);
    if (index < 0) return;
    const seat = this.table.seats[index]!;
    const name = seat.name;
    const buyIn = this.buyIns.get(sessionId) ?? 0;
    this.buyIns.delete(sessionId);
    this.pendingContinue.delete(sessionId);
    const refund = this.table.leave(sessionId);
    if (refund > 0) await this.host.settle(sessionId, refund);
    const delta = refund - buyIn;

    const player = this.host.player(sessionId);
    if (player && isPokerSeat(player.seatId)) {
      player.seatId = '';
      player.anim = 'idle';
      // 往門口方向站起來，不會卡在桌子裡
      const seat = POKER_SEATS[index];
      player.x = seat.x + Math.sin(seat.rotY + Math.PI) * 0.7;
      player.z = seat.z + Math.cos(seat.rotY + Math.PI) * 0.7;
    }
    const verb = delta >= 0 ? `帶走 ${refund}（淨賺 ${delta}）` : `帶走 ${refund}（輸了 ${-delta}）`;
    this.host.system(`🃏 ${name} 離開牌桌，${verb}`);
    this.drainEvents();
    this.sync();
  }

  /** 玩家倒地、斷線或被拉走時的強制離座 */
  forceLeave(sessionId: string): void {
    if (this.table.seatOf(sessionId) < 0) return;
    void this.leave(sessionId);
  }

  /**
   * 開關 NPC 陪打。
   *
   * 關掉時不立刻把人趕走——牌局進行中抽掉幾家等於替他們蓋牌，底池會莫名其妙地跑掉。
   * 標記起來，等這一手打完由 afterHand() 收尾。
   */
  setNpcs(sessionId: string, enabled: boolean): void {
    if (!this.has(sessionId) || this.npcsEnabled === enabled) return;
    this.npcsEnabled = enabled;
    this.state.pokerNpcs = enabled;
    if (enabled) {
      this.fillNpcs();
      this.host.system('🃏 同事們被叫來牌桌陪打了');
    } else if (this.table.street === 'idle') {
      this.clearNpcs();
      this.host.system('🃏 同事們離開了牌桌');
    } else {
      this.host.system('🃏 這手打完後同事們就會離席');
    }
    this.sync();
  }

  /** 玩家關掉結算畫面：所有人都看完了才開下一手 */
  continueHand(sessionId: string): void {
    if (!this.pendingContinue.delete(sessionId)) return;
    this.sync();
  }

  act(sessionId: string, action: 'fold' | 'check' | 'call' | 'raise', amount: number): void {
    const index = this.table.seatOf(sessionId);
    if (index < 0 || index !== this.table.toAct) return;
    const ok = this.table.act(sessionId, action, Math.floor(amount) || 0, this.now());
    if (!ok) {
      this.host.send(sessionId, { kind: 'error', text: '這個動作現在不合法' });
      return;
    }
    this.drainEvents();
    this.sync();
  }

  // ---- NPC ----

  /**
   * 補 NPC 到 npcFillTo 人。
   * 只有桌上有真人時才補；真人離開後由 tick 把 NPC 收掉，免得空桌一直在跑牌。
   */
  private fillNpcs(): void {
    if (!this.npcsEnabled || this.humans().length === 0) return;
    const used = new Set(this.table.occupied().map((s) => s.name));
    let guard = 0;
    while (this.table.occupied().length < POKER.npcFillTo && guard++ < POKER.seatCount) {
      const index = this.table.freeSeat();
      if (index < 0) break;
      const persona = POKER_NPCS.find((p) => !used.has(p.name));
      if (!persona) break;
      used.add(persona.name);
      const id = `${NPC_PREFIX}${index}`;
      this.table.sit(index, { id, name: persona.name, isNpc: true, chips: POKER.buyIn });
      this.personas.set(id, persona);
      const seat = this.state.pokerSeats[index];
      if (seat) seat.avatarId = persona.avatarId;
    }
  }

  /** 桌上沒有真人了，把 NPC 收掉 */
  private clearNpcs(): void {
    for (const s of this.table.occupied()) {
      if (!this.isNpcId(s.id)) continue;
      this.table.leave(s.id);
      this.personas.delete(s.id);
    }
  }

  // ---- 每刻推進 ----

  tick(): void {
    const now = this.now();
    const humans = this.humans();

    if (humans.length === 0) {
      if (this.table.street !== 'idle') {
        // 真人都走了：讓這手打完就收攤，不要留著空桌空轉
        this.table.tick(now);
        this.drainEvents();
        this.sync();
        return;
      }
      // 沒有真人了就把開關復原，下一個人進來才不會對著一張空桌
      this.npcsEnabled = true;
      this.state.pokerNpcs = true;
      if (!this.emptySince) this.emptySince = now;
      else if (now - this.emptySince > POKER.idleTableMs && this.table.occupied().length > 0) {
        this.clearNpcs();
        this.sync();
      }
      return;
    }
    this.emptySince = 0;

    // 輪到 NPC 且思考時間到了，就替它做決定
    if (this.table.street !== 'idle' && this.table.toAct >= 0 && now >= this.table.deadline) {
      const seat = this.table.seats[this.table.toAct];
      if (seat?.isNpc) {
        const persona = this.personas.get(seat.id);
        if (persona) {
          const d = decide(this.table, seat, persona);
          this.table.act(seat.id, d.action, d.amount, now);
          if (d.say) this.host.broadcastEvent({ kind: 'say', seat: this.table.seatOf(seat.id), text: d.say });
          this.drainEvents();
          this.sync();
          return;
        }
      }
    }

    this.table.tick(now);
    // 一定要先把事件收掉再決定下一手：handEnd 就在這批事件裡，等待名單是它建立的。
    // 顛倒過來的話，這一手剛結束、名單還沒建立，下一手就已經排下去了。
    this.drainEvents();
    // 還有人盯著結算畫面就先不排下一手；掛機的人由 continueDeadline 兜底
    if (this.pendingContinue.size > 0 && now >= this.continueDeadline) this.pendingContinue.clear();
    if (this.table.street === 'idle' && this.pendingContinue.size === 0 && this.table.canStart()) {
      this.table.scheduleNextHand(now);
    }
    this.sync();
  }

  // ---- 事件轉播與狀態同步 ----

  /** 把引擎事件翻成播報，並處理每手結束的帳務 */
  private drainEvents(): void {
    for (const ev of this.table.takeEvents()) {
      switch (ev.kind) {
        case 'handStart': {
          this.state.pokerResult = '';
          for (const seat of this.state.pokerSeats) seat.shown.clear();
          break;
        }
        case 'hole': {
          // 底牌只送給本人；NPC 的牌誰也不送
          if (!this.isNpcId(ev.id)) this.host.send(ev.id, { kind: 'hole', cards: ev.cards });
          break;
        }
        case 'action': {
          const index = this.table.seatOf(ev.id);
          const name = this.seatName(index);
          const text =
            ev.action === 'fold'
              ? `${name} 蓋牌`
              : ev.action === 'check'
                ? `${name} 過牌`
                : ev.action === 'call'
                  ? `${name} 跟注 ${ev.amount}${ev.allIn ? '（全下）' : ''}`
                  : `${name} 加注到 ${ev.amount}${ev.allIn ? '（全下）' : ''}`;
          this.host.broadcastEvent({ kind: 'action', seat: index, text });
          break;
        }
        case 'street': {
          this.state.pokerBoard = new ArraySchema<number>(...ev.board);
          break;
        }
        case 'showdown': {
          const entries = ev.entries.map((e) => {
            const index = this.table.seatOf(e.id);
            const seat = this.state.pokerSeats[index];
            if (seat) seat.shown = new ArraySchema<number>(...e.hole);
            return { seat: index, name: this.seatName(index), cards: e.hole, hand: handName(e.hand) };
          });
          this.host.broadcastEvent({ kind: 'showdown', entries });
          break;
        }
        case 'payout': {
          const winners = ev.winners.map((w) => ({ seat: this.table.seatOf(w.id), name: this.seatName(this.table.seatOf(w.id)), amount: w.amount }));
          const text = winners.map((w) => `${w.name} 贏得 ${w.amount}`).join('、');
          this.state.pokerResult = text;
          this.host.broadcastEvent({ kind: 'payout', text, winners });
          break;
        }
        case 'handEnd': {
          // 先記下這手結束時還在桌上的人，afterHand 可能會把輸光的人請下桌
          this.pendingContinue = new Set(this.humans());
          this.continueDeadline = this.now() + POKER.continueTimeoutMs;
          this.afterHand();
          break;
        }
      }
    }
  }

  /** 一手結束後的收尾：把輸光的人請下桌，再把 NPC 補回來 */
  private afterHand(): void {
    for (const seat of this.table.occupied()) {
      if (seat.chips > 0) continue;
      if (this.isNpcId(seat.id)) {
        // NPC 輸光就自己掏錢再買入一次，牌桌不會越打人越少
        if (this.npcsEnabled) seat.chips = POKER.buyIn;
        continue;
      }
      // 送 busted 而不是 error：前端要據此跳出「再買入 / 離開」的選擇，不只是一行訊息
      this.host.send(seat.id, { kind: 'busted', text: '你的籌碼輸光了' });
      void this.leave(seat.id);
    }
    if (!this.npcsEnabled) this.clearNpcs();
    else if (this.humans().length > 0) this.fillNpcs();
  }

  /** 把引擎的公開狀態抄進 schema */
  private sync(): void {
    const st = this.state;
    st.pokerStreet = this.table.street;
    st.pokerPot = this.table.occupied().reduce((sum, s) => sum + s.committed, 0);
    st.pokerToAct = this.table.toAct;
    st.pokerDeadline = this.table.toAct >= 0 ? this.table.deadline : 0;
    st.pokerCurrentBet = this.table.currentBet;
    st.pokerMinRaise = this.table.minRaise;
    // 公共牌直接跟著引擎走。原本只在 street 回到 idle 時清空，但新的一手是
    // 「board 清空」與「street 變成 preflop」同時發生的，那個時機永遠落在條件外，
    // 結果新一手的翻牌前還掛著上一手的五張牌。
    if (st.pokerBoard.length !== this.table.board.length) {
      st.pokerBoard = new ArraySchema<number>(...this.table.board);
    }

    for (let i = 0; i < POKER.seatCount; i++) {
      const target = st.pokerSeats[i];
      const seat = this.table.seats[i];
      if (!target) continue;
      if (!seat) {
        target.id = '';
        target.name = '';
        target.isNpc = false;
        target.avatarId = '';
        target.chips = 0;
        target.bet = 0;
        target.folded = false;
        target.allIn = false;
        target.inHand = false;
        if (target.shown.length) target.shown.clear();
        continue;
      }
      target.id = seat.id;
      target.name = seat.name;
      target.isNpc = seat.isNpc;
      target.chips = seat.chips;
      target.bet = seat.bet;
      target.folded = seat.folded;
      target.allIn = seat.allIn;
      target.inHand = seat.inHand;
    }
  }

  /**
   * 房間要被釋放了：把每個真人桌上的籌碼還回帳號。
   * 不做這件事，伺服器一重開桌上的錢就真的消失了。
   */
  async disposeAll(): Promise<void> {
    for (const seat of this.table.occupied()) {
      if (this.isNpcId(seat.id) || seat.chips <= 0) continue;
      try {
        await this.host.settle(seat.id, seat.chips);
      } catch (err) {
        logger.error('房間釋放時歸還牌桌籌碼失敗', err);
      }
    }
  }

  /** 牌桌上有沒有這個人（OfficeRoom 用來擋移動、攻擊等動作） */
  has(sessionId: string): boolean {
    return this.table.seatOf(sessionId) >= 0;
  }
}
