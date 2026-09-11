import { HALF_D, ROOM_CENTER_X, ROOM_DEPTH, ROOM_MIN_X, ROOM_WIDTH, WALL_HEIGHT } from '@office/shared';
import { Furniture } from './Furniture';
import { WallSign } from './WallSign';

const WALL_T = 0.3;

export function Office() {
  return (
    <group>
      {/* 地板（原點在辦公區中央，房間往右延伸到 x=20） */}
      <mesh position={[ROOM_CENTER_X, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color="#D9B98F" />
      </mesh>
      <gridHelper
        args={[ROOM_WIDTH, ROOM_WIDTH, '#C9A87A', '#CFAF84']}
        position={[ROOM_CENTER_X, 0.005, 0]}
        scale={[1, 1, ROOM_DEPTH / ROOM_WIDTH]}
      />

      {/* 地台外圍（讓房間看起來像一塊浮島） */}
      <mesh position={[ROOM_CENTER_X, -0.32, 0]} receiveShadow>
        <boxGeometry args={[ROOM_WIDTH + 1.2, 0.6, ROOM_DEPTH + 1.2]} />
        <meshStandardMaterial color="#B6C2CF" />
      </mesh>

      {/* 後牆（-Z） */}
      <mesh position={[ROOM_CENTER_X, WALL_HEIGHT / 2, -HALF_D - WALL_T / 2]} castShadow receiveShadow>
        <boxGeometry args={[ROOM_WIDTH + WALL_T * 2, WALL_HEIGHT, WALL_T]} />
        <meshStandardMaterial color="#A9BBCF" />
      </mesh>
      {/* 左牆（-X） */}
      <mesh position={[ROOM_MIN_X - WALL_T / 2, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color="#B7C7D8" />
      </mesh>
      {/* 牆腳線 */}
      <mesh position={[ROOM_CENTER_X, 0.08, -HALF_D + 0.03]}>
        <boxGeometry args={[ROOM_WIDTH, 0.16, 0.06]} />
        <meshStandardMaterial color="#F3F1EC" />
      </mesh>
      <mesh position={[ROOM_MIN_X + 0.03, 0.08, 0]}>
        <boxGeometry args={[0.06, 0.16, ROOM_DEPTH]} />
        <meshStandardMaterial color="#F3F1EC" />
      </mesh>

      {/* 健身房後牆的鏡子 */}
      <group position={[16, 1.5, -HALF_D - WALL_T / 2 + 0.17]}>
        <mesh>
          <boxGeometry args={[7.2, 1.9, 0.05]} />
          <meshStandardMaterial color="#8A94A6" />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[7.0, 1.7, 0.01]} />
          <meshStandardMaterial color="#DCE7F2" metalness={0.9} roughness={0.05} />
        </mesh>
      </group>

      {/* 後牆上的窗戶 */}
      {[-3.5, 4.5].map((x) => (
        <group key={x} position={[x, 1.8, -HALF_D - WALL_T / 2 + 0.16]}>
          <mesh>
            <boxGeometry args={[2.4, 1.4, 0.05]} />
            <meshStandardMaterial color="#F7FBFF" emissive="#DDEBFA" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.06, 1.4, 0.02]} />
            <meshStandardMaterial color="#F3F1EC" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[2.4, 0.06, 0.02]} />
            <meshStandardMaterial color="#F3F1EC" />
          </mesh>
        </group>
      ))}

      <Furniture />
      <WallSign />
    </group>
  );
}
