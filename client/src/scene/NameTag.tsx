import { Html } from '@react-three/drei';
import { FIGHT, NPC_SLAYER_TITLE } from '@office/shared';
import { useGame } from '../store/useGame';
import { SpeechBubble } from './SpeechBubble';

interface NameTagProps {
  sessionId: string;
  isMe?: boolean;
}

export function NameTag({ sessionId, isMe = false }: NameTagProps) {
  const player = useGame((s) => s.players[sessionId]);
  const bubble = useGame((s) => s.bubbles[sessionId]);
  if (!player) return null;

  const status = player.status;

  return (
    <Html position={[0, 2.1, 0]} center distanceFactor={14} zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-1 select-none" style={{ transform: 'translateY(-100%)' }}>
        {bubble && <SpeechBubble text={bubble.text} />}
        <div
          className={
            'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium shadow whitespace-nowrap ' +
            (isMe ? 'bg-ink text-white' : 'bg-white/90 text-ink')
          }
        >
          {player.fightMode && <span aria-label="格鬥模式">🥊</span>}
          {player.npcSlayer && <span className={isMe ? 'text-amber-300' : 'text-amber-600'}>👑 {NPC_SLAYER_TITLE} -</span>}
          <span>{player.name}</span>
          {status && (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sage" />
              <span className="font-normal opacity-80">{status}</span>
            </>
          )}
        </div>
        {(player.fightMode || player.hp < FIGHT.maxHp) && (
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/30">
            <div
              className={'h-full rounded-full transition-[width] duration-200 ' + (player.hp > 50 ? 'bg-emerald-400' : player.hp > 25 ? 'bg-amber-400' : 'bg-red-500')}
              style={{ width: `${(player.hp / FIGHT.maxHp) * 100}%` }}
            />
          </div>
        )}
      </div>
    </Html>
  );
}
