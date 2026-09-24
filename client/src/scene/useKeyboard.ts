import { useEffect, useRef } from 'react';
import { useGame } from '../store/useGame';

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

/** 全螢幕面板（商店）開著時，鍵盤不該還在操控角色 */
export function uiCapturingKeys(): boolean {
  return useGame.getState().shopOpen;
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
      if (isTyping(e.target) || uiCapturingKeys()) return;
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
    const unsubscribe = useGame.subscribe((s, prev) => {
      if (s.shopOpen && !prev.shopOpen) clear();
    });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      unsubscribe();
    };
  }, []);

  return keys;
}
