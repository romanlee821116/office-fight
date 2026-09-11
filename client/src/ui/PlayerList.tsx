import { getAvatar } from '@office/shared';
import { sendDuel } from '../net/client';
import { focusPlayer } from '../scene/runtime';
import { useGame } from '../store/useGame';

export function PlayerList() {
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.me?.sessionId);
  const pendingDuelTo = useGame((s) => s.pendingDuelTo);
  const deadUntil = useGame((s) => s.deadUntil);
  const me = meId ? players[meId] : undefined;
  const canInvite = Boolean(me) && !me!.duelWith && deadUntil === null && !pendingDuelTo;
  const list = Object.values(players).sort((a, b) => {
    if (a.sessionId === meId) return -1;
    if (b.sessionId === meId) return 1;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  return (
    <div className="glass pointer-events-auto w-72 rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">在線名單</span>
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs">{list.length}</span>
      </div>
      <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
        {list.map((p) => {
          const avatar = getAvatar(p.avatarId);
          const isMe = p.sessionId === meId;
          const inviteDisabled = !canInvite || p.duelWith !== '' || p.hp <= 0;
          return (
            <li key={p.sessionId} className="flex items-center gap-1">
              <button
                type="button"
                disabled={isMe}
                onClick={() => focusPlayer(p.sessionId)}
                title={isMe ? '這是你' : '聚焦此玩家'}
                className={
                  'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition cursor-pointer ' +
                  (isMe ? 'cursor-default bg-white/60' : 'hover:bg-white/80')
                }
              >
                <span className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow" style={{ background: avatar.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.name}
                    {isMe && <span className="ml-1 text-[10px] opacity-50">（你）</span>}
                  </span>
                  <span className="block truncate text-[11px] opacity-60">
                    {p.status || '—'}
                    {p.seatId && <span className="ml-1 opacity-70">· 坐著</span>}
                    {p.fightMode && <span className="ml-1 opacity-70">· 🥊 {p.hp > 0 ? `${p.hp} HP` : '倒地'}</span>}
                    {p.duelWith && <span className="ml-1 opacity-70">· ⚔️ 決鬥中</span>}
                  </span>
                </span>
                {p.status && <span className="h-2 w-2 shrink-0 rounded-full bg-sage" />}
              </button>
              {!isMe && (
                <button
                  type="button"
                  disabled={inviteDisabled}
                  onClick={() => sendDuel({ action: 'invite', targetId: p.sessionId })}
                  title={inviteDisabled ? '目前無法邀請' : `向 ${p.name} 發出戰鬥邀請`}
                  className={
                    'flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white/70 px-2 py-1 text-[11px] font-medium text-red-700 transition cursor-pointer hover:bg-red-50 ' +
                    (inviteDisabled ? 'cursor-not-allowed opacity-30' : '')
                  }
                >
                  <span aria-hidden>⚔️</span>
                  戰鬥邀請
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
