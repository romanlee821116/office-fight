import { SNOWFIGHT, SNOW_PILES } from '@office/shared';

/**
 * 雪球。Kenney Holiday Kit 裡沒有雪球模型，所以用程式生成：
 * 低面數的二十面體配上 flatShading，剛好是「手捏出來的雪團」那種塊面感。
 */
export function SnowballMesh({ radius = 0.1 }: { radius?: number }) {
  return (
    <mesh castShadow>
      <icosahedronGeometry args={[radius, 1]} />
      <meshStandardMaterial color="#F7FBFF" roughness={0.8} metalness={0} flatShading />
    </mesh>
  );
}

/** 凹槽裡那三顆雪球的大小（比手上的雪球大一點，遠遠才看得出來是雪球堆） */
const BALL_RADIUS = 0.1;
const BALL_SCALE = 1.1;

/** 一堆雪旁邊挖出來的凹槽：淺色的坑 + 地上三顆現成的雪球（純視覺，補彈判定在伺服端） */
function SnowStash({ x, z }: { x: number; z: number }) {
  // 挖在雪堆的南側（+Z），角色走過來剛好站在坑和雪堆中間
  const cz = z + 0.9;
  return (
    <group position={[x, 0, cz]}>
      {/* 凹槽：比雪地暗一階的圓坑，外圈一道被撥開的雪 */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[SNOWFIGHT.pileRange * 0.45, 24]} />
        <meshStandardMaterial color="#C7D5E2" />
      </mesh>
      <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[SNOWFIGHT.pileRange * 0.45, SNOWFIGHT.pileRange * 0.55, 24]} />
        <meshStandardMaterial color="#FBFDFF" />
      </mesh>
      {/* 坑裡已經捏好的三顆雪球，平放在地上排成一個小三角。純粹是「這裡有雪球可以撿」的招牌，
          數量不跟著 SNOWFIGHT.maxBalls 走——擺滿五顆會蓋掉整個凹槽 */}
      {(
        [
          [-0.2, -0.12],
          [0.2, -0.12],
          [0, 0.22],
        ] as const
      ).map(([bx, bz]) => (
        <group key={`${bx},${bz}`} position={[bx, BALL_RADIUS * BALL_SCALE, bz]} scale={BALL_SCALE}>
          <SnowballMesh radius={BALL_RADIUS} />
        </group>
      ))}
    </group>
  );
}

/** 場地四個補彈點的凹槽（雪堆本身是 christmasTownModel 的 snow-pile 裝飾） */
export function SnowStashes() {
  return (
    <>
      {SNOW_PILES.map((pile) => (
        <SnowStash key={`${pile.x},${pile.z}`} x={pile.x} z={pile.z} />
      ))}
    </>
  );
}
