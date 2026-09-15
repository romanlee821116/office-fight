import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { COURT, INDOOR_MAX_X, ROOM_MAX_X, ROOM_MAX_Z, ROOM_MIN_Z } from '@office/shared';
import { courtBall } from './runtime';
import { useSceneTheme } from './SceneTheme';

const TERRACE_W = ROOM_MAX_X - INDOOR_MAX_X;
const TERRACE_CX = (INDOOR_MAX_X + ROOM_MAX_X) / 2;
const NET_HALF = 3.35;

/** 白色界線（貼在球場上方一點避免 z-fighting） */
function Line({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.032, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#F5F5F0" />
    </mesh>
  );
}

/** 木圍籬（純視覺，世界邊界本身就會擋人） */
function Fence({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const posts: [number, number][] = [];
  const along = w > d ? 'x' : 'z';
  const len = Math.max(w, d);
  const count = Math.round(len / 2);
  for (let i = 0; i <= count; i++) {
    const t = -len / 2 + (len / count) * i;
    posts.push(along === 'x' ? [x + t, z] : [x, z + t]);
  }
  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.45, pz]} castShadow>
          <boxGeometry args={[0.09, 0.9, 0.09]} />
          <meshStandardMaterial color="#8A7A6A" />
        </mesh>
      ))}
      {[0.35, 0.75].map((y) => (
        <mesh key={y} position={[x, y, z]}>
          <boxGeometry args={[along === 'x' ? w : 0.06, 0.07, along === 'x' ? 0.06 : d]} />
          <meshStandardMaterial color="#A08D77" />
        </mesh>
      ))}
    </group>
  );
}

/** 落點提示：白色虛線圈（12 段短線組成，緩慢旋轉） */
function LandingMarker({ markerRef }: { markerRef: React.RefObject<Group | null> }) {
  const dashes = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  return (
    <group ref={markerRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      {dashes.map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0]} rotation={[0, 0, a + Math.PI / 2]}>
          <planeGeometry args={[0.16, 0.05]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** 飛行中的匹克球：主飛行＋落地反彈（第二次觸地才消失），並帶落點虛線提示 */
function CourtBall() {
  const mesh = useRef<Mesh>(null);
  const marker = useRef<Group>(null);
  useFrame((state, dt) => {
    const m = mesh.current;
    const mk = marker.current;
    if (!m || !mk) return;
    const b = courtBall.flight;
    if (!b) {
      m.visible = false;
      mk.visible = false;
      return;
    }
    const now = performance.now();
    const t = now - b.startAt;
    const total = b.durationMs + b.bounceMs;
    if (t >= total + 200) {
      courtBall.flight = null;
      m.visible = false;
      mk.visible = false;
      return;
    }
    m.visible = true;
    if (t <= b.durationMs) {
      // 主飛行
      const p = Math.max(0, t / b.durationMs);
      m.position.set(
        b.fromX + (b.toX - b.fromX) * p,
        0.12 + Math.sin(Math.PI * p) * b.arcH,
        b.fromZ + (b.toZ - b.fromZ) * p,
      );
      // 落點提示在第一落點
      mk.visible = true;
      mk.position.set(b.toX, 0.04, b.toZ);
    } else {
      // 反彈段：較矮的小拋物線，第二次觸地後靜止一下消失
      const pb = Math.min(1, (t - b.durationMs) / b.bounceMs);
      m.position.set(
        b.toX + (b.bounceToX - b.toX) * pb,
        0.12 + Math.sin(Math.PI * pb) * b.bounceArcH,
        b.toZ + (b.bounceToZ - b.toZ) * pb,
      );
      mk.visible = pb < 1;
      mk.position.set(b.bounceToX, 0.04, b.bounceToZ);
    }
    mk.rotation.z += dt * 1.6;
    void state;
  });
  return (
    <>
      <mesh ref={mesh} visible={false} castShadow>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial color="#E8F04A" emissive="#B8C020" emissiveIntensity={0.35} />
      </mesh>
      <LandingMarker markerRef={marker} />
    </>
  );
}

/** 報名點：地上的色圈 */
function Slot({ x, z, color }: { x: number; z: number; color: string }) {
  const ring = useRef<Group>(null);
  useFrame((state) => {
    if (ring.current) ring.current.rotation.z = state.clock.elapsedTime * 0.6;
  });
  return (
    <group position={[x, 0.033, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={ring}>
        <mesh>
          <ringGeometry args={[0.5, 0.62, 5]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      <mesh>
        <circleGeometry args={[0.42, 24]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/** 戶外露台與匹克球場：混凝土地、圍籬、球場漆線、球網、報名點、飛行球 */
export function PickleCourt() {
  const { palette } = useSceneTheme();
  return (
    <group>
      {/* 露台地面（顏色跟著場景主題） */}
      <mesh position={[TERRACE_CX, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[TERRACE_W, ROOM_MAX_Z - ROOM_MIN_Z]} />
        <meshStandardMaterial color={palette.terrace} />
      </mesh>

      {/* 圍籬：後、右、前三側（與健身房相接的一側是玻璃隔間） */}
      <Fence x={TERRACE_CX} z={ROOM_MIN_Z + 0.1} w={TERRACE_W} d={0.06} />
      <Fence x={ROOM_MAX_X - 0.1} z={0} w={0.06} d={ROOM_MAX_Z - ROOM_MIN_Z} />
      <Fence x={TERRACE_CX} z={ROOM_MAX_Z - 0.1} w={TERRACE_W} d={0.06} />

      {/* 球場：外圈綠色緩衝區 + 藍色場地 + 廚房區淺藍 */}
      <mesh position={[(COURT.minX + COURT.maxX) / 2, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[COURT.maxX - COURT.minX + 2.4, COURT.maxZ - COURT.minZ + 2.2]} />
        <meshStandardMaterial color="#7FA284" />
      </mesh>
      <mesh position={[(COURT.minX + COURT.maxX) / 2, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[COURT.maxX - COURT.minX, COURT.maxZ - COURT.minZ]} />
        <meshStandardMaterial color="#4A7BA6" />
      </mesh>
      {/* 廚房區（網前 2.13m），純裝飾 */}
      <mesh position={[COURT.netX, 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.26, COURT.maxZ - COURT.minZ]} />
        <meshStandardMaterial color="#6E9CC4" />
      </mesh>

      {/* 界線：外框、廚房線、中線（發球區） */}
      <Line x={(COURT.minX + COURT.maxX) / 2} z={COURT.minZ} w={COURT.maxX - COURT.minX} d={0.06} />
      <Line x={(COURT.minX + COURT.maxX) / 2} z={COURT.maxZ} w={COURT.maxX - COURT.minX} d={0.06} />
      <Line x={COURT.minX} z={0} w={0.06} d={COURT.maxZ - COURT.minZ} />
      <Line x={COURT.maxX} z={0} w={0.06} d={COURT.maxZ - COURT.minZ} />
      <Line x={COURT.netX - 2.13} z={0} w={0.06} d={COURT.maxZ - COURT.minZ} />
      <Line x={COURT.netX + 2.13} z={0} w={0.06} d={COURT.maxZ - COURT.minZ} />
      <Line x={(COURT.minX + COURT.netX - 2.13) / 2} z={0} w={COURT.netX - 2.13 - COURT.minX} d={0.06} />
      <Line x={(COURT.netX + 2.13 + COURT.maxX) / 2} z={0} w={COURT.maxX - COURT.netX - 2.13} d={0.06} />

      {/* 球網：柱、網面、白色上緣（碰撞由家具表的 pickle-net 提供） */}
      {[-NET_HALF, NET_HALF].map((z) => (
        <mesh key={z} position={[COURT.netX, 0.46, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.95, 10]} />
          <meshStandardMaterial color="#3E4A59" />
        </mesh>
      ))}
      <mesh position={[COURT.netX, COURT.netHeight / 2, 0]}>
        <boxGeometry args={[0.03, COURT.netHeight - 0.06, NET_HALF * 2]} />
        <meshStandardMaterial color="#2B3440" transparent opacity={0.45} />
      </mesh>
      <mesh position={[COURT.netX, COURT.netHeight - 0.02, 0]} castShadow>
        <boxGeometry args={[0.05, 0.07, NET_HALF * 2]} />
        <meshStandardMaterial color="#F5F5F0" />
      </mesh>

      <Slot x={COURT.slotA.x} z={COURT.slotA.z} color="#4A7BA6" />
      <Slot x={COURT.slotB.x} z={COURT.slotB.z} color="#C94C4C" />
      <CourtBall />
    </group>
  );
}
