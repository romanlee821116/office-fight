import { COINS, OFFICE_DESK_SEATS } from '@office/shared';
import { useGame } from '../store/useGame';

/** 電腦桌前的座位 id，用來判斷自己是不是正在上班 */
const DESK_SEAT_IDS = new Set(OFFICE_DESK_SEATS.map((seat) => seat.id));

const EVERY_SECONDS = Math.round(COINS.tickMs / 1000);

/**
 * 右上角的錢包：只有登入會員看得到（訪客不會累積金幣）。
 * 坐在電腦桌前時額外顯示正在賺錢的提示，點一下開商店。
 */
export function CoinPurse() {
  const meId = useGame((s) => s.me?.sessionId);
  const me = useGame((s) => (meId ? s.players[meId] : undefined));
  const setShopOpen = useGame((s) => s.setShopOpen);
  if (!me?.member) return null;

  const working = DESK_SEAT_IDS.has(me.seatId);
  return (
    <button
      type="button"
      onClick={() => setShopOpen(true)}
      title={`點開員工福利社　·　坐到電腦桌前上班，每 ${EVERY_SECONDS} 秒賺 ${COINS.perTick} 個金幣`}
      className="glass pointer-events-auto rounded-2xl px-3 py-2 text-center transition cursor-pointer hover:brightness-105"
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-base leading-none">
          💰
        </span>
        <span className="text-lg font-bold tabular-nums leading-none">{me.coins}</span>
      </div>
      <div className={'mt-1 text-[10px] ' + (working ? 'text-amber-700' : 'opacity-50')}>
        {working ? `上班中 +${COINS.perTick}／${EVERY_SECONDS}秒` : '點我逛福利社'}
      </div>
    </button>
  );
}
