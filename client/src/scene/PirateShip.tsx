import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { SHIP, shipAngle } from '@office/shared';
import { KitModel } from './KitModel';

const FRAME_COLOR = '#B8502E';
const BEAM_COLOR = '#6E7A86';
/** 吊桿掛在船兩側，略小於船半寬 2.04 */
const HANGER_Z = 2;

/** A 字架的一支腳：底在 ±frameSpread，頂端收到支點正下方 */
function Leg({ side, z }: { side: 1 | -1; z: number }) {
  const len = Math.hypot(SHIP.frameSpread, SHIP.pivotY);
  const tilt = Math.atan2(SHIP.frameSpread, SHIP.pivotY);
  return (
    <group position={[(side * SHIP.frameSpread) / 2, SHIP.pivotY / 2, z]} rotation={[0, 0, side * tilt]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.24, len, 0.24]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
    </group>
  );
}

/**
 * 海盜船：船身是 pirate kit 的 ship-pirate-small，A 字架與吊桿是程式生成的
 * （套件沒有擺盪機構的零件，而且架子高度要跟擺臂精準對齊）。
 *
 * 擺角取自 shipAngle(Date.now())，跟 rideSeatAt 是同一條式子，
 * 所以船與坐在上面的人永遠對齊，也不需要為了同步傳任何狀態。
 */
export function PirateShip() {
  const swing = useRef<Group>(null);

  useFrame(() => {
    // 繞 Z 轉：正角度時船往 +X 盪（與 rideSeatAt 的座位公式同一個慣例）
    if (swing.current) swing.current.rotation.z = shipAngle(Date.now());
  });

  return (
    <group position={[SHIP.x, 0, SHIP.z]}>
      {/* 兩組 A 字架與頂端橫梁（不動） */}
      {[-1, 1].map((zs) => (
        <group key={zs}>
          <Leg side={1} z={zs * SHIP.frameZ} />
          <Leg side={-1} z={zs * SHIP.frameZ} />
        </group>
      ))}
      <mesh position={[0, SHIP.pivotY, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, SHIP.frameZ * 2 + 0.5]} />
        <meshStandardMaterial color={BEAM_COLOR} />
      </mesh>

      {/* 擺盪的部分：吊桿與船身一起繞支點轉 */}
      <group position={[0, SHIP.pivotY, 0]}>
        <group ref={swing}>
          {[-HANGER_Z, HANGER_Z].map((hz) => (
            <mesh key={hz} position={[0, -SHIP.arm / 2, hz]} castShadow>
              <boxGeometry args={[0.16, SHIP.arm, 0.16]} />
              <meshStandardMaterial color={BEAM_COLOR} />
            </mesh>
          ))}
          {/* 船身長軸原本沿 Z，轉 90° 對到世界 X 的擺盪方向 */}
          <group position={[0, -SHIP.arm, 0]}>
            <KitModel model="park/pirate/ship-pirate-small" rotY={Math.PI / 2} scale={SHIP.scale} />
          </group>
        </group>
      </group>
    </group>
  );
}
