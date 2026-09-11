import { Suspense } from 'react';
import { Center, RoundedBox, Text3D } from '@react-three/drei';
import { HALF_D, ROOM_MIN_X } from '@office/shared';

const FONT_URL = '/fonts/helvetiker_bold.typeface.json';
const BRAND = 'Hihealth';
const BRAND_COLOR = '#2BAA8E';

interface LettersProps {
  text: string;
  size: number;
  depth: number;
  color: string;
}

function Letters({ text, size, depth, color }: LettersProps) {
  return (
    <Center>
      <Text3D
        font={FONT_URL}
        size={size}
        height={depth}
        curveSegments={8}
        bevelEnabled
        bevelThickness={depth * 0.15}
        bevelSize={size * 0.02}
        bevelSegments={2}
        castShadow
      >
        {text}
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
      </Text3D>
    </Center>
  );
}

/** 品牌標誌：圓角底板 + 立體字 */
function BrandPlaque() {
  return (
    <group>
      <RoundedBox args={[3.6, 1.1, 0.06]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#FBF7F1" roughness={0.9} />
      </RoundedBox>
      <group position={[0, 0, 0.06]}>
        <Letters text={BRAND} size={0.46} depth={0.08} color={BRAND_COLOR} />
      </group>
    </group>
  );
}

/**
 * 牆面裝飾：
 *  - 後牆（-Z）兩扇窗之間的品牌招牌
 *  - 左牆（-X）上方一行淡色標語
 */
export function WallSign() {
  return (
    <Suspense fallback={null}>
      {/* 後牆招牌：貼在牆面內側，字面朝 +Z */}
      <group position={[0.5, 2.05, -HALF_D + 0.04]}>
        <BrandPlaque />
      </group>

      {/* 左牆標語：貼在牆面內側，字面朝 +X */}
      <group position={[ROOM_MIN_X + 0.03, 2.35, 1.5]} rotation={[0, Math.PI / 2, 0]}>
        <Letters text="Hihealth  ·  Virtual Office" size={0.28} depth={0.04} color="#8FA3BF" />
      </group>

      {/* 健身房招牌：鏡子上方 */}
      <group position={[16, 2.72, -HALF_D + 0.04]}>
        <Letters text="Hihealth GYM" size={0.3} depth={0.05} color={BRAND_COLOR} />
      </group>
    </Suspense>
  );
}
