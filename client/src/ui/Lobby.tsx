import { useEffect, useState, type FormEvent } from 'react';
import { AVATARS, NAME_MAX, NAME_MIN } from '@office/shared';
import { connect, fetchServerConfig } from '../net/client';
import { requestNotificationPermission } from '../lib/notify';
import { useGame } from '../store/useGame';
import { AvatarPreview } from './AvatarPreview';

const NAME_KEY = 'office:name';
const AVATAR_KEY = 'office:avatar';
const CODE_KEY = 'office:code';

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function Lobby() {
  const phase = useGame((s) => s.phase);
  const error = useGame((s) => s.error);
  const [index, setIndex] = useState(() => {
    const saved = readStorage(AVATAR_KEY);
    const i = AVATARS.findIndex((a) => a.id === saved);
    return i >= 0 ? i : 0;
  });
  const [name, setName] = useState(() => readStorage(NAME_KEY));
  const [joinCode, setJoinCode] = useState(() => readStorage(CODE_KEY));
  const [requireCode, setRequireCode] = useState(false);
  const connecting = phase === 'connecting';
  const avatar = AVATARS[index];
  const nameLen = [...name.trim()].length;
  const nameValid = nameLen >= NAME_MIN && nameLen <= NAME_MAX;
  const codeValid = !requireCode || joinCode.trim().length > 0;
  const canSubmit = nameValid && codeValid && !connecting;

  // 伺服端若設定了 JOIN_CODE，大廳才顯示密碼欄位
  useEffect(() => {
    let alive = true;
    void fetchServerConfig().then((cfg) => {
      if (alive) setRequireCode(cfg.requireJoinCode);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + AVATARS.length) % AVATARS.length);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % AVATARS.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      localStorage.setItem(NAME_KEY, name.trim());
      localStorage.setItem(AVATAR_KEY, avatar.id);
      localStorage.setItem(CODE_KEY, joinCode.trim());
    } catch {
      // 忽略儲存失敗
    }
    void requestNotificationPermission();
    void connect({ name: name.trim(), avatarId: avatar.id, joinCode: joinCode.trim() });
  };

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#F6EFE6,#DFE8F0_60%,#CFD9E4)] p-6">
      <form onSubmit={submit} className="glass w-full max-w-3xl rounded-3xl p-8">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Hihealth虛擬辦公室</h1>
          <p className="mt-1 text-sm opacity-70">選擇角色、輸入暱稱，一起進辦公室吧</p>
        </header>

        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col items-center">
            <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-white/50">
              <AvatarPreview avatar={avatar} />
              <button
                type="button"
                aria-label="上一個角色"
                onClick={() => setIndex((i) => (i - 1 + AVATARS.length) % AVATARS.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-lg shadow cursor-pointer hover:bg-white"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="下一個角色"
                onClick={() => setIndex((i) => (i + 1) % AVATARS.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-lg shadow cursor-pointer hover:bg-white"
              >
                ›
              </button>
            </div>
            <div className="mt-3 text-center">
              <div className="text-lg font-semibold">{avatar.name}</div>
              <div className="text-xs opacity-50">
                {index + 1} / {AVATARS.length}
              </div>
            </div>
            <div className="mt-3 flex max-w-xs flex-wrap justify-center gap-2">
              {AVATARS.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  aria-label={a.name}
                  onClick={() => setIndex(i)}
                  className={
                    'h-6 w-6 rounded-full border-2 transition cursor-pointer ' +
                    (i === index ? 'scale-110 border-ink' : 'border-white/70 hover:scale-105')
                  }
                  style={{ background: a.color }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">暱稱</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                placeholder={`${NAME_MIN}～${NAME_MAX} 個字`}
                className="w-full rounded-xl border border-ink/15 bg-white/80 px-4 py-3 text-base outline-none focus:border-ink/50"
              />
              <span className="mt-1 block text-right text-xs opacity-60">
                {nameLen}/{NAME_MAX}
              </span>
            </label>

            {requireCode && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">進場密碼</span>
                <input
                  type="password"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  maxLength={64}
                  autoComplete="current-password"
                  placeholder="請向管理者索取"
                  className="w-full rounded-xl border border-ink/15 bg-white/80 px-4 py-3 text-base outline-none focus:border-ink/50"
                />
              </label>
            )}

            {error && <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              className={
                'rounded-xl bg-ink px-5 py-3 text-base font-semibold text-white transition cursor-pointer hover:bg-ink/90 ' +
                (!canSubmit ? 'cursor-not-allowed opacity-40' : '')
              }
            >
              {connecting ? '連線中…' : '進入辦公室'}
            </button>

            <ul className="mt-2 space-y-1 text-xs opacity-60">
              <li>WASD / 方向鍵移動，Shift 加速</li>
              <li>滑鼠左鍵拖曳旋轉視角，滾輪縮放</li>
              <li>Enter 開啟聊天，Esc 關閉</li>
              <li>走近椅子按 E 坐下，1 / 2 / 3 做表情，4～7 跳舞</li>
              <li>開啟格鬥模式後按空白鍵攻擊（雙方都開啟才會命中）</li>
              <li>在線名單的「戰鬥邀請」可邀請對方一對一決鬥</li>
              <li>地上會隨機出現食物武器，走近按 E 撿起、Q 丟下</li>
              <li>拿著食物按 F 可以餵寵物，或放上廚房瓦斯爐（放太久會燒起來！）</li>
              <li>戶外露台有匹克球場：站上報名點按 E，跑到落點按空白鍵回擊，先拿 7 分獲勝</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
}
