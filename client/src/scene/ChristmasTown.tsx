import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import {
  SNOWFIGHT,
  SNOW_TEAM_COLOR,
  SNOW_CENTER_X,
  SNOW_CENTER_Z,
  SNOW_GATE_W,
  SNOW_GATE_X,
  SNOW_MAX_X,
  SNOW_MAX_Z,
  SNOW_MIN_X,
  SNOW_MIN_Z,
  XMAS_CENTER_X,
  XMAS_CENTER_Z,
  XMAS_MAX_X,
  XMAS_MAX_Z,
  XMAS_MIN_X,
  XMAS_MIN_Z,
} from '@office/shared';
import { HOLIDAY_PIECES, TREE_SQUARE } from './christmasTownModel';
import { HolidayProps } from './HolidayKit';
import { KitModel } from './KitModel';
import { Fence } from './PickleCourt';
import { SnowStashes } from './Snowball';

const XMAS_W = XMAS_MAX_X - XMAS_MIN_X;
const XMAS_D = XMAS_MAX_Z - XMAS_MIN_Z;
const SNOW_W = SNOW_MAX_X - SNOW_MIN_X;
const SNOW_D = SNOW_MAX_Z - SNOW_MIN_Z;

/** 雪地：踩過的地方偏灰，沒踩過的地方是乾淨的白 */
const SNOW = '#EDF2F7';
const SNOW_PACKED = '#DCE4EC';

const GATE_MIN = SNOW_GATE_X - SNOW_GATE_W / 2;
const GATE_MAX = SNOW_GATE_X + SNOW_GATE_W / 2;

/** 一塊場地的雪地鋪面（底下的地台是整個世界共用的 WorldBase） */
function Ground({ cx, cz, w, d, color }: { cx: number; cz: number; w: number; d: number; color: string }) {
  return (
    <mesh position={[cx, 0.006, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * 大聖誕樹腳下繞圈的玩具小火車。軌道是程式生成的（kit 的彎軌是 90° 轉角零件，
 * 繞不出這個半徑的圓），車廂用 kit 的模型掛在軌道上，角度取自 Date.now()，
 * 和旋轉木馬同一條時間軸，所以每個人看到的位置一致，也不必為它同步任何狀態。
 */
const TRAIN_RADIUS = 1.9;
const TRAIN_SEC = 14;
/**
 * 車廂的長度（公尺，模型 ×2）。間距由「前後兩節的一半長度加上掛鉤的空隙」換算成弧度，
 * 不然車廂會互相穿插——0.42 弧度在半徑 1.9 上只有 0.8m，比一節車廂還短。
 */
const CAR_GAP = 0.25;
const TRAIN_CARS = [
  { model: 'train-locomotive', len: 1.34 },
  { model: 'train-wagon', len: 1.44 },
  { model: 'train-wagon-logs', len: 1.38 },
].reduce<{ model: string; at: number }[]>((acc, car, i, all) => {
  const prev = acc[i - 1];
  const at = prev ? prev.at + (all[i - 1].len / 2 + car.len / 2 + CAR_GAP) / TRAIN_RADIUS : 0;
  acc.push({ model: car.model, at });
  return acc;
}, []);

function ToyTrain() {
  const ring = useRef<Group>(null);
  useFrame(() => {
    if (ring.current) ring.current.rotation.y = -((Date.now() / 1000 / TRAIN_SEC) % 1) * Math.PI * 2;
  });
  return (
    <group position={[TREE_SQUARE.x, 0, TREE_SQUARE.z]}>
      {/* 軌道：兩條鋼軌 + 中間的枕木環 */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[TRAIN_RADIUS - 0.22, TRAIN_RADIUS + 0.22, 48]} />
        <meshStandardMaterial color="#8A7A6A" />
      </mesh>
      {[TRAIN_RADIUS - 0.16, TRAIN_RADIUS + 0.16].map((r) => (
        <mesh key={r} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.035, 6, 48]} />
          <meshStandardMaterial color="#6E7681" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <group ref={ring}>
        {TRAIN_CARS.map((car) => (
          <group key={car.model} rotation={[0, car.at, 0]}>
            {/* 車身的長軸就是模型的 X 軸，(0, R) 這一點的切線也是 X；
                轉盤往負角度轉、也就是往 -X 走，所以車頭要轉 180° 才是朝著前進方向 */}
            <KitModel model={`holiday/${car.model}`} position={[0, 0.1, TRAIN_RADIUS]} rotY={Math.PI} scale={2} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** 雪仗報名點：地上的隊伍色圈（緩慢旋轉）＋一根插著的旗子，遠遠就看得到 */
function TeamSlot({ x, z, color }: { x: number; z: number; color: string }) {
  const ring = useRef<Group>(null);
  useFrame((state) => {
    if (ring.current) ring.current.rotation.z = state.clock.elapsedTime * 0.6;
  });
  return (
    <group position={[x, 0, z]}>
      <group position={[0, 0.034, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={ring}>
          <mesh>
            <ringGeometry args={[0.52, 0.66, 5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <mesh>
          <circleGeometry args={[0.44, 24]} />
          <meshStandardMaterial color={color} transparent opacity={0.35} />
        </mesh>
      </group>
      {/* 旗桿與三角旗 */}
      <mesh position={[0.5, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.6, 8]} />
        <meshStandardMaterial color="#8A7A6A" />
      </mesh>
      <mesh position={[0.78, 1.42, 0]} castShadow>
        <boxGeometry args={[0.56, 0.34, 0.03]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

/**
 * 聖誕小鎮（辦公室正前方 z 8~20）與打雪仗場地（再往 +Z，z 20~40）。
 * 補上這兩塊之後整個世界外框就是長方形，不再有走不到的空區。
 *
 * 木屋與佈景用 Kenney Holiday Kit（CC0），零件表在 christmasTown.ts；
 * 碰撞盒與「哪棵樹站在哪」在 shared 的家具表，兩邊讀同一份。
 */
export function ChristmasTown() {
  return (
    <group>
      <Ground cx={XMAS_CENTER_X} cz={XMAS_CENTER_Z} w={XMAS_W} d={XMAS_D} color={SNOW_PACKED} />
      <Ground cx={SNOW_CENTER_X} cz={SNOW_CENTER_Z} w={SNOW_W} d={SNOW_D} color={SNOW} />

      {/* 小鎮：西側圍籬（北側是辦公室門口開放通行，東側共用兒童遊戲區那道） */}
      <Fence x={XMAS_MIN_X + 0.1} z={XMAS_CENTER_Z} w={0.06} d={XMAS_D} />
      {/* 南側：小鎮與雪仗場地之間留一個缺口，東半段是遊樂園的北圍籬（Park 已經畫了） */}
      <Fence x={(XMAS_MIN_X + GATE_MIN) / 2} z={XMAS_MAX_Z} w={GATE_MIN - XMAS_MIN_X} d={0.06} />
      <Fence x={(GATE_MAX + SNOW_MAX_X) / 2} z={XMAS_MAX_Z} w={SNOW_MAX_X - GATE_MAX} d={0.06} />

      {/* 雪仗場地：其餘三面圍起來（東側緊鄰遊樂園的西圍籬） */}
      <Fence x={SNOW_MIN_X + 0.1} z={SNOW_CENTER_Z} w={0.06} d={SNOW_D} />
      <Fence x={SNOW_CENTER_X} z={SNOW_MAX_Z - 0.1} w={SNOW_W} d={0.06} />

      {/* 中線：兩隊各守一半 */}
      <mesh position={[SNOW_CENTER_X, 0.014, SNOW_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SNOW_W - 1.5, 0.16]} />
        <meshStandardMaterial color="#9FB6CC" />
      </mesh>

      {/* 兩隊的報名點：站上去按 E 加入 */}
      <TeamSlot x={SNOWFIGHT.slotRed.x} z={SNOWFIGHT.slotRed.z} color={SNOW_TEAM_COLOR.red} />
      <TeamSlot x={SNOWFIGHT.slotBlue.x} z={SNOWFIGHT.slotBlue.z} color={SNOW_TEAM_COLOR.blue} />
      {/* 四個補彈用的雪球凹槽 */}
      <SnowStashes />

      <ToyTrain />
      <HolidayProps pieces={HOLIDAY_PIECES} />
    </group>
  );
}
