import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';

/** 閒置警告橫幅：顯示剩餘時間，任何操作都會讓伺服端取消警告 */
export function IdleWarning() {
  const warning = useGame((s) => s.idleWarning);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!warning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [warning]);

  if (!warning) return null;
  const secondsLeft = Math.max(0, Math.ceil((warning.deadline - now) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="glass pointer-events-none flex items-center gap-2 rounded-2xl bg-amber-50/90 px-4 py-2 text-sm text-amber-900 shadow">
      <span aria-hidden>⏳</span>
      <span>
        {warning.reason === 'hidden' ? '這個分頁已閒置一段時間' : '你已經很久沒有動作'}，
        <span className="mx-1 font-bold tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
        後會自動離開。動一下就會取消。
      </span>
    </div>
  );
}
