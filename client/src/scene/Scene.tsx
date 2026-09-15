import { Canvas } from '@react-three/fiber';
import { ContactShadows, Stats } from '@react-three/drei';
import { useGame } from '../store/useGame';
import { Backdrop } from './Backdrop';
import { BloodParticles } from './BloodParticles';
import { CameraRig } from './CameraRig';
import { SceneEnvironment } from './Environment';
import { LocalPlayer } from './LocalPlayer';
import { Office } from './Office';
import { Pets } from './Pets';
import { PickleCourt } from './PickleCourt';
import { Stove } from './Stove';
import { Pickups } from './Pickups';
import { Projectiles } from './Projectiles';
import { RemotePlayer } from './RemotePlayer';
import { SceneThemeProvider } from './SceneTheme';

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
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <fog attach="fog" args={['#DFE8F0', 45, 90]} />
      <SceneEnvironment />

      <SceneThemeProvider>
        <Backdrop />
        <Office />
        <PickleCourt />
      </SceneThemeProvider>
      <ContactShadows position={[0, 0.01, 0]} opacity={0.25} scale={40} blur={2} far={4} resolution={512} frames={1} />
      <LocalPlayer />
      <RemotePlayers />
      <Pets />
      <Stove />
      <Pickups />
      <Projectiles />
      <BloodParticles />
      <CameraRig />
      {showStats && <Stats />}
    </Canvas>
  );
}
