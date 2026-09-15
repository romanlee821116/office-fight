import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  CAROUSEL,
  COASTER,
  PARK_CENTER_X,
  PARK_CENTER_Z,
  PARK_MAX_X,
  PARK_MAX_Z,
  PARK_MIN_X,
  PARK_MIN_Z,
  PLAY_MIN_X,
  carouselTurn,
} from '@office/shared';
import { Coaster } from './Coaster';
import { KitModel } from './KitModel';
import { Fence } from './PickleCourt';
import { useSceneTheme } from './SceneTheme';

const PARK_W = PARK_MAX_X - PARK_MIN_X;
const PARK_D = PARK_MAX_Z - PARK_MIN_Z;

/** 上車點（與 seats.ts 的 coasterSeats 同一個位置） */
const BOARD_X = COASTER.startX + 2;
const BOARD_Z = COASTER.startZ + 1.5;

/** coaster kit 的佈景件偏小（樹 1.19m、攤位 1.55m），放大到跟 1.7m 的角色相稱 */
const PROP_SCALE = 1.6;

/** 純佈景，不參與碰撞：沿著園區邊緣擺，不擋動線也不壓到設施 */
const PROPS = [
  { key: 'stall-food', model: 'stall-food', x: 33, z: 21.4, rotY: Math.PI },
  { key: 'stall-drinks', model: 'stall-drinks', x: 36, z: 21.4, rotY: Math.PI },
  { key: 'bench-a', model: 'bench', x: 24, z: 31, rotY: 0 },
  { key: 'bench-b', model: 'bench', x: 27, z: 31, rotY: 0 },
  { key: 'tree-a', model: 'tree-large', x: 13.5, z: 21.5, rotY: 0 },
  { key: 'tree-b', model: 'tree', x: 13.5, z: 30.5, rotY: 0 },
  { key: 'tree-c', model: 'tree-large', x: 39.5, z: 30.5, rotY: 0 },
  { key: 'tree-d', model: 'tree', x: 22.5, z: 31, rotY: 0 },
  { key: 'flowers-a', model: 'flowers', x: 18, z: 31, rotY: 0 },
  { key: 'flowers-b', model: 'flowers', x: 15, z: 26, rotY: 0 },
];

/**
 * 旋轉木馬。carousel.glb 是單一 mesh（屋頂與轉盤熔在一起），所以整座一起轉；
 * 底座是平的圓盤，轉起來看不出來。轉角取自 Date.now()，跟 rideSeatAt 是同一條式子，
 * 所以木馬與騎在上面的人永遠對齊，也不需要為了同步傳任何狀態。
 */
function Carousel() {
  const spin = useRef<Group>(null);

  useFrame(() => {
    if (!spin.current) return;
    // 正的：馬頭朝前進方向（見 CAROUSEL.seatAngle 的說明）
    spin.current.rotation.y = carouselTurn(Date.now());
  });

  return (
    <group position={[CAROUSEL.x, 0, CAROUSEL.z]}>
      <group ref={spin}>
        <KitModel model="park/carousel" scale={CAROUSEL.scale} />
      </group>
    </group>
  );
}

/**
 * 遊樂園：兒童遊戲區再往 +Z 的戶外場地，橫跨健身房與匹克球場的後方。
 * 靠遊戲區那一側（z = PARK_MIN_Z）的右半邊開放通行，其餘三面圍起來。
 */
export function Park() {
  const { palette } = useSceneTheme();
  return (
    <group>
      {/* 地台（延續浮島，讓場地不像浮在空中） */}
      <mesh position={[PARK_CENTER_X, -0.32, PARK_CENTER_Z]} receiveShadow>
        <boxGeometry args={[PARK_W + 1.2, 0.6, PARK_D + 1.2]} />
        <meshStandardMaterial color={palette.base} />
      </mesh>

      {/* 鋪面：外圈跟著場景主題，中間鋪一塊園區草地 */}
      <mesh position={[PARK_CENTER_X, 0.006, PARK_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PARK_W, PARK_D]} />
        <meshStandardMaterial color={palette.terrace} />
      </mesh>
      <mesh position={[PARK_CENTER_X, 0.014, PARK_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PARK_W - 2, PARK_D - 2]} />
        <meshStandardMaterial color="#8AA98C" />
      </mesh>

      {/* 圍籬：東西南三面，以及北側被隱形擋塊擋住的左半段 */}
      <Fence x={PARK_MIN_X + 0.1} z={PARK_CENTER_Z} w={0.06} d={PARK_D} />
      <Fence x={PARK_MAX_X - 0.1} z={PARK_CENTER_Z} w={0.06} d={PARK_D} />
      <Fence x={PARK_CENTER_X} z={PARK_MAX_Z - 0.1} w={PARK_W} d={0.06} />
      {/* 北側左半段後面是沒開放的空區，圍起來才不會看起來能走過去 */}
      <Fence x={(PARK_MIN_X + PLAY_MIN_X) / 2} z={PARK_MIN_Z + 0.1} w={PLAY_MIN_X - PARK_MIN_X} d={0.06} />

      <Carousel />
      <Coaster />

      {/* 車站入口：上車點就在拱門底下（軌道架在 2.6m 高，坐下去才送上車） */}
      <KitModel model="park/coaster/ride-entrance" position={[BOARD_X, 0, BOARD_Z]} rotY={Math.PI} scale={PROP_SCALE} />
      <KitModel model="park/coaster/station" position={[BOARD_X, 0, BOARD_Z - 0.9]} scale={PROP_SCALE} />

      {/* 園區佈景 */}
      {PROPS.map((p) => (
        <KitModel key={p.key} model={`park/coaster/${p.model}`} position={[p.x, 0, p.z]} rotY={p.rotY} scale={PROP_SCALE} />
      ))}
    </group>
  );
}
