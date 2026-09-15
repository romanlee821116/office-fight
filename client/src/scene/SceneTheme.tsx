import { createContext, startTransition, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGame } from '../store/useGame';
import { getTheme } from './themes';
import type { SceneTheme } from './themes/types';

const ThemeContext = createContext<SceneTheme>(getTheme('office'));

/**
 * 把 store 裡的主題選擇以 transition 帶進 R3F 樹：新主題的模型還在載入時，
 * 室內配色與背景都維持舊主題，載完才一起切換，不會閃一下空白。
 */
export function SceneThemeProvider({ children }: { children: ReactNode }) {
  const target = useGame((s) => s.sceneTheme);
  const [id, setId] = useState(target);

  useEffect(() => {
    if (id === target) return;
    startTransition(() => setId(target));
  }, [id, target]);

  useEffect(() => {
    useGame.getState().setSceneThemeLoading(id !== target);
  }, [id, target]);

  return <ThemeContext.Provider value={getTheme(id)}>{children}</ThemeContext.Provider>;
}

/** 目前實際顯示中的主題（切換載入期間仍是舊主題） */
export function useSceneTheme(): SceneTheme {
  return useContext(ThemeContext);
}
