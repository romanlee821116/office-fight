import { FACE, type AuthMe } from '@office/shared';

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

/**
 * 換一張進場票帶進 Colyseus，伺服端才知道這個連線屬於哪個帳號（金幣要記到帳上）。
 * 未登入或會員功能未啟用時回 null，照樣能以訪客身分進場。
 */
export async function fetchRoomTicket(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/ticket', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: unknown };
    return typeof data.ticket === 'string' ? data.ticket : null;
  } catch {
    return null;
  }
}

/**
 * 把照片裁成正方形、縮到 FACE.uploadSize 再壓成 JPEG。
 *
 * 壓縮在瀏覽器做，伺服器收到的永遠只有幾 KB——不必處理大檔上傳，
 * 資料庫也不會被塞爆。裁切取中央的正方形（多數人像照臉都在中間）。
 */
export async function prepareFace(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = FACE.uploadSize;
  canvas.height = FACE.uploadSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    FACE.uploadSize,
    FACE.uploadSize,
  );
  bitmap.close();
  // 一定要 PNG：伺服端要把它合成到角色貼圖上，而 Node 沒有內建的 JPEG 解碼
  return canvas.toDataURL('image/png');
}

/** 上傳已經縮好的臉部照片；回傳新的網址，失敗回 null */
export async function uploadFace(image: string): Promise<string | null> {
  try {
    const res = await fetch('/api/me/face', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { faceUrl?: string }).faceUrl ?? null;
  } catch {
    return null;
  }
}

export async function removeFace(): Promise<boolean> {
  try {
    return (await fetch('/api/me/face', { method: 'DELETE' })).ok;
  } catch {
    return false;
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
