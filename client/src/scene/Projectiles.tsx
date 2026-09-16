import { Suspense, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { PICKUPS, PROJECTILE_SCALE, type ProjectileEvent } from '@office/shared';
import { FoodModel } from './FoodModel';
import { SnowballMesh } from './Snowball';
import { projectileQueue } from './runtime';

interface Flight extends ProjectileEvent {
  startAt: number;
  durationMs: number;
}

function ProjectileItem({ flight }: { flight: Flight }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = Math.min(1, (performance.now() - flight.startAt) / flight.durationMs);
    const d = flight.distance * t;
    const arc = flight.kind === 'throw' ? Math.sin(Math.PI * t) * PICKUPS.throwArcHeight : 0;
    g.position.set(flight.fromX + flight.dirX * d, 1.1 + arc, flight.fromZ + flight.dirZ * d);
    g.rotation.x += 0.25;
    g.rotation.y += 0.1;
  });
  const scale = PROJECTILE_SCALE[flight.model] ?? 1;
  return (
    <group ref={group}>
      {flight.model === 'snowball' ? (
        <SnowballMesh />
      ) : (
        <Suspense fallback={null}>
          <FoodModel model={flight.model} scale={scale} position={[0, -0.1 * scale, 0]} />
        </Suspense>
      )}
    </group>
  );
}

/** 飛行中的投射物：由 projectileQueue 觸發，飛完自動移除 */
export function Projectiles() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const dirty = useRef(false);

  useFrame(() => {
    const now = performance.now();
    if (projectileQueue.length) {
      const added = projectileQueue.splice(0).map<Flight>((e) => ({ ...e, startAt: now, durationMs: (e.distance / e.speed) * 1000 }));
      setFlights((f) => [...f, ...added]);
      dirty.current = true;
    }
    if (flights.some((f) => now > f.startAt + f.durationMs)) {
      setFlights((f) => f.filter((x) => now <= x.startAt + x.durationMs));
    }
  });

  return (
    <>
      {flights.map((f) => (
        <ProjectileItem key={f.id} flight={f} />
      ))}
    </>
  );
}
