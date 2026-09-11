import { useEffect, useRef } from 'react';

export interface KeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

const KEY_MAP: Record<string, keyof KeyState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** 回傳可變的按鍵狀態 ref；在輸入框打字時不會觸發移動 */
export function useKeyboard() {
  const keys = useRef<KeyState>({ forward: false, back: false, left: false, right: false, run: false });

  useEffect(() => {
    const clear = () => {
      const k = keys.current;
      k.forward = k.back = k.left = k.right = k.run = false;
    };
    const onDown = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (!key) return;
      if (isTyping(e.target)) return;
      keys.current[key] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (!key) return;
      keys.current[key] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    };
  }, []);

  return keys;
}
