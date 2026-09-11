import { useEffect, useState } from 'react';
import { sendDuel } from '../net/client';
import { stopFlashTitle } from '../lib/notify';
import { useGame } from '../store/useGame';

function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/** 收到的決鬥邀請：接受 / 拒絕 */
function InvitePrompt() {
  const invite = useGame((s) => s.duelInvite);
  const setInvite = useGame((s) => s.setDuelInvite);
  const now = useNow(invite !== null, 250);

  useEffect(() => {
    if (invite && now >= invite.expiresAt) setInvite(null);
  }, [invite, now, setInvite]);

  if (!invite) return null;
  const secondsLeft = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000));
  const respond = (accept: boolean) => {
    sendDuel({ action: accept ? 'accept' : 'decline', fromId: invite.fromId });
    setInvite(null);
    stopFlashTitle();
  };

  return (
    <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg">
      <span className="text-xl" aria-hidden>
        ⚔️
      </span>
      <div className="text-sm">
        <div className="font-semibold">{invite.fromName} 向你發出戰鬥邀請</div>
        <div className="text-[11px] opacity-60">{secondsLeft} 秒後自動拒絕</div>
      </div>
      <button type="button" onClick={() => respond(true)} className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white cursor-pointer hover:bg-red-700">
        接受
      </button>
      <button type="button" onClick={() => respond(false)} className="rounded-full bg-white/80 px-3 py-1.5 text-sm cursor-pointer hover:bg-white">
        拒絕
      </button>
    </div>
  );
}

/** 場上決鬥的倒數 / 進行中 / 結果橫幅 */
function DuelBanner() {
  const duel = useGame((s) => s.duel);
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.me?.sessionId);
  const now = useNow(duel !== null, 100);
  if (!duel) return null;

  if (duel.winnerId) {
    const iWon = duel.winnerId === meId;
    return (
      <div className="glass pointer-events-none rounded-2xl px-5 py-2 text-center shadow-lg">
        <div className="text-lg font-bold">🏆 {duel.winnerName} 獲勝</div>
        <div className="text-[12px] opacity-60">{iWon ? '你贏了這場決鬥！' : `擊敗了 ${duel.loserName}`}</div>
      </div>
    );
  }

  const a = players[duel.aId];
  const b = players[duel.bId];
  const countdown = Math.ceil((duel.startsAt - now) / 1000);
  const involved = duel.aId === meId || duel.bId === meId;

  return (
    <div className={'glass pointer-events-none rounded-2xl px-5 py-2 text-center shadow-lg ' + (involved ? 'ring-2 ring-red-500/60' : '')}>
      {countdown > 0 ? (
        <>
          <div className="text-[12px] opacity-60">
            ⚔️ {a?.name ?? '?'} vs {b?.name ?? '?'}
          </div>
          <div className="text-3xl font-black tabular-nums text-red-600">{countdown}</div>
        </>
      ) : (
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span>{a?.name ?? '?'}</span>
          <span className="rounded bg-ink/10 px-1.5 tabular-nums">{a?.hp ?? 0}</span>
          <span className="text-red-600">⚔️</span>
          <span className="rounded bg-ink/10 px-1.5 tabular-nums">{b?.hp ?? 0}</span>
          <span>{b?.name ?? '?'}</span>
        </div>
      )}
    </div>
  );
}

function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return <div className="glass pointer-events-none rounded-full px-4 py-1.5 text-sm shadow">{toast}</div>;
}

/** 頂部中央的決鬥相關疊層 */
export function DuelOverlay() {
  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      <DuelBanner />
      <InvitePrompt />
      <Toast />
    </div>
  );
}
