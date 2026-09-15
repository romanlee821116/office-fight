import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  FURNITURE,
  PLAYGROUND,
  PLAY_CENTER_X,
  PLAY_CENTER_Z,
  PLAY_MAX_X,
  PLAY_MAX_Z,
  PLAY_MIN_X,
  PLAY_MIN_Z,
  type FurnitureDef,
} from '@office/shared';
import { beatNow, seesawTilt, swingRideAngle } from './dances';
import { Fence } from './PickleCourt';
import { useSceneTheme } from './SceneTheme';
import { usePlaygroundPart, type PlaygroundPartId } from './playgroundModel';

const PLAY_W = PLAY_MAX_X - PLAY_MIN_X;
const PLAY_D = PLAY_MAX_Z - PLAY_MIN_Z;

/** 設施的位置與朝向一律從家具表讀，才不會跟碰撞盒與座位表對不上 */
const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
function spot(id: string): FurnitureDef {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`家具表裡沒有 ${id}`);
  return f;
}

/** 不會動的設施：水池、沙坑、溜滑梯 */
function StaticPart({ partId, furnitureId }: { partId: PlaygroundPartId; furnitureId: string }) {
  const part = usePlaygroundPart(partId);
  const f = spot(furnitureId);
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.rotY ?? 0, 0]}>
      <mesh geometry={part.base} material={part.material} castShadow receiveShadow />
    </group>
  );
}

/**
 * 盪鞦韆：梯架不動，兩組「繩子＋座椅」繞橫梁擺盪。
 * 擺角直接取自牆上時鐘（swingRideAngle），跟坐在上面的人用的是同一條式子，
 * 所以人和座椅永遠對齊，也不需要為了同步傳任何狀態。
 */
function SwingSet() {
  const part = usePlaygroundPart('swing');
  const f = spot('swing-set');
  const seats = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const a = swingRideAngle(beatNow(PLAYGROUND.swing.bpm));
    for (const g of seats.current) if (g) g.rotation.x = a;
  });
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.rotY ?? 0, 0]}>
      <mesh geometry={part.base} material={part.material} castShadow receiveShadow />
      {part.movers.map((geom, i) => {
        const x = PLAYGROUND.swing.seatX[i];
        const y = PLAYGROUND.swing.pivotY;
        return (
          <group
            key={i}
            ref={(g) => {
              seats.current[i] = g;
            }}
            position={[x, y, 0]}
          >
            {/* 子零件本身仍是設施局部座標，先扣掉支點位移才會繞著橫梁轉 */}
            <mesh geometry={geom} material={part.material} position={[-x, -y, 0]} castShadow />
          </group>
        );
      })}
    </group>
  );
}

/** 蹺蹺板：支點不動，板身與兩端扶手繞支點翹動 */
function Seesaw() {
  const part = usePlaygroundPart('seesaw');
  const f = spot('seesaw');
  const plank = useRef<Group>(null);
  useFrame(() => {
    if (plank.current) plank.current.rotation.z = seesawTilt(beatNow(PLAYGROUND.seesaw.bpm));
  });
  const y = PLAYGROUND.seesaw.pivotY;
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.rotY ?? 0, 0]}>
      <mesh geometry={part.base} material={part.material} castShadow receiveShadow />
      <group ref={plank} position={[0, y, 0]}>
        {part.movers[0] && <mesh geometry={part.movers[0]} material={part.material} position={[0, -y, 0]} castShadow />}
      </group>
    </group>
  );
}

/**
 * 兒童遊戲區：匹克球場正前方（z 8~20）的戶外場地。
 * 設施外觀取自 playground.glb，碰撞盒與座位由 shared 的家具表 / 座位表提供。
 */
export function Playground() {
  const { palette } = useSceneTheme();
  return (
    <group>
      {/* 地台（延續浮島，讓遊戲區不像浮在空中） */}
      <mesh position={[PLAY_CENTER_X, -0.32, PLAY_CENTER_Z]} receiveShadow>
        <boxGeometry args={[PLAY_W + 1.2, 0.6, PLAY_D + 1.2]} />
        <meshStandardMaterial color={palette.base} />
      </mesh>

      {/* 鋪面：外圈跟著場景主題，中間是遊戲區的軟墊草皮 */}
      <mesh position={[PLAY_CENTER_X, 0.006, PLAY_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PLAY_W, PLAY_D]} />
        <meshStandardMaterial color={palette.terrace} />
      </mesh>
      <mesh position={[PLAY_CENTER_X, 0.014, PLAY_CENTER_Z + 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PLAY_W - 2, PLAY_D - 2.8]} />
        <meshStandardMaterial color="#7FA284" />
      </mesh>

      {/* 圍籬三面；靠露台那一側（z = PLAY_MIN_Z）開放通行 */}
      <Fence x={PLAY_MIN_X + 0.1} z={PLAY_CENTER_Z} w={0.06} d={PLAY_D} />
      <Fence x={PLAY_MAX_X - 0.1} z={PLAY_CENTER_Z} w={0.06} d={PLAY_D} />
      <Fence x={PLAY_CENTER_X} z={PLAY_MAX_Z - 0.1} w={PLAY_W} d={0.06} />

      <StaticPart partId="slide" furnitureId="slide-a" />
      <StaticPart partId="slide" furnitureId="slide-b" />
      <StaticPart partId="pond" furnitureId="pond" />
      <StaticPart partId="sandbox" furnitureId="sandbox" />
      <SwingSet />
      <Seesaw />
    </group>
  );
}
