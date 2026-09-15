import { DANCES, EMOTES, SEAT_BY_ID, getPet, getWeapon } from '@office/shared';
import {
  eatHeldFood,
  sendAttack,
  sendCourtJoin,
  sendDrop,
  sendFeedPet,
  sendOvenPlace,
  sendOvenTake,
  sendPetDrop,
  sendPetPickup,
  sendPetThrow,
  sendPickup,
  sendSit,
  sendStand,
  sendStovePlace,
  sendStoveTake,
  sendSwing,
} from '../net/client';
import { canAttack, local, toggleDance, toggleExercise, triggerEmote, triggerSwing } from '../scene/runtime';
import { useGame } from '../store/useGame';

/** 底部的一顆互動按鈕：一個按鍵提示 + 一句說明 */
interface Action {
  /** 按鍵提示文字，同時作為 React key 的一部分 */
  hint: string;
  label: string;
  onClick: () => void;
}

/** 空白鍵攻擊（與 LocalPlayer 的鍵盤處理一致：冷卻由 runtime 把關） */
function attack(): void {
  if (canAttack(performance.now())) sendAttack();
}

function swing(): void {
  if (local.dead) return;
  sendSwing({ aimX: Math.sin(local.rotY), aimZ: Math.cos(local.rotY) });
  triggerSwing();
}

/**
 * 底部中央：主要互動（E）、手上物品的操作（空白鍵 / F / R / Q）與表情舞步按鈕。
 * 物品操作一律在這裡呈現，左上角的格鬥面板只負責狀態顯示。
 */
export function InteractionBar() {
  const meId = useGame((s) => s.me?.sessionId);
  const me = useGame((s) => (meId ? s.players[meId] : undefined));
  const dead = useGame((s) => s.deadUntil !== null);
  const seated = useGame((s) => s.seated);
  const nearSeatId = useGame((s) => s.nearSeatId);
  const nearPickup = useGame((s) => (s.nearPickupId ? s.pickups[s.nearPickupId] : undefined));
  const carriedPet = useGame((s) => (meId ? Object.values(s.pets).find((p) => p.carrierId === meId) : undefined));
  const nearPet = useGame((s) => (s.nearPetId ? s.pets[s.nearPetId] : undefined));
  const nearStove = useGame((s) => s.nearStove);
  const stove = useGame((s) => s.stove);
  const nearOven = useGame((s) => s.nearOven);
  const oven = useGame((s) => s.oven);
  const court = useGame((s) => s.court);
  const nearCourtSlot = useGame((s) => s.nearCourtSlot);

  const weapon = getWeapon(me?.weaponId ?? '');
  const holdingFood = weapon?.edible === true;
  const exercise = weapon?.exercise;
  const inMatch = Boolean(meId && (court.aId === meId || court.bId === meId));
  const canCourtJoin = nearCourtSlot !== null && !inMatch;
  const canStoveTake = nearStove && stove.stage === 'cooking' && !weapon;
  const canOvenTake = nearOven && Boolean(oven.foodId) && !weapon;
  const seatLabel = nearSeatId ? (SEAT_BY_ID.get(nearSeatId)?.label ?? '坐下') : '坐下';
  const ovenFoodName = oven.foodId ? getWeapon(oven.foodId)?.name : undefined;
  const actions: Action[] = [];

  // E：一次只會有一種主要互動，順序即優先序（與 LocalPlayer 的 E 鍵一致）
  if (seated) actions.push({ hint: 'E', label: '起身', onClick: sendStand });
  else if (carriedPet) actions.push({ hint: 'E', label: `放下 ${getPet(carriedPet.petType).name}`, onClick: sendPetDrop });
  else if (canCourtJoin) actions.push({ hint: 'E', label: `報名匹克球（${nearCourtSlot} 側）`, onClick: () => sendCourtJoin(nearCourtSlot!) });
  else if (nearPet) actions.push({ hint: 'E', label: `抱起 ${getPet(nearPet.petType).name}`, onClick: () => sendPetPickup(nearPet.id) });
  else if (canOvenTake)
    actions.push({ hint: 'E', label: `${oven.stage === 'done' ? '取出' : '拿回'} ${ovenFoodName ?? '食物'}`, onClick: sendOvenTake });
  else if (canStoveTake) actions.push({ hint: 'E', label: `拿回 ${stove.foodId ? (getWeapon(stove.foodId)?.name ?? '食物') : '食物'}`, onClick: sendStoveTake });
  else if (nearPickup) actions.push({ hint: 'E', label: `撿起 ${getWeapon(nearPickup.weaponId)?.name ?? '武器'}`, onClick: () => sendPickup(nearPickup.id) });
  else if (nearSeatId) actions.push({ hint: 'E', label: seatLabel, onClick: () => sendSit(nearSeatId) });

  // F：拿著食物時餵寵物 / 放進烤箱 / 放上爐子
  if (holdingFood && !carriedPet && !dead) {
    if (nearPet) actions.push({ hint: 'F', label: `餵${getPet(nearPet.petType).name}吃${weapon.name}`, onClick: () => sendFeedPet(nearPet.id) });
    else if (nearOven && !oven.foodId && weapon.bakesTo) actions.push({ hint: 'F', label: `把${weapon.name}放進烤箱`, onClick: sendOvenPlace });
    else if (nearStove && !stove.foodId) actions.push({ hint: 'F', label: `把${weapon.name}放上爐子`, onClick: sendStovePlace });
  }

  // 空白鍵：丟寵物 / 揮拍 / 器材運動 / 攻擊（同一顆鍵依情境只會是其中一種）
  if (carriedPet) actions.push({ hint: '空白鍵', label: `把${getPet(carriedPet.petType).name}丟出去`, onClick: sendPetThrow });
  else if (inMatch && !dead) actions.push({ hint: '空白鍵', label: '揮拍', onClick: swing });
  else if (exercise && !me?.fightMode && !dead) actions.push({ hint: '空白鍵', label: `用${weapon?.name}彎舉`, onClick: () => toggleExercise(exercise) });
  else if (me?.fightMode && !dead)
    actions.push({
      hint: '空白鍵',
      label: !weapon ? '揮拳' : weapon.kind === 'melee' ? `用${weapon.name}揮擊` : weapon.kind === 'throw' ? `丟出${weapon.name}` : `用${weapon.name}發射`,
      onClick: attack,
    });

  // R：吃掉手上的食物
  if (holdingFood && !dead) actions.push({ hint: 'R', label: `吃掉${weapon.name}`, onClick: eatHeldFood });

  // Q：放下手上的物品（球拍是比賽期間配發的，不能丟）
  if (weapon && weapon.id !== 'paddle' && !dead) actions.push({ hint: 'Q', label: '放下', onClick: sendDrop });

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {actions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <button
              key={`${a.hint}:${a.label}`}
              type="button"
              onClick={a.onClick}
              className="glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium cursor-pointer hover:bg-white"
            >
              <kbd className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">{a.hint}</kbd>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className={'glass pointer-events-auto flex flex-wrap justify-center gap-1 rounded-full p-1 ' + (seated ? 'opacity-50' : '')}>
        {DANCES.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={seated}
            onClick={() => toggleDance(d.id)}
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
            onClick={() => triggerEmote(em.id)}
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
