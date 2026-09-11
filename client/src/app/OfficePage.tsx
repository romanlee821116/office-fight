import { Scene } from '../scene/Scene';
import { Hud } from '../ui/Hud';

export function OfficePage() {
  return (
    <div className="relative h-full w-full">
      <Scene />
      <Hud />
    </div>
  );
}
