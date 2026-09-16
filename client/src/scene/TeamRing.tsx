import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { SNOW_TEAM_COLOR, type SnowTeam } from '@office/shared';

/**
 * 腳下的隊伍圈。分隊打雪仗時每個人腳邊會有一圈隊伍顏色，
 * 隔著半個場地也認得出誰是敵人——這是分隊模式唯一的敵我辨識。
 *
 * 出局的人（out）圈圈留著但變暗、不轉，一眼就知道他已經不算數了。
 */
export function TeamRing({ team, out }: { team: SnowTeam; out: boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame((state) => {
    if (mesh.current && !out) mesh.current.rotation.z = state.clock.elapsedTime * 1.2;
  });
  const color = SNOW_TEAM_COLOR[team];
  return (
    <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={mesh}>
        <ringGeometry args={[0.52, 0.7, out ? 32 : 6]} />
        <meshBasicMaterial color={color} transparent opacity={out ? 0.25 : 0.95} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color={color} transparent opacity={out ? 0.06 : 0.22} />
      </mesh>
    </group>
  );
}
