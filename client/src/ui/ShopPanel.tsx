import { useEffect, useRef, useState } from 'react';
import {
  NAME_MAX,
  PET_TINTS,
  PET_TINT_PRICE,
  SHOP_ITEMS,
  TITLES,
  getAvatar,
  getShopItem,
  getWeapon,
  type ShopItem,
  type ShopItemKind,
} from '@office/shared';
import { sendBuy, sendEquip, sendFaceChanged, sendRenamePet, sendTintPet, sendWearTitle } from '../net/client';
import { prepareFace, removeFace, uploadFace } from '../net/auth';
import { useGame } from '../store/useGame';
import { AvatarPreview } from './AvatarPreview';

/** 稱號不是商品，但共用同一排分頁 */
type Tab = ShopItemKind | 'title';

const TABS: { kind: Tab; label: string }[] = [
  { kind: 'hat', label: '頭飾' },
  { kind: 'outfit', label: '服裝' },
  { kind: 'weapon', label: '武器' },
  { kind: 'pet', label: '寵物' },
  { kind: 'title', label: '稱號' },
];

const EMPTY_LABEL: Record<Tab, string> = {
  hat: '不戴頭飾',
  outfit: '原本的外觀',
  weapon: '不帶武器',
  pet: '不帶寵物',
  title: '不戴稱號',
};

/** 武器的數值摘要，讓人買之前看得到差別 */
function weaponStats(item: ShopItem | null): string | null {
  if (item?.kind !== 'weapon') return null;
  const w = getWeapon(item.asset);
  if (!w) return null;
  return `傷害 ${w.damage} · 射程 ${w.range}m · 彈匣 ${w.ammo} · 每 ${(w.cooldownMs / 1000).toFixed(2)} 秒一發`;
}

/** 同類商品裡，目前試穿的那件（沒試穿就是身上那件） */
function useTryOn(kind: ShopItemKind, equipped: string) {
  const [tryOn, setTryOn] = useState(equipped);
  // 身上那件被別處改掉（例如另一個分頁）時跟著更新
  useEffect(() => setTryOn(equipped), [equipped, kind]);
  return [tryOn, setTryOn] as const;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-baseline gap-2 px-1">
        <span className="text-xs font-semibold opacity-70">{title}</span>
        <span className="text-[10px] opacity-40">{count}</span>
      </div>
      <ul className="grid grid-cols-2 gap-2">{children}</ul>
    </div>
  );
}

function ItemCard({
  title,
  note,
  selected,
  owned,
  dim,
  onClick,
}: {
  title: string;
  note: string;
  selected: boolean;
  owned?: boolean;
  dim?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          'w-full rounded-xl border px-3 py-2 text-left text-sm transition cursor-pointer ' +
          (selected ? 'border-ink bg-white' : 'border-transparent bg-white/60 hover:bg-white/90')
        }
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          <span className={'shrink-0 text-[11px] ' + (owned ? 'text-emerald-700' : dim ? 'opacity-30' : 'opacity-60')}>{note}</span>
        </div>
      </button>
    </li>
  );
}

/** 幫買過的寵物取名；名字存在帳號上，換別隻再換回來還在 */
function PetNameField({ itemId }: { itemId: string }) {
  const saved = useGame((s) => s.petNames[itemId] ?? '');
  const setPetNames = useGame((s) => s.setPetNames);
  const petNames = useGame((s) => s.petNames);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved, itemId]);

  const trimmed = draft.trim();
  const canSave = trimmed.length >= 2 && trimmed !== saved;
  const save = () => {
    if (!canSave) return;
    sendRenamePet(itemId, trimmed);
    // 伺服端沒有回覆訊息，本地先更新；下次進場會從 /api/me 校正
    setPetNames({ ...petNames, [itemId]: trimmed });
  };

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NAME_MAX))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="幫牠取個名字"
          className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white/80 px-2 py-1 text-xs outline-none focus:border-ink/30"
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={'rounded-lg bg-white/80 px-2 py-1 text-xs transition cursor-pointer hover:bg-white ' + (canSave ? '' : 'cursor-not-allowed opacity-30')}
        >
          命名
        </button>
      </div>
      {saved && <div className="mt-1 text-[10px] opacity-45">目前叫「{saved}」</div>}
    </div>
  );
}

/**
 * 染色色票。點色圈只是預選（預覽會即時變色），按下確認才付錢。
 * 真正寫進 petTints 的是伺服端的回覆，扣款失敗就不會變色。
 */
function PetTintPicker({
  itemId,
  coins,
  saved,
  draft,
  onPick,
}: {
  itemId: string;
  coins: number;
  saved: string;
  draft: string | null;
  onPick: (tint: string) => void;
}) {
  // draft 為 null 代表沒預選；'' 是「恢復原色」這個有效選項，不能用空字串當「沒選」
  const shown = draft ?? saved;
  const changed = draft !== null && draft !== saved;
  const restoring = draft === '';
  const affordable = restoring || coins >= PET_TINT_PRICE;

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-baseline justify-between text-[10px] opacity-50">
        <span>染色</span>
        <span>💰 {PET_TINT_PRICE} / 次</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {/* 恢復原色：打斜線的空圈 */}
        <button
          type="button"
          onClick={() => onPick('')}
          title="恢復原本的顏色（免費）"
          className={
            'relative h-6 w-6 overflow-hidden rounded-full border-2 bg-white transition cursor-pointer hover:scale-110 ' +
            (shown === '' ? 'border-ink' : 'border-white/70')
          }
        >
          <span className="absolute left-1/2 top-1/2 h-[2px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink/50" />
        </button>
        {PET_TINTS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            title={saved === t.id ? `目前是${t.name}` : t.name}
            className={
              'h-6 w-6 rounded-full border-2 transition cursor-pointer hover:scale-110 ' +
              (shown === t.id ? 'border-ink' : 'border-white/70')
            }
            style={{ background: t.color }}
          />
        ))}
      </div>
      {changed && (
        <button
          type="button"
          onClick={() => sendTintPet(itemId, draft)}
          disabled={!affordable}
          className={
            'mt-1.5 w-full rounded-lg px-2 py-1.5 text-xs font-medium transition cursor-pointer ' +
            (restoring
              ? 'bg-white/80 hover:bg-white'
              : 'bg-amber-500 text-white hover:bg-amber-600 ' + (affordable ? '' : 'cursor-not-allowed opacity-40 hover:bg-amber-500'))
          }
        >
          {restoring ? '恢復原本的顏色' : affordable ? `染成這個顏色 · 💰 ${PET_TINT_PRICE}` : '金幣不夠'}
        </button>
      )}
    </div>
  );
}

/**
 * 臉部照片：上傳後合成到角色頭部正面那一格。
 * 照片在瀏覽器就縮到 128×128 再送出，所以永遠只有幾 KB。
 */
function FaceUploader({ faceUrl }: { faceUrl: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 選好但還沒送出的照片（已經縮好的 data URL），按確認才上傳
  const [draft, setDraft] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const image = await prepareFace(file);
    setBusy(false);
    if (!image) {
      setError('讀不到這張圖，換一張試試');
      return;
    }
    setDraft(image);
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    const url = await uploadFace(draft);
    setBusy(false);
    if (!url) {
      setError('上傳失敗，換一張試試');
      return;
    }
    setDraft(null);
    // 伺服端會自己重查網址再同步給房裡的人
    sendFaceChanged();
  };

  const clear = async () => {
    setBusy(true);
    await removeFace();
    setBusy(false);
    setDraft(null);
    sendFaceChanged();
  };

  const shown = draft ?? faceUrl;
  return (
    <div className="mt-3 border-t border-ink/10 pt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold opacity-70">我的臉</span>
        <span className="text-[10px] opacity-40">貼到角色的正面</span>
      </div>
      <div className="flex items-center gap-2">
        <div className={'h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/60 ' + (draft ? 'ring-2 ring-amber-400' : '')}>
          {shown ? (
            <img src={draft ?? `${faceUrl}/photo.png`} alt="臉" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] opacity-40">無</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={'rounded-lg bg-white/80 px-2 py-1 text-xs transition cursor-pointer hover:bg-white ' + (busy ? 'opacity-40' : '')}
          >
            {busy ? '處理中…' : faceUrl || draft ? '換一張照片' : '選擇照片'}
          </button>
          {draft ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="flex-1 rounded-lg bg-amber-500 px-2 py-1 text-xs font-medium text-white transition cursor-pointer hover:bg-amber-600"
              >
                確認使用
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg bg-white/60 px-2 py-1 text-[11px] opacity-70 transition cursor-pointer hover:bg-white hover:opacity-100"
              >
                取消
              </button>
            </div>
          ) : (
            faceUrl && (
              <button
                type="button"
                onClick={() => void clear()}
                disabled={busy}
                className="rounded-lg bg-white/60 px-2 py-1 text-[11px] opacity-70 transition cursor-pointer hover:bg-white hover:opacity-100"
              >
                改回原本的臉
              </button>
            )
          )}
        </div>
      </div>
      {error && <div className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</div>}
    </div>
  );
}

/**
 * 稱號：不能用錢買，只能靠特定情境解鎖。已解鎖的可以點選配戴，
 * 再點一次取下；沒解鎖的只顯示取得方式。一次只戴一個。
 */
function TitleList({ owned, worn }: { owned: string[]; worn: string }) {
  const unlocked = TITLES.filter((t) => owned.includes(t.id));
  const locked = TITLES.filter((t) => !owned.includes(t.id));

  return (
    <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto pr-1">
      <Section title="已獲得" count={unlocked.length}>
        <ItemCard title="不戴稱號" note="預設" selected={worn === ''} onClick={() => sendWearTitle('')} />
        {unlocked.map((t) => (
          <ItemCard
            key={t.id}
            title={t.name}
            note={worn === t.id ? '配戴中' : '可配戴'}
            owned={worn === t.id}
            selected={worn === t.id}
            onClick={() => sendWearTitle(worn === t.id ? '' : t.id)}
          />
        ))}
      </Section>

      {locked.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <span className="text-xs font-semibold opacity-70">還沒解鎖</span>
            <span className="text-[10px] opacity-40">{locked.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {locked.map((t) => (
              <li key={t.id} className="rounded-xl bg-white/40 px-3 py-2">
                <div className="text-sm font-medium opacity-40">🔒 {t.name}</div>
                <div className="text-[11px] opacity-40">{t.how}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ShopPanel() {
  const open = useGame((s) => s.shopOpen);
  const setOpen = useGame((s) => s.setShopOpen);
  const notice = useGame((s) => s.shopNotice);
  const owned = useGame((s) => s.ownedItems);
  const petNames = useGame((s) => s.petNames);
  const petTints = useGame((s) => s.petTints);
  const titles = useGame((s) => s.titles);
  const meId = useGame((s) => s.me?.sessionId);
  const me = useGame((s) => (meId ? s.players[meId] : undefined));

  const [tab, setTab] = useState<Tab>('hat');
  const [tryHat, setTryHat] = useTryOn('hat', me?.hatId ?? '');
  const [tryOutfit, setTryOutfit] = useTryOn('outfit', me?.outfitId ?? '');
  const [tryWeapon, setTryWeapon] = useTryOn('weapon', me?.gearId ?? '');
  const [tryPet, setTryPet] = useTryOn('pet', me?.petGearId ?? '');
  // 染色的預選；換選別隻寵物就重置
  const [tintDraft, setTintDraft] = useState<string | null>(null);
  useEffect(() => setTintDraft(null), [tryPet]);

  if (!open || !me) return null;

  const tryOn = tab === 'hat' ? tryHat : tab === 'outfit' ? tryOutfit : tab === 'weapon' ? tryWeapon : tryPet;
  const setTryOn = tab === 'hat' ? setTryHat : tab === 'outfit' ? setTryOutfit : tab === 'weapon' ? setTryWeapon : setTryPet;
  const items = SHOP_ITEMS.filter((item) => item.kind === tab);
  const mine = items.filter((item) => owned.includes(item.id));
  const forSale = items.filter((item) => !owned.includes(item.id));
  const selected = getShopItem(tryOn);
  const ownsSelected = selected ? owned.includes(selected.id) : false;
  const stats = weaponStats(selected);
  const dirty =
    tryHat !== (me.hatId ?? '') || tryOutfit !== (me.outfitId ?? '') || tryWeapon !== (me.gearId ?? '') || tryPet !== (me.petGearId ?? '');
  const canWear = (item: ShopItem | null) => !item || owned.includes(item.id);
  // 伺服端是三件一起驗的：另一頁試穿了沒買的東西，這一頁也換不了
  const wearable = [tryHat, tryOutfit, tryWeapon, tryPet].every((id) => canWear(getShopItem(id)));

  const close = () => {
    // 關掉時把沒買的試穿還原，避免下次打開看到不是身上的樣子
    setTryHat(me.hatId ?? '');
    setTryOutfit(me.outfitId ?? '');
    setTryWeapon(me.gearId ?? '');
    setTryPet(me.petGearId ?? '');
    setOpen(false);
  };

  return (
    /* z-60：場景裡的名牌與對話泡泡是 drei 的 <Html>，自帶 z-index（NameTag 50、
       Npc 45、Pets 40），比它們低的話會被蓋在下面 */
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4" onClick={close}>
      {/* 高度固定：各分頁商品數量不同（服裝 22 件、武器 5 件），不固定的話切換會忽高忽低 */}
      <div className="glass flex h-[min(85vh,640px)] w-full max-w-3xl flex-col rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold">員工福利社</span>
            <span className="text-sm opacity-70">💰 {me.coins}</span>
          </div>
          <button type="button" onClick={close} className="rounded-full bg-white/70 px-3 py-1 text-xs cursor-pointer hover:bg-white">
            關閉
          </button>
        </div>

        <div className="mb-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => setTab(t.kind)}
              className={
                'rounded-full px-4 py-1 text-sm transition cursor-pointer ' +
                (tab === t.kind ? 'bg-ink text-white' : 'bg-white/60 hover:bg-white/90')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* 試穿預覽 */}
          <div className="flex w-56 shrink-0 flex-col">
            <div className="h-64 overflow-hidden rounded-2xl bg-white/50">
              <AvatarPreview
                avatar={getAvatar(me.avatarId)}
                hatId={tryHat}
                outfitId={tryOutfit}
                weaponId={getShopItem(tryWeapon)?.asset ?? ''}
                petId={tryPet}
                petTint={tintDraft ?? (petTints[tryPet] ?? '')}
                faceUrl={me.faceUrl}
              />
            </div>
            <div className="mt-2 min-h-[2.5rem] text-center text-xs">
              {selected ? (
                <>
                  <div className="font-medium">{selected.name}</div>
                  {stats && <div className="mt-1 leading-relaxed opacity-45">{stats}</div>}
                </>
              ) : (
                <div className="opacity-50">{EMPTY_LABEL[tab]}</div>
              )}
            </div>
            <div className={'mt-2 flex flex-col gap-1.5 ' + (tab === 'title' ? 'hidden' : '')}>
              {selected && !ownsSelected && (
                <button
                  type="button"
                  onClick={() => sendBuy(selected.id)}
                  disabled={me.coins < selected.price}
                  className={
                    'rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition cursor-pointer hover:bg-amber-600 ' +
                    (me.coins < selected.price ? 'cursor-not-allowed opacity-40 hover:bg-amber-500' : '')
                  }
                >
                  買下 · 💰 {selected.price}
                </button>
              )}
              <button
                type="button"
                onClick={() => sendEquip(tryHat, tryOutfit, tryWeapon, tryPet)}
                disabled={!dirty || !wearable}
                title={wearable ? '' : '試穿中的頭飾或服裝還沒買下'}
                className={
                  'rounded-xl bg-sage px-3 py-2 text-sm font-medium transition cursor-pointer hover:brightness-95 ' +
                  (!dirty || !wearable ? 'cursor-not-allowed opacity-40' : '')
                }
              >
                {dirty ? '換上這身' : '目前穿著'}
              </button>
            </div>
            {selected?.kind === 'pet' && ownsSelected && (
              <>
                <PetNameField itemId={selected.id} />
                <PetTintPicker
                  itemId={selected.id}
                  coins={me.coins}
                  saved={petTints[selected.id] ?? ''}
                  draft={tintDraft}
                  onPick={setTintDraft}
                />
              </>
            )}
            {notice && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-center text-[11px] text-red-700">{notice}</div>}
            <FaceUploader faceUrl={me.faceUrl} />
          </div>

          {/* 稱號不是商品，右側換成另一份清單 */}
          {tab === 'title' && <TitleList owned={titles} worn={me.titleId} />}

          {/* 商品清單：先自己的衣櫃，再商店 */}
          <div className={'scrollbar-thin min-w-0 flex-1 overflow-y-auto pr-1 ' + (tab === 'title' ? 'hidden' : '')}>
            <Section title="我的衣櫃" count={mine.length}>
              <ItemCard
                title={EMPTY_LABEL[tab]}
                note="預設"
                selected={tryOn === ''}
                onClick={() => setTryOn('')}
              />
              {mine.map((item) => (
                <ItemCard
                  key={item.id}
                  title={petNames[item.id] ? `${petNames[item.id]}（${item.name}）` : item.name}
                  note="已擁有"
                  owned
                  selected={tryOn === item.id}
                  onClick={() => setTryOn(item.id)}
                />
              ))}
            </Section>

            {forSale.length > 0 && (
              <Section title="商店" count={forSale.length}>
                {forSale.map((item) => (
                  <ItemCard
                    key={item.id}
                    title={item.name}
                    note={`💰 ${item.price}`}
                    dim={me.coins < item.price}
                    selected={tryOn === item.id}
                    onClick={() => setTryOn(item.id)}
                  />
                ))}
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
