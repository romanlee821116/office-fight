import { Suspense } from 'react';
import { FURNITURE, type FurnitureDef } from '@office/shared';
import { FurniturePrimitive } from './FurniturePrimitive';
import { KitModel } from './KitModel';
import { getRecipe, partToProps } from './furnitureModels';

function FurnitureModel({ f }: { f: FurnitureDef }) {
  const parts = getRecipe(f);
  if (!parts) return <FurniturePrimitive f={f} />;
  return (
    <>
      {parts.map((p, i) => (
        <KitModel key={i} {...partToProps(p)} />
      ))}
    </>
  );
}

export function Furniture() {
  return (
    <group>
      {FURNITURE.map((f) => (
        <group key={f.id} position={[f.x, f.y ?? 0, f.z]} rotation={[0, f.rotY ?? 0, 0]}>
          <Suspense fallback={<FurniturePrimitive f={f} />}>
            <FurnitureModel f={f} />
          </Suspense>
        </group>
      ))}
    </group>
  );
}
