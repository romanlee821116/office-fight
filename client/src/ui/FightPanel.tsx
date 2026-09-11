import { useEffect, useState } from 'react';
import { FIGHT, getWeapon } from '@office/shared';
import { sendDrop, sendToggleFight } from '../net/client';
import { useGame } from '../store/useGame';

/** 格鬥模式開關、血量與倒地倒數 */
export function FightPanel() {
  const meId = useGame((s) => s.me?.sessionId);
  const me = useGame((s) => (meId ? s.players[meId] : undefined));
  const deadUntil = useGame((s) => s.deadUntil);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadUntil) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadUntil]);

  if (!me) return null;
  const on = me.fightMode;
  const dead = deadUntil !== null;
  const inDuel = me.duelWith !== '';
  const lockToggle = dead || inDuel;
  const weapon = getWeapon(me.weaponId);
  const secondsLeft = dead ? Math.max(0, Math.ceil((deadUntil - now) / 1000)) : 0;

  return (
    <div className="glass pointer-events-auto flex flex-col gap-1.5 rounded-2xl px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={lockToggle}
          onClick={() => sendToggleFight(!on)}
          title={inDuel ? '決鬥中無法關閉' : undefined}
          className={
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition cursor-pointer ' +
            (on ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white/80 hover:bg-white') +
            (lockToggle ? ' cursor-not-allowed opacity-50' : '')
          }
        >
          <span aria-hidden>{inDuel ? '⚔️' : '🥊'}</span>
          {inDuel ? '決鬥中' : `格鬥模式：${on ? '開' : '關'}`}
        </button>
        {on && !dead && (
          <span className="text-[11px] opacity-60">
            <kbd className="rounded bg-ink/10 px-1 font-bold">空白鍵</kbd> {weapon ? (weapon.kind === 'melee' ? '揮擊' : '丟出') : '攻擊'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-60">{weapon?.exercise && !on ? '器材：' : '武器：'}</span>
        <span className="font-medium">{weapon ? weapon.name : '拳頭'}</span>
        {weapon?.exercise && !on && (
          <span className="opacity-60">
            <kbd className="rounded bg-ink/10 px-1 font-bold">空白鍵</kbd> 彎舉
          </span>
        )}
        {weapon?.kind === 'shoot' && <span className="rounded bg-ink/10 px-1.5 tabular-nums">{me.ammo} 發</span>}
        {weapon && !dead && (
          <button type="button" onClick={sendDrop} className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] cursor-pointer hover:bg-white" title="丟下武器（Q）">
            丟下 <kbd className="font-bold">Q</kbd>
          </button>
        )}
      </div>
      {on && (
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/15">
            <div
              className={'h-full rounded-full transition-[width] duration-200 ' + (me.hp > 50 ? 'bg-emerald-500' : me.hp > 25 ? 'bg-amber-500' : 'bg-red-600')}
              style={{ width: `${(me.hp / FIGHT.maxHp) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right text-xs tabular-nums">
            {me.hp} / {FIGHT.maxHp}
          </span>
        </div>
      )}
      {dead && <div className="text-sm font-semibold text-red-700">你被擊倒了，{secondsLeft} 秒後復活</div>}
    </div>
  );
}
