import { COURT } from '@office/shared';
import { sendCourtLeave } from '../net/client';
import { useGame } from '../store/useGame';

const STATUS_TEXT: Record<string, string> = {
  waiting: '等待對手加入…',
  countdown: '準備發球',
  rally: '比賽中',
  between: '',
  over: '',
};

/** 匹克球計分板：有比賽狀態時顯示在頂部中央 */
export function CourtBanner() {
  const court = useGame((s) => s.court);
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.me?.sessionId);
  if (court.status === 'idle') return null;

  const nameA = court.aId ? (players[court.aId]?.name ?? '?') : '—';
  const nameB = court.bId ? (players[court.bId]?.name ?? '?') : '—';
  const inMatch = meId === court.aId || meId === court.bId;

  if (court.status === 'over') {
    const winner = court.scoreA >= COURT.winScore ? nameA : nameB;
    return (
      <div className="glass pointer-events-none rounded-2xl px-5 py-2 text-center shadow-lg">
        <div className="text-lg font-bold">🏓 {winner} 獲勝</div>
        <div className="text-[12px] opacity-60 tabular-nums">
          {nameA} {court.scoreA} : {court.scoreB} {nameB}
        </div>
      </div>
    );
  }

  return (
    <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2 shadow-lg">
      <span aria-hidden>🏓</span>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>{nameA}</span>
        <span className="rounded bg-ink/10 px-1.5 tabular-nums">{court.scoreA}</span>
        <span className="text-[11px] opacity-50">vs</span>
        <span className="rounded bg-ink/10 px-1.5 tabular-nums">{court.scoreB}</span>
        <span>{nameB}</span>
      </div>
      {STATUS_TEXT[court.status] && <span className="text-[11px] opacity-60">{STATUS_TEXT[court.status]}</span>}
      {inMatch && (
        <button
          type="button"
          onClick={sendCourtLeave}
          className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] cursor-pointer hover:bg-white"
        >
          退出比賽
        </button>
      )}
    </div>
  );
}
