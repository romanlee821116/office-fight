/**
 * 通知工具：原生 Notification（僅 HTTPS / localhost 可用）、分頁標題閃爍、提示音。
 * 內網 http 環境拿不到通知權限，因此標題與聲音是主要提示手段。
 */

const baseTitle = document.title;
let flashTimer: ReturnType<typeof setInterval> | null = null;
let unreadCount = 0;
let audioCtx: AudioContext | null = null;

export function canUseNativeNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

/** 在使用者手勢（點擊進入）時呼叫，才會跳出權限詢問 */
export async function requestNotificationPermission(): Promise<void> {
  if (!canUseNativeNotifications() || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // 忽略：部分瀏覽器不支援 Promise 版本
  }
}

/** 分頁在背景時送出原生通知；點擊通知回到遊戲 */
export function nativeNotify(title: string, body: string): void {
  if (!canUseNativeNotifications() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag: 'office-game' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // 忽略
  }
}

function renderTitle(): void {
  document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${baseTitle}` : baseTitle;
}

/** 未讀聊天數量反映到分頁標題 */
export function setUnreadTitle(count: number): void {
  unreadCount = count;
  if (!flashTimer) renderTitle();
}

/** 標題閃爍直到使用者回到分頁或呼叫 stopFlashTitle */
export function flashTitle(text: string): void {
  stopFlashTitle();
  let on = false;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? text : baseTitle;
  }, 800);
  const stop = () => {
    stopFlashTitle();
    window.removeEventListener('focus', stop);
    document.removeEventListener('visibilitychange', onVisible);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') stop();
  };
  window.addEventListener('focus', stop);
  document.addEventListener('visibilitychange', onVisible);
}

export function stopFlashTitle(): void {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  renderTitle();
}

/** 短促提示音（WebAudio，不需音檔）；瀏覧器可能要求先有使用者互動 */
export function beep(pattern: 'invite' | 'message' = 'invite'): void {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const notes = pattern === 'invite' ? [880, 1174] : [660];
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = audioCtx!.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    });
  } catch {
    // 無音效裝置或被瀏覽器阻擋時忽略
  }
}
