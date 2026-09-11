import { useState, type FormEvent } from 'react';
import { STATUS_MAX, STATUS_PRESETS } from '@office/shared';
import { sendStatus } from '../net/client';
import { useGame } from '../store/useGame';

export function StatusEditor() {
  const open = useGame((s) => s.statusOpen);
  const setOpen = useGame((s) => s.setStatusOpen);
  const meId = useGame((s) => s.me?.sessionId);
  const current = useGame((s) => (meId ? s.players[meId]?.status : '') ?? '');
  const [text, setText] = useState(current);

  const apply = (value: string) => {
    sendStatus(value.trim());
    setOpen(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply(text);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(current);
          setOpen(true);
        }}
        className="glass pointer-events-auto rounded-full px-4 py-2 text-sm font-medium cursor-pointer hover:bg-white"
      >
        {current ? `狀態：${current}` : '更改狀態'}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="glass pointer-events-auto w-72 rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">更改狀態</span>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 text-sm opacity-60 cursor-pointer hover:opacity-100">
          關閉
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {STATUS_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => apply(p)}
            className="rounded-full bg-white/80 px-3 py-1 text-xs cursor-pointer hover:bg-ink hover:text-white"
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => apply('')}
          className="rounded-full bg-white/50 px-3 py-1 text-xs opacity-70 cursor-pointer hover:bg-red-50 hover:text-red-700"
        >
          清除
        </button>
      </div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          maxLength={STATUS_MAX}
          placeholder={`自訂狀態（≤ ${STATUS_MAX} 字）`}
          className="flex-1 rounded-lg bg-white/80 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink/20"
        />
        <button type="submit" className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white cursor-pointer">
          套用
        </button>
      </div>
    </form>
  );
}
