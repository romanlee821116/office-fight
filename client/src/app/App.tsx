import { useGame } from '../store/useGame';
import { Lobby } from '../ui/Lobby';
import { OfficePage } from './OfficePage';

export function App() {
  const phase = useGame((s) => s.phase);
  if (phase === 'lobby' || phase === 'connecting') {
    return <Lobby />;
  }
  return <OfficePage />;
}
