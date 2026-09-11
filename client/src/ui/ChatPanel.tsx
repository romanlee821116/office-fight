import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CHAT_MAX } from '@office/shared';
import { sendChat } from '../net/client';
import { setUnreadTitle } from '../lib/notify';
import { useGame } from '../store/useGame';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatPanel() {
  const open = useGame((s) => s.chatOpen);
  const setOpen = useGame((s) => s.setChatOpen);
  const messages = useGame((s) => s.messages);
  const unread = useGame((s) => s.unread);
  const meId = useGame((s) => s.me?.sessionId);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 全域快捷鍵：Enter 開啟聊天並聚焦、Esc 關閉
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Enter' && !typing) {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (e.key === 'Escape') {
        inputRef.current?.blur();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages, open]);

  // 未讀數量同步到分頁標題
  useEffect(() => {
    setUnreadTitle(unread);
    return () => setUnreadTitle(0);
  }, [unread]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText('');
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.currentTarget.blur();
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="glass pointer-events-auto relative rounded-full px-4 py-2 text-sm font-medium cursor-pointer hover:bg-white"
      >
        聊天室
        {unread > 0 && (
          <span
            aria-label={`${unread} 則未讀訊息`}
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white shadow"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="glass pointer-events-auto flex h-80 w-80 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2">
        <span className="text-sm font-semibold">聊天室</span>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 text-sm opacity-60 cursor-pointer hover:opacity-100">
          收合
        </button>
      </div>
      <div ref={listRef} className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[13px]">
        {messages.length === 0 && <div className="py-6 text-center text-xs opacity-50">還沒有訊息，說聲嗨吧！</div>}
        {messages.map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="text-center text-[11px] italic opacity-50">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="break-words">
              <span className="text-[10px] opacity-40">{formatTime(m.ts)} </span>
              <span className={'font-semibold ' + (m.senderId === meId ? 'text-peach' : '')}>{m.name}</span>
              <span className="opacity-50">：</span>
              <span>{m.text}</span>
            </div>
          ),
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-ink/10 p-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onInputKey}
          maxLength={CHAT_MAX}
          placeholder="輸入訊息，Enter 送出"
          className="flex-1 rounded-lg bg-white/80 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink/20"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className={'rounded-lg bg-ink px-3 py-1.5 text-sm text-white cursor-pointer ' + (!text.trim() ? 'cursor-not-allowed opacity-40' : '')}
        >
          送出
        </button>
      </form>
    </div>
  );
}
