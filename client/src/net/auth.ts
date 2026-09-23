import type { AuthMe } from '@office/shared';

/** 導向 Google 同意畫面；回來時伺服端會帶著 session cookie 導回首頁 */
export function startGoogleLogin(): void {
  location.href = '/api/auth/google';
}

/** 未登入或會員功能未啟用時回 null */
export async function fetchMe(): Promise<AuthMe | null> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as AuthMe;
  } catch {
    return null;
  }
}

/** 進場時把當下的暱稱與角色存回帳號；失敗不影響進場 */
export async function saveMe(name: string, avatarId: string): Promise<void> {
  try {
    await fetch('/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatarId }),
    });
  } catch {
    // 忽略；下次進場會再存一次
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // 忽略
  }
}

const LOGIN_ERRORS: Record<string, string> = {
  state: '登入逾時，請再試一次',
  cancelled: '已取消登入',
  google: 'Google 驗證失敗，請再試一次',
  domain: '只開放公司 Google 帳號登入',
  server: '伺服器忙線，請稍後再試',
};

/** 讀取 Google 導回時帶的錯誤碼，讀完就把網址參數清掉 */
export function takeLoginError(): string | null {
  const params = new URLSearchParams(location.search);
  const code = params.get('login_error');
  if (!code) return null;
  params.delete('login_error');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
  return LOGIN_ERRORS[code] ?? '登入失敗，請再試一次';
}
