import type { FurnitureDef } from '@office/shared';

const LEG = '#8A7A6A';
const DARK = '#3E4A59';

function Desk({ f }: { f: FurnitureDef }) {
  const legOffX = f.w / 2 - 0.08;
  const legOffZ = f.d / 2 - 0.08;
  return (
    <group>
      <mesh position={[0, f.h - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, 0.06, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      {[
        [-legOffX, -legOffZ],
        [legOffX, -legOffZ],
        [-legOffX, legOffZ],
        [legOffX, legOffZ],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, (f.h - 0.06) / 2, z]} castShadow>
          <boxGeometry args={[0.06, f.h - 0.06, 0.06]} />
          <meshStandardMaterial color={LEG} />
        </mesh>
      ))}
      {/* 螢幕 */}
      <mesh position={[0, f.h + 0.22, -f.d / 2 + 0.2]} castShadow>
        <boxGeometry args={[0.55, 0.34, 0.03]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, f.h + 0.22, -f.d / 2 + 0.215]}>
        <boxGeometry args={[0.5, 0.29, 0.005]} />
        <meshStandardMaterial color="#9FC5E8" emissive="#6FA8DC" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, f.h + 0.03, -f.d / 2 + 0.2]}>
        <boxGeometry args={[0.16, 0.06, 0.12]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

function Chair({ f }: { f: FurnitureDef }) {
  const seatH = 0.45;
  return (
    <group>
      <mesh position={[0, seatH, 0]} castShadow>
        <boxGeometry args={[f.w, 0.08, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      <mesh position={[0, seatH + 0.28, f.d / 2 - 0.04]} castShadow>
        <boxGeometry args={[f.w, 0.5, 0.08]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      <mesh position={[0, seatH / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, seatH, 8]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

function Table({ f }: { f: FurnitureDef }) {
  return (
    <group>
      <mesh position={[0, f.h - 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, 0.08, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      {[
        [-f.w / 2 + 0.15, -f.d / 2 + 0.15],
        [f.w / 2 - 0.15, -f.d / 2 + 0.15],
        [-f.w / 2 + 0.15, f.d / 2 - 0.15],
        [f.w / 2 - 0.15, f.d / 2 - 0.15],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, (f.h - 0.08) / 2, z]} castShadow>
          <boxGeometry args={[0.08, f.h - 0.08, 0.08]} />
          <meshStandardMaterial color={LEG} />
        </mesh>
      ))}
    </group>
  );
}

function Sofa({ f }: { f: FurnitureDef }) {
  const seatH = 0.42;
  return (
    <group>
      <mesh position={[0, seatH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, seatH, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      <mesh position={[0, seatH + (f.h - seatH) / 2, f.d / 2 - 0.12]} castShadow>
        <boxGeometry args={[f.w, f.h - seatH, 0.24]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (f.w / 2 - 0.1), seatH + 0.1, 0]} castShadow>
          <boxGeometry args={[0.2, 0.2, f.d]} />
          <meshStandardMaterial color={f.color} />
        </mesh>
      ))}
    </group>
  );
}

function Plant({ f }: { f: FurnitureDef }) {
  const potH = 0.45;
  return (
    <group>
      <mesh position={[0, potH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, potH, 12]} />
        <meshStandardMaterial color="#C98B6B" />
      </mesh>
      <mesh position={[0, potH + 0.45, 0]} castShadow>
        <sphereGeometry args={[0.45, 12, 10]} />
        <meshStandardMaterial color={f.color} flatShading />
      </mesh>
      <mesh position={[0.2, potH + 0.75, 0.1]} castShadow>
        <sphereGeometry args={[0.28, 10, 8]} />
        <meshStandardMaterial color="#79A87A" flatShading />
      </mesh>
    </group>
  );
}

function Fridge({ f }: { f: FurnitureDef }) {
  return (
    <group>
      <mesh position={[0, f.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, f.h, f.d]} />
        <meshStandardMaterial color={f.color} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[f.w / 2 - 0.12, f.h * 0.55, f.d / 2 + 0.01]}>
        <boxGeometry args={[0.04, 0.5, 0.03]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

function Whiteboard({ f }: { f: FurnitureDef }) {
  return (
    <group position={[0, 1.5, 0]}>
      <mesh>
        <boxGeometry args={[f.w, f.h, 0.06]} />
        <meshStandardMaterial color="#B9C2CC" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <boxGeometry args={[f.w - 0.12, f.h - 0.12, 0.01]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
    </group>
  );
}

/** 半高玻璃隔間 */
function Partition({ f }: { f: FurnitureDef }) {
  return (
    <group>
      <mesh position={[0, f.h / 2, 0]} castShadow>
        <boxGeometry args={[f.w, f.h, f.d]} />
        <meshStandardMaterial color={f.color} transparent opacity={0.35} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* 上下框 */}
      <mesh position={[0, f.h, 0]}>
        <boxGeometry args={[f.w + 0.04, 0.06, f.d + 0.04]} />
        <meshStandardMaterial color="#8A94A6" />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[f.w + 0.04, 0.1, f.d + 0.04]} />
        <meshStandardMaterial color="#8A94A6" />
      </mesh>
    </group>
  );
}

/** 健身房橡膠地墊 */
function GymFloor({ f }: { f: FurnitureDef }) {
  return (
    <mesh position={[0, 0.012, 0]} receiveShadow>
      <boxGeometry args={[f.w, 0.024, f.d]} />
      <meshStandardMaterial color={f.color} roughness={0.95} />
    </mesh>
  );
}

/** 平板臥推椅 */
function Bench({ f }: { f: FurnitureDef }) {
  return (
    <group>
      <mesh position={[0, f.h - 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, 0.1, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      {[-f.d / 2 + 0.15, f.d / 2 - 0.15].map((z) => (
        <mesh key={z} position={[0, (f.h - 0.1) / 2, z]} castShadow>
          <boxGeometry args={[0.08, f.h - 0.1, 0.08]} />
          <meshStandardMaterial color="#9AA3AD" />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.5, 0.06, f.d - 0.2]} />
        <meshStandardMaterial color="#9AA3AD" />
      </mesh>
    </group>
  );
}

/** 器材架（槓鈴架兩根立柱 / 啞鈴架矮平台） */
function Rack({ f }: { f: FurnitureDef }) {
  const tall = f.h > 0.8;
  if (tall) {
    return (
      <group>
        {[-f.w / 2 + 0.06, f.w / 2 - 0.06].map((x) => (
          <group key={x}>
            <mesh position={[x, f.h / 2, 0]} castShadow>
              <boxGeometry args={[0.1, f.h, 0.1]} />
              <meshStandardMaterial color={f.color} />
            </mesh>
            <mesh position={[x, f.h - 0.06, 0.1]} castShadow>
              <boxGeometry args={[0.12, 0.12, 0.3]} />
              <meshStandardMaterial color={f.color} />
            </mesh>
            <mesh position={[x, 0.03, 0]}>
              <boxGeometry args={[0.3, 0.06, 0.5]} />
              <meshStandardMaterial color={f.color} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, f.h - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[f.w, 0.06, f.d]} />
        <meshStandardMaterial color={f.color} />
      </mesh>
      {[
        [-f.w / 2 + 0.06, -f.d / 2 + 0.06],
        [f.w / 2 - 0.06, -f.d / 2 + 0.06],
        [-f.w / 2 + 0.06, f.d / 2 - 0.06],
        [f.w / 2 - 0.06, f.d / 2 - 0.06],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, (f.h - 0.06) / 2, z]} castShadow>
          <boxGeometry args={[0.06, f.h - 0.06, 0.06]} />
          <meshStandardMaterial color="#9AA3AD" />
        </mesh>
      ))}
    </group>
  );
}

function SimpleBox({ f }: { f: FurnitureDef }) {
  return (
    <mesh position={[0, f.h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[f.w, f.h, f.d]} />
      <meshStandardMaterial color={f.color} />
    </mesh>
  );
}

function Rug({ f }: { f: FurnitureDef }) {
  return (
    <mesh position={[0, 0.01, 0]} receiveShadow>
      <boxGeometry args={[f.w, 0.02, f.d]} />
      <meshStandardMaterial color={f.color} />
    </mesh>
  );
}

/** 程式生成的簡易幾何家具：GLB 載入前的 fallback，以及沒有對應模型的類型（白板） */
export function FurniturePrimitive({ f }: { f: FurnitureDef }) {
  switch (f.type) {
    case 'desk':
      return <Desk f={f} />;
    case 'chair':
      return <Chair f={f} />;
    case 'table':
      return <Table f={f} />;
    case 'sofa':
      return <Sofa f={f} />;
    case 'plant':
      return <Plant f={f} />;
    case 'fridge':
      return <Fridge f={f} />;
    case 'whiteboard':
      return <Whiteboard f={f} />;
    case 'rug':
      return <Rug f={f} />;
    case 'partition':
      return <Partition f={f} />;
    case 'gymfloor':
      return <GymFloor f={f} />;
    case 'bench':
      return <Bench f={f} />;
    case 'rack':
      return <Rack f={f} />;
    case 'treadmill':
    case 'gymmat':
    case 'cabinet':
    case 'counter':
    case 'prop':
    default:
      return <SimpleBox f={f} />;
  }
}
