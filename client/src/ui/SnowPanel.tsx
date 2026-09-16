import { useEffect, useState } from 'react';
import { FIGHT, SNOWFIGHT, SNOW_TEAM_COLOR, SNOW_TEAM_LABEL, type SnowTeam } from '@office/shared';
import { sendSnowLeave } from '../net/client';
import { useGame, type PlayerInfo } from '../store/useGame';

const TEAMS: SnowTeam[] = ['red', 'blue'];

/** 一隊的名單：還在場上的與已出局的分開算 */
function rosterOf(players: Record<string, PlayerInfo>, team: SnowTeam): { alive: PlayerInfo[]; out: PlayerInfo[] } {
  const alive: PlayerInfo[] = [];
  const out: PlayerInfo[] = [];
  for (const p of Object.values(players)) {
    if (p.snowTeam !== team) continue;
    (p.snowMode ? alive : out).push(p);
  }
  return { alive, out };
}

/** 手上的雪球：滿的實心、丟掉的空心 */
function Ammo({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: SNOWFIGHT.maxBalls }, (_, i) => (
        <span
          key={i}
          className={'h-3 w-3 rounded-full border ' + (i < count ? 'border-sky-300 bg-white' : 'border-ink/25 bg-transparent')}
        />
      ))}
    </span>
  );
}

/** 一隊的計分格 */
function TeamScore({ team, players }: { team: SnowTeam; players: Record<string, PlayerInfo> }) {
  const { alive, out } = rosterOf(players, team);
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SNOW_TEAM_COLOR[team] }} />
      <span className="text-sm font-semibold">{SNOW_TEAM_LABEL[team]}</span>
      <span className="rounded bg-ink/10 px-1.5 text-sm tabular-nums">{alive.length}</span>
      {out.length > 0 && <span className="text-[11px] opacity-50">出局 {out.length}</span>}
    </div>
  );
}

/**
 * 打雪仗的 HUD：上半是比賽計分板（有分隊比賽時才出現），
 * 下半是自己的狀態（模式、雪球數、血量、退出）。人不在雪仗模式且沒有比賽時整塊不顯示。
 */
export function SnowPanel() {
  const meId = useGame((s) => s.me?.sessionId);
  const me = useGame((s) => (meId ? s.players[meId] : undefined));
  const players = useGame((s) => s.players);
  const snow = useGame((s) => s.snow);
  const [now, setNow] = useState(Date.now());

  const counting = snow.status === 'countdown';
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [counting]);

  const inSnow = me?.snowMode === true;
  const matchOn = snow.status !== 'idle';
  if (!me || (!inSnow && !matchOn)) return null;

  const team = (me.snowTeam || '') as SnowTeam | '';
  const secondsLeft = counting ? Math.max(0, Math.ceil((snow.startsAt - now) / 1000)) : 0;
  const eliminated = team !== '' && !me.snowMode;

  return (
    <div className="glass pointer-events-auto flex flex-col gap-1.5 rounded-2xl px-3 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden>⛄</span>
        <span className="text-sm font-bold">打雪仗</span>
        {matchOn ? (
          <div className="flex items-center gap-2">
            {TEAMS.map((t) => (
              <TeamScore key={t} team={t} players={players} />
            ))}
          </div>
        ) : (
          <span className="text-[11px] opacity-60">自由模式 · 走到旗子旁按 E 可以分隊 · 走出場地即結束</span>
        )}
      </div>

      {snow.status === 'waiting' && <div className="text-[11px] opacity-60">等待另一隊有人加入…</div>}
      {counting && <div className="text-sm font-semibold text-sky-700">{secondsLeft} 秒後開打</div>}
      {snow.status === 'over' && snow.winner && (
        <div className="text-sm font-bold" style={{ color: SNOW_TEAM_COLOR[snow.winner as SnowTeam] }}>
          🏆 {SNOW_TEAM_LABEL[snow.winner as SnowTeam]}獲勝！
        </div>
      )}

      {inSnow && (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-60">雪球：</span>
            <Ammo count={me.ammo} />
            <span className="tabular-nums opacity-60">
              {me.ammo} / {SNOWFIGHT.maxBalls}
            </span>
            {me.ammo === 0 && <span className="text-[11px] text-amber-700">沒球了，到雪堆凹槽按 E 補</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/15">
              <div
                className={'h-full rounded-full transition-[width] duration-200 ' + (me.hp > 120 ? 'bg-sky-500' : me.hp > 60 ? 'bg-amber-500' : 'bg-red-600')}
                style={{ width: `${(me.hp / FIGHT.maxHp) * 100}%` }}
              />
            </div>
            <span className="w-20 text-right text-[11px] tabular-nums opacity-70">
              再中 {Math.ceil(me.hp / SNOWFIGHT.damage)} 顆出局
            </span>
          </div>
          <button
            type="button"
            onClick={sendSnowLeave}
            className="self-start rounded-full bg-white/80 px-3 py-0.5 text-[11px] cursor-pointer hover:bg-white"
          >
            {team ? '退出雪仗（視同出局）' : '原地退出雪仗'}
          </button>
        </>
      )}

      {eliminated && <div className="text-sm font-semibold text-red-700">你已出局</div>}
    </div>
  );
}
