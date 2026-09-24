import { DoubleSide } from 'three';
import { PICKUPS, getWeapon } from '@office/shared';

/**
 * 射擊輔助線：把伺服端的命中判定直接畫在地上。
 *
 * 投射武器的判定是「沿著面向拉一條走廊，半寬 PICKUPS.corridorHalfWidth，
 * 長度到武器射程」，走廊內最近的目標就會被打中。這裡照同一組數字畫，
 * 所以看到的範圍就是真的會打中的範圍，不是示意圖。
 *
 * 掛在角色的 group 底下，跟著 rotY 轉；角色朝向 +Z，走廊往 +Z 延伸。
 */
export function AimGuide({ weaponId }: { weaponId: string }) {
  const weapon = getWeapon(weaponId);
  // 近戰是扇形判定，跟走廊不同，畫出來反而誤導
  if (!weapon || (weapon.kind !== 'shoot' && weapon.kind !== 'throw')) return null;

  const range = weapon.range;
  const halfWidth = PICKUPS.corridorHalfWidth;

  return (
    <group position={[0, 0.02, range / 2]}>
      {/* 命中走廊 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[halfWidth * 2, range]} />
        <meshBasicMaterial color="#ff8a5c" transparent opacity={0.07} depthWrite={false} side={DoubleSide} />
      </mesh>
      {/* 中線：實際的彈道 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[0.06, range]} />
        <meshBasicMaterial color="#ff6b3d" transparent opacity={0.55} depthWrite={false} side={DoubleSide} />
      </mesh>
      {/* 射程盡頭的橫槓，標出打不到的界線 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, range / 2 - 0.04]}>
        <planeGeometry args={[halfWidth * 2, 0.08]} />
        <meshBasicMaterial color="#ff6b3d" transparent opacity={0.45} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
