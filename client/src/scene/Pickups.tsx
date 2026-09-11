import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { getWeapon } from '@office/shared';
import { useGame } from '../store/useGame';
import { FoodModel } from './FoodModel';

function PickupItem({ id, weaponId, x, y, z, highlighted }: { id: string; weaponId: string; x: number; y: number; z: number; highlighted: boolean }) {
  const group = useRef<Group>(null);
  const phase = useRef(id.length * 1.7);
  const weapon = getWeapon(weaponId);

  useFrame((_s, dt) => {
    phase.current += dt;
    const g = group.current;
    if (!g) return;
    // 架上的道具不飄浮旋轉，安靜放著
    if (y > 0) {
      g.position.y = 0;
      g.rotation.y = 0;
      return;
    }
    g.position.y = 0.12 + Math.sin(phase.current * 2) * 0.05;
    g.rotation.y = phase.current * 0.9;
  });

  if (!weapon) return null;
  return (
    <group position={[x, y, z]}>
      <group ref={group}>
        <Suspense fallback={null}>
          <FoodModel model={weapon.model} scale={weapon.scale} />
        </Suspense>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} visible={y === 0 || highlighted}>
        <ringGeometry args={[0.32, 0.4, 32]} />
        <meshBasicMaterial color={highlighted ? '#F4A261' : '#FFFFFF'} transparent opacity={highlighted ? 0.95 : 0.55} />
      </mesh>
    </group>
  );
}

/** 地上的武器道具 */
export function Pickups() {
  const pickups = useGame((s) => s.pickups);
  const nearId = useGame((s) => s.nearPickupId);
  return (
    <>
      {Object.values(pickups).map((p) => (
        <PickupItem key={p.id} id={p.id} weaponId={p.weaponId} x={p.x} y={p.y} z={p.z} highlighted={p.id === nearId} />
      ))}
    </>
  );
}
