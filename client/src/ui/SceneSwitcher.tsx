import { startSceneTour } from '../scene/runtime';
import { THEMES } from '../scene/themes';
import { useGame } from '../store/useGame';

/** 場景主題切換（只影響自己的畫面，選擇存在 localStorage） */
export function SceneSwitcher() {
  const current = useGame((s) => s.sceneTheme);
  const loading = useGame((s) => s.sceneThemeLoading);
  const setSceneTheme = useGame((s) => s.setSceneTheme);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
      <span className="opacity-60">場景</span>
      {THEMES.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSceneTheme(t.id);
              // 預設俯角看不到地平線，切換時把鏡頭抬起來讓人直接看到景
              if (t.id !== 'office') startSceneTour();
            }}
            aria-pressed={active}
            title={`${t.label}（只影響自己的畫面）`}
            className={
              'flex items-center gap-1 rounded-full px-1.5 py-0.5 transition cursor-pointer ' +
              (active ? 'bg-sage/30 hover:bg-sage/45' : 'bg-ink/10 opacity-60 hover:opacity-90')
            }
          >
            <span aria-hidden>{t.emoji}</span>
            {active && <span>{t.label}</span>}
          </button>
        );
      })}
      {loading && <span className="animate-pulse opacity-60">載入中…</span>}
    </div>
  );
}
