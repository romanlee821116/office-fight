import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { AnimState, AvatarDef } from '@office/shared';
import { Avatar } from '../scene/Avatar';
import { PetPreview } from '../scene/PetPreview';

const idle = { current: 'idle' as AnimState };

function Spinner({ avatar, hatId, outfitId, weaponId, petId, petTint }: PreviewProps) {
  const g = useRef<Group>(null);
  useFrame((_s, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.8;
  });
  return (
    <group ref={g} position={[0, -0.95, 0]}>
      <Avatar avatar={avatar} animRef={idle} hatId={hatId} outfitId={outfitId} weaponId={weaponId} />
      {petId && (
        <Suspense fallback={null}>
          <PetPreview petItemId={petId} tint={petTint ?? ''} />
        </Suspense>
      )}
    </group>
  );
}

interface PreviewProps {
  avatar: AvatarDef;
  /** 試穿用；大廳選角色時不傳 */
  hatId?: string;
  outfitId?: string;
  /** 試拿的武器（weapons.ts 的武器 id） */
  weaponId?: string;
  /** 試看的跟班寵物（商店商品 id） */
  petId?: string;
  /** 寵物的染色 id */
  petTint?: string;
}

export function AvatarPreview({ avatar, hatId = '', outfitId = '', weaponId = '', petId = '', petTint = '' }: PreviewProps) {
  return (
    <Canvas camera={{ position: [0, 0.6, 4.2], fov: 35 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <Spinner avatar={avatar} hatId={hatId} outfitId={outfitId} weaponId={weaponId} petId={petId} petTint={petTint} />
      </Suspense>
    </Canvas>
  );
}
