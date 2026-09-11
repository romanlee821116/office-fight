import { cancelReconnect, disconnect } from '../net/client';
import { useGame } from '../store/useGame';
import { ChatPanel } from './ChatPanel';
import { DuelOverlay } from './DuelOverlay';
import { FightPanel } from './FightPanel';
import { InteractionBar } from './InteractionBar';
import { PlayerList } from './PlayerList';
import { StatusEditor } from './StatusEditor';

export function Hud() {
  const phase = useGame((s) => s.phase);
  const error = useGame((s) => s.error);
  const reconnectStatus = useGame((s) => s.reconnectStatus);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      {/* 頂部 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="glass pointer-events-auto rounded-2xl px-4 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold">Hihealth虛擬辦公室</span>
              <span className="text-[10px] opacity-40" title="建置時間">v{__BUILD_TIME__}</span>
            </div>
            <div className="text-[11px] opacity-60">WASD 移動 · Shift 加速 · E 坐下 · 1-3 表情 · 4-7 跳舞 · 拖曳旋轉 · 滾輪縮放</div>
          </div>
          <FightPanel />
        </div>
        <div className="flex flex-col items-end gap-2">
          <PlayerList />
          <button
            type="button"
            onClick={disconnect}
            className="glass pointer-events-auto rounded-full px-4 py-1.5 text-xs opacity-80 cursor-pointer hover:opacity-100"
          >
            離開
          </button>
        </div>
      </div>

      <div className="mx-auto mt-3">
        <DuelOverlay />
      </div>

      {phase === 'reconnecting' && (
        <div className="glass pointer-events-auto mx-auto mt-3 flex items-center gap-3 rounded-2xl bg-amber-50/90 px-4 py-2 text-sm text-amber-900 shadow">
          <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
          <span>
            與伺服器斷線，重新連線中…
            {reconnectStatus && <span className="ml-1 text-[11px] opacity-70">{reconnectStatus}</span>}
          </span>
          <button type="button" onClick={cancelReconnect} className="rounded-full bg-white/80 px-3 py-1 text-xs cursor-pointer hover:bg-white">
            回大廳
          </button>
        </div>
      )}
      {error && phase === 'office' && (
        <div className="pointer-events-none mx-auto mt-3 rounded-full bg-red-50 px-4 py-1.5 text-sm text-red-700 shadow">{error}</div>
      )}

      <div className="flex-1" />

      {/* 底部 */}
      <div className="flex items-end justify-between gap-4">
        <StatusEditor />
        <InteractionBar />
        <ChatPanel />
      </div>
    </div>
  );
}
