import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { AnimState, AvatarDef } from '@office/shared';
import { Avatar } from '../scene/Avatar';

const idle = { current: 'idle' as AnimState };

function Spinner({ avatar }: { avatar: AvatarDef }) {
  const g = useRef<Group>(null);
  useFrame((_s, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.8;
  });
  return (
    <group ref={g} position={[0, -0.95, 0]}>
      <Avatar avatar={avatar} animRef={idle} />
    </group>
  );
}

export function AvatarPreview({ avatar }: { avatar: AvatarDef }) {
  return (
    <Canvas camera={{ position: [0, 0.6, 4.2], fov: 35 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <Spinner avatar={avatar} />
      </Suspense>
    </Canvas>
  );
}
