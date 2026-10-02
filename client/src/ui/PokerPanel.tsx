import { useEffect, useState } from 'react';
import { POKER, RANK_LABELS, SUIT_LABELS, isPokerSeat, isRedCard, rankOf, suitOf } from '@office/shared';
import { sendPokerAct, sendPokerContinue, sendPokerLeave, sendPokerNpcs, sendPokerSit } from '../net/client';
import { PokerSeatAvatar } from './PokerSeatAvatar';
import { useGame } from '../store/useGame';

/** 一張牌；背面用於還沒亮牌的對手 */
function Card({ card, small = false }: { card: number | null; small?: boolean }) {
  const size = small ? 'h-9 w-7 text-[13px]' : 'h-16 w-12 text-xl';
  if (card === null) {
    return <div className={`${size} rounded border border-ink/20 bg-gradient-to-br from-sky-700 to-sky-900`} />;
  }
  return (
    <div
      className={`${size} flex flex-col items-center justify-center rounded border border-ink/20 bg-white font-bold leading-none ${
        isRedCard(card) ? 'text-red-600' : 'text-ink'
      }`}
    >
      <span>{RANK_LABELS[rankOf(card)]}</span>
      <span>{SUIT_LABELS[suitOf(card)]}</span>
    </div>
  );
}

/**
 * 座位沿桌子環繞的六個位置（相對整塊牌桌區域的百分比）。
 *
 * 索引 0 是「自己」：不管實際坐第幾號位，畫面上一律把自己放在正下方，
 * 其他人依座位順序往左繞——這是撲克遊戲的通用慣例，看自己的牌最順。
 */
const SEAT_SLOTS = [
  { left: 50, top: 93 },
  { left: 11, top: 74 },
  { left: 4, top: 34 },
  { left: 50, top: 7 },
  { left: 96, top: 34 },
  { left: 89, top: 74 },
];

const STREET_LABEL: Record<string, string> = {
  idle: '等待開局',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '轉牌',
  river: '河牌',
  showdown: '攤牌',
};

/**
 * 牌桌面板：坐上牌桌後顯示。
 *
 * 公開狀態（檯面、籌碼、輪到誰）都讀 store 的 poker，底牌讀 pokerHole——
 * 底牌是伺服端單獨私訊給本人的，不在共用 state 裡。
 */
export function PokerPanel() {
  const poker = useGame((s) => s.poker);
  const hole = useGame((s) => s.pokerHole);
  const log = useGame((s) => s.pokerLog);
  const summary = useGame((s) => s.pokerSummary);
  const nearSeat = useGame((s) => s.nearPokerSeat);
  const myFaceUrl = useGame((s) => (s.me?.sessionId ? s.players[s.me.sessionId]?.faceUrl : '') || undefined);
  const meId = useGame((s) => s.me?.sessionId);
  const players = useGame((s) => s.players);
  const seated = meId ? isPokerSeat(players[meId]?.seatId ?? '') : false;

  const mySeatIndex = poker.seats.findIndex((s) => s.id === meId);
  const me = mySeatIndex >= 0 ? poker.seats[mySeatIndex] : null;
  const myTurn = poker.toAct >= 0 && poker.toAct === mySeatIndex;

  const toCall = me ? Math.max(0, poker.currentBet - me.bet) : 0;
  const maxBet = me ? me.bet + me.chips : 0;
  const minRaise = Math.min(poker.currentBet + poker.minRaise, maxBet);
  const [raiseTo, setRaiseTo] = useState(minRaise);

  // 輪到自己時把滑桿重設成最小加注，否則上一手拉到的金額會留著
  useEffect(() => {
    if (myTurn) setRaiseTo(minRaise);
  }, [myTurn, minRaise]);

  // 行動倒數
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!poker.deadline) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [poker.deadline]);

  /**
   * 一手結束後的結算：攤牌、輸贏與「籌碼輸光了」合在同一個畫面。
   *
   * 停到玩家自己關掉為止——伺服端在所有人按過「繼續」之前不會開下一手，
   * 所以不會發生牌剛亮出來就被下一手收走的狀況。
   */
  if (summary) {
    const close = () => {
      useGame.getState().setPokerSummary(null);
      sendPokerContinue();
    };
    return (
      <div className="glass pointer-events-auto w-[32rem] max-w-[94vw] rounded-2xl p-5 shadow-2xl">
        <div className="mb-3 text-center text-lg font-bold">
          {summary.busted ? '🃏 你的籌碼輸光了' : '🃏 本手結果'}
        </div>

        {/* 公共牌：沒有它就看不出「一對」是對到什麼，也看不懂誰為什麼贏 */}
        {summary.board.length > 0 && (
          <div className="mb-3 rounded-xl bg-emerald-900/15 p-3">
            <div className="mb-1.5 text-center text-[13px] font-bold opacity-70">公共牌</div>
            <div className="flex justify-center gap-1.5">
              {summary.board.map((c) => (
                <Card key={c} card={c} />
              ))}
            </div>
          </div>
        )}

        {summary.entries.length > 0 ? (
          <div className="mb-3 rounded-xl bg-amber-100/70 p-3">
            <div className="mb-1.5 text-[13px] font-bold opacity-70">各家底牌</div>
            {summary.entries.map((entry) => {
              const won = summary.winners.includes(entry.seat);
              return (
                <div
                  key={entry.seat}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] ${won ? 'bg-amber-300/70 font-bold' : ''}`}
                >
                  <span className="w-5 text-center">{won ? '👑' : ''}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
                  <span className="flex gap-1">
                    {entry.cards.map((c) => (
                      <Card key={c} card={c} small />
                    ))}
                  </span>
                  <span className="w-20 text-right font-semibold">{entry.hand}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-3 rounded-xl bg-white/40 py-3 text-center text-[13px] opacity-70">沒有人跟到底，沒有攤牌</div>
        )}

        {summary.text && <div className="mb-3 text-center text-[15px] font-bold">{summary.text}</div>}

        {summary.busted && (
          <div className="mb-3 text-center text-[13px] opacity-70">
            這趟買入的 {POKER.buyIn} 全部輸掉了。要再來一局就重新買入，金幣不夠的話先去上班賺一點。
          </div>
        )}

        <div className="flex gap-2">
          {summary.busted ? (
            <>
              <button
                type="button"
                disabled={nearSeat < 0}
                onClick={() => {
                  sendPokerSit(nearSeat);
                  close();
                }}
                className={
                  nearSeat >= 0
                    ? 'flex-1 rounded-xl bg-sage/80 py-3 text-[15px] font-semibold cursor-pointer hover:bg-sage'
                    : 'flex-1 rounded-xl bg-ink/10 py-3 text-[15px] font-semibold cursor-not-allowed opacity-40'
                }
              >
                {nearSeat >= 0 ? `重新買入 ${POKER.buyIn}` : '走回座位旁才能再買入'}
              </button>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-xl bg-white/70 py-3 text-[15px] font-semibold cursor-pointer hover:bg-white"
              >
                離開牌桌
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-xl bg-sage/80 py-3 text-[15px] font-semibold cursor-pointer hover:bg-sage"
            >
              繼續下一手
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!seated || !me) return null;

  const remainMs = poker.deadline ? Math.max(0, poker.deadline - now) : 0;
  const remainRatio = myTurn ? Math.min(1, remainMs / POKER.actionTimeoutMs) : 0;
  const canRaise = me.chips > 0 && maxBet > poker.currentBet;

  return (
    <div className="pointer-events-auto w-[44rem] max-w-[96vw]">
      {/* 牌桌本體：座位沿橢圓環繞，自己永遠在正下方 */}
      <div className="relative mx-auto aspect-[16/10] w-full">
        {/* 桌面 */}
        <div className="absolute inset-x-[6%] inset-y-[14%] rounded-[50%] bg-gradient-to-b from-emerald-700 to-emerald-900 shadow-2xl ring-[10px] ring-amber-900/80">
          <div className="absolute inset-[4%] rounded-[50%] ring-2 ring-emerald-400/25" />

          {/* 底池 */}
          <div className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/35 px-3 py-1 text-[13px] font-bold text-amber-100">
            底池 {poker.pot}
          </div>

          {/* 公共牌 */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1.5">
            {poker.board.length === 0 ? (
              <span className="text-[13px] text-emerald-200/60">等待發牌</span>
            ) : (
              poker.board.map((c) => <Card key={c} card={c} />)
            )}
          </div>

          {/* 街道 */}
          <div className="absolute bottom-[16%] left-1/2 -translate-x-1/2 text-[12px] font-semibold text-emerald-200/70">
            {STREET_LABEL[poker.street] ?? poker.street}
          </div>
        </div>

        {/* 座位：以自己為基準轉一圈，自己落在正下方那個槽 */}
        {poker.seats.map((seat, index) => {
          if (!seat.id) return null;
          const slot = SEAT_SLOTS[(index - mySeatIndex + poker.seats.length) % poker.seats.length];
          if (!slot) return null;
          const isTurn = poker.toAct === index;
          return (
            <div
              key={seat.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${slot.left}%`, top: `${slot.top}%` }}
            >
              <div
                className={`flex w-[7.5rem] flex-col items-center rounded-2xl px-2 py-1.5 transition ${
                  isTurn ? 'bg-amber-200/90 ring-2 ring-amber-400' : 'bg-white/80'
                } ${seat.folded ? 'opacity-45' : ''}`}
              >
                <div
                  className={`overflow-hidden rounded-full ring-2 ${
                    isTurn ? 'ring-amber-500' : seat.allIn ? 'ring-red-500' : 'ring-white'
                  }`}
                >
                  <PokerSeatAvatar avatarId={seat.avatarId} faceUrl={seat.id === meId ? myFaceUrl : undefined} />
                </div>
                <div className="mt-0.5 max-w-full truncate text-[12px] font-bold leading-tight">{seat.name}</div>
                <div className="text-[12px] font-semibold tabular-nums leading-tight opacity-80">{seat.chips}</div>
                {seat.folded && <div className="text-[11px] font-bold text-red-600">蓋牌</div>}
                {seat.allIn && !seat.folded && <div className="text-[11px] font-bold text-red-600">全下</div>}
                {/* 輪到他時跑倒數條 */}
                {isTurn && (
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-black/15">
                    <div
                      className={`h-full transition-[width] duration-200 ${remainRatio < 0.3 ? 'bg-red-500' : 'bg-emerald-600'}`}
                      style={{ width: `${remainRatio * 100}%` }}
                    />
                  </div>
                )}
              </div>
              {/* 本輪下注的籌碼，擺在座位朝桌心的那一側 */}
              {seat.bet > 0 && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow"
                  style={slot.top > 50 ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }}
                >
                  {seat.bet}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 自己的牌與動作 */}
      <div className="glass -mt-2 rounded-2xl p-3 shadow-2xl">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-[13px] opacity-60">你的牌</span>
          <div className="flex gap-1.5">
            {hole.length > 0 ? hole.map((c) => <Card key={c} card={c} />) : <span className="text-[13px] opacity-40">等待發牌</span>}
          </div>
          <span className="ml-auto text-[13px] opacity-70">
            籌碼 <span className="text-base font-semibold tabular-nums">{me.chips}</span>
          </span>
          <button
            type="button"
            onClick={() => sendPokerNpcs(!poker.npcs)}
            title={poker.npcs ? '請桌上的同事離席（這手打完才會走）' : '叫同事來湊人數'}
            className={`rounded-full px-3 py-1 text-[12px] cursor-pointer ${
              poker.npcs ? 'bg-white/80 hover:bg-white' : 'bg-ink/15 opacity-70 hover:opacity-100'
            }`}
          >
            {poker.npcs ? '請同事離席' : '叫同事來'}
          </button>
          <button
            type="button"
            onClick={sendPokerLeave}
            className="rounded-full bg-white/80 px-3 py-1 text-[12px] cursor-pointer hover:bg-white"
          >
            離座
          </button>
        </div>

        {myTurn ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => sendPokerAct('fold')}
                className="flex-1 rounded-xl bg-white/70 py-3 text-[15px] font-semibold cursor-pointer hover:bg-white"
              >
                蓋牌
              </button>
              {toCall === 0 ? (
                <button
                  type="button"
                  onClick={() => sendPokerAct('check')}
                  className="flex-1 rounded-xl bg-white/70 py-3 text-[15px] font-semibold cursor-pointer hover:bg-white"
                >
                  過牌
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendPokerAct('call')}
                  className="flex-1 rounded-xl bg-sage/70 py-3 text-[15px] font-semibold cursor-pointer hover:bg-sage"
                >
                  跟注 {Math.min(toCall, me.chips)}
                  {toCall >= me.chips && '（全下）'}
                </button>
              )}
              <button
                type="button"
                disabled={!canRaise}
                onClick={() => sendPokerAct('raise', raiseTo)}
                className={`flex-1 rounded-xl py-3 text-[15px] font-semibold ${
                  canRaise ? 'bg-amber-300/80 cursor-pointer hover:bg-amber-300' : 'bg-ink/10 cursor-not-allowed opacity-40'
                }`}
              >
                加注到 {raiseTo}
              </button>
            </div>
            {canRaise && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={minRaise}
                  max={maxBet}
                  step={POKER.smallBlind}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setRaiseTo(maxBet)}
                  className="rounded-full bg-white/70 px-3 py-1 text-[12px] cursor-pointer hover:bg-white"
                >
                  全下
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white/40 py-3 text-center text-[13px] opacity-70">
            {poker.toAct >= 0
              ? `等待 ${poker.seats[poker.toAct]?.name ?? '對手'} 行動…`
              : poker.seats.filter((s) => s.id).length < 2
                ? '桌上只剩你一個人，等別人入座或叫同事來'
                : poker.result || '等待下一手'}
          </div>
        )}

        {log.length > 0 && (
          <div className="mt-2 max-h-14 overflow-y-auto text-[11px] leading-relaxed opacity-55">
            {log.map((line, i) => (
              <div key={`${line}-${i}`}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
