import { DANCES, EMOTES, SEAT_BY_ID, getWeapon, type DanceId, type EmoteId } from '@office/shared';
import { sendPickup, sendSit, sendStand } from '../net/client';
import { toggleDance, triggerEmote } from '../scene/runtime';
import { useGame } from '../store/useGame';

/** 底部中央：坐下/起身提示與表情按鈕 */
export function InteractionBar() {
  const nearSeatId = useGame((s) => s.nearSeatId);
  const seated = useGame((s) => s.seated);
  const nearPickup = useGame((s) => (s.nearPickupId ? s.pickups[s.nearPickupId] : undefined));
  const seatLabel = nearSeatId ? SEAT_BY_ID.get(nearSeatId)?.label ?? '坐下' : '坐下';
  const pickupName = nearPickup ? getWeapon(nearPickup.weaponId)?.name : undefined;

  const onEmote = (id: EmoteId) => {
    triggerEmote(id);
  };
  const onDance = (id: DanceId) => {
    toggleDance(id);
  };

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {(seated || nearSeatId || nearPickup) && (
        <button
          type="button"
          onClick={() => (seated ? sendStand() : nearPickup ? sendPickup(nearPickup.id) : nearSeatId && sendSit(nearSeatId))}
          className="glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer hover:bg-white"
        >
          <kbd className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">E</kbd>
          {seated ? '起身' : nearPickup && !seated ? `撿起 ${pickupName ?? '武器'}` : seatLabel}
        </button>
      )}
      <div className={'glass pointer-events-auto flex flex-wrap justify-center gap-1 rounded-full p-1 ' + (seated ? 'opacity-50' : '')}>
        {DANCES.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={seated}
            onClick={() => onDance(d.id)}
            title={`${d.label}舞（${d.key}，再按一次停止）`}
            className={
              'flex items-center gap-1 rounded-full px-3 py-1 text-sm cursor-pointer hover:bg-white ' +
              (seated ? 'cursor-not-allowed' : '')
            }
          >
            <span aria-hidden>{d.icon}</span>
            <span>{d.label}</span>
            <kbd className="rounded bg-ink/10 px-1 text-[10px]">{d.key}</kbd>
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink/10" />
        {EMOTES.map((em) => (
          <button
            key={em.id}
            type="button"
            disabled={seated}
            onClick={() => onEmote(em.id)}
            title={`${em.label}（${em.key}）`}
            className={
              'flex items-center gap-1 rounded-full px-3 py-1 text-sm cursor-pointer hover:bg-white ' +
              (seated ? 'cursor-not-allowed' : '')
            }
          >
            <span aria-hidden>{em.icon}</span>
            <span>{em.label}</span>
            <kbd className="rounded bg-ink/10 px-1 text-[10px]">{em.key}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
