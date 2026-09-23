import { useEffect, useState, type FormEvent } from 'react';
import { AVATARS, NAME_MAX, NAME_MIN, type AuthMe } from '@office/shared';
import { connect, fetchServerConfig } from '../net/client';
import { fetchMe, logout, saveMe, startGoogleLogin, takeLoginError } from '../net/auth';
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
  const [googleLogin, setGoogleLogin] = useState(false);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loginError, setLoginError] = useState<string | null>(() => takeLoginError());
  const connecting = phase === 'connecting';
  const avatar = AVATARS[index];
  const nameLen = [...name.trim()].length;
  const nameValid = nameLen >= NAME_MIN && nameLen <= NAME_MAX;
  const codeValid = !requireCode || joinCode.trim().length > 0;
  const canSubmit = nameValid && codeValid && !connecting;

  // 伺服端若設定了 JOIN_CODE，大廳才顯示密碼欄位；會員功能啟用時再查一次登入狀態
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cfg = await fetchServerConfig();
      if (!alive) return;
      setRequireCode(cfg.requireJoinCode);
      setGoogleLogin(cfg.googleLogin);
      if (!cfg.googleLogin) return;
      const profile = await fetchMe();
      if (!alive || !profile) return;
      // 已登入就以帳號記住的角色為準，蓋掉 localStorage 的暫存值
      setMe(profile);
      setName(profile.name);
      const i = AVATARS.findIndex((a) => a.id === profile.avatarId);
      if (i >= 0) setIndex(i);
    })();
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
    // 已登入就順手把這次的暱稱與角色存回帳號，下次換裝置也認得
    if (me) void saveMe(name.trim(), avatar.id);
    void requestNotificationPermission();
    void connect({ name: name.trim(), avatarId: avatar.id, joinCode: joinCode.trim() });
  };

  const signOut = async () => {
    await logout();
    setMe(null);
  };

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#F6EFE6,#DFE8F0_60%,#CFD9E4)] p-6">
      <form onSubmit={submit} className="glass w-full max-w-3xl rounded-3xl p-8">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Hihealth虛擬辦公室</h1>
          <p className="mt-1 text-sm opacity-70">選擇角色、輸入暱稱，一起進辦公室吧</p>
        </header>

        {loginError && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>{loginError}</span>
            <button type="button" onClick={() => setLoginError(null)} className="opacity-60 transition cursor-pointer hover:opacity-100">
              關閉
            </button>
          </div>
        )}

        <div className="">
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

          <div className="flex flex-col justify-center gap-4 mt-10">
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

            {googleLogin && (
              <div className="mb-5 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-white/50 px-4 py-3 text-sm">
                {me ? (
                  <>
                    <span className="opacity-70">已登入 {me.email}，角色會自動記住</span>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="rounded-lg border border-ink/15 px-3 py-1.5 transition cursor-pointer hover:bg-white"
                    >
                      登出
                    </button>
                  </>
                ) : (
                  <>
                    <span className="opacity-70">登入後就不用每次重選角色</span>
                    <button
                      type="button"
                      onClick={startGoogleLogin}
                      className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 font-medium transition cursor-pointer hover:bg-white/80"
                    >
                      用 Google 登入
                    </button>
                    <span className="text-xs opacity-50">不登入也可以直接進場</span>
                  </>
                )}
              </div>
            )}
            
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
          </div>
        </div>
      </form>
    </div>
  );
}
