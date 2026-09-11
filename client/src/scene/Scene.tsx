import { Canvas } from '@react-three/fiber';
import { ContactShadows, Stats } from '@react-three/drei';
import { useGame } from '../store/useGame';
import { BloodParticles } from './BloodParticles';
import { CameraRig } from './CameraRig';
import { LocalPlayer } from './LocalPlayer';
import { Office } from './Office';
import { Pickups } from './Pickups';
import { Projectiles } from './Projectiles';
import { RemotePlayer } from './RemotePlayer';

function RemotePlayers() {
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.me?.sessionId);
  return (
    <>
      {Object.values(players)
        .filter((p) => p.sessionId !== meId)
        .map((p) => (
          <RemotePlayer key={p.sessionId} sessionId={p.sessionId} avatarId={p.avatarId} />
        ))}
    </>
  );
}

const showStats = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');

export function Scene() {
  return (
    <Canvas
      shadows="soft"
      camera={{ fov: 40, near: 0.5, far: 200, position: [12, 12, 12] }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#DFE8F0']} />
      <fog attach="fog" args={['#DFE8F0', 45, 90]} />

      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#FFFFFF', '#C9B7A0', 0.5]} />
      <directionalLight
        position={[18, 22, 10]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />

      <Office />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.25} scale={40} blur={2} far={4} resolution={512} frames={1} />
      <LocalPlayer />
      <RemotePlayers />
      <Pickups />
      <Projectiles />
      <BloodParticles />
      <CameraRig />
      {showStats && <Stats />}
    </Canvas>
  );
}
