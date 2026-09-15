import { Suspense, useEffect } from 'react';
import { PropGroupMesh, releaseScenery } from './Scenery';
import { useSceneTheme } from './SceneTheme';
import { GROUND_Y } from './themes/layout';
import { landmarkParts, type PartBuilder } from './themes/parts';

/** 合批後的地標：一種顏色一個 draw call */
function Landmarks({ build }: { build: () => PartBuilder }) {
  const parts = landmarkParts(build);
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} frustumCulled={false}>
          <meshStandardMaterial
            color={p.color}
            roughness={0.9}
            emissive={p.glow > 0 ? p.color : '#000000'}
            emissiveIntensity={p.glow}
          />
        </mesh>
      ))}
    </>
  );
}

/** 新主題掛載完成後，釋放其他主題佔用的 GPU 資源 */
function ReleaseOthers({ themeId }: { themeId: string }) {
  useEffect(() => {
    releaseScenery(themeId);
  }, [themeId]);
  return null;
}

/** 島外的主題背景：地面、合批模型、自製地標。'office' 主題只有原本的空景 */
export function Backdrop() {
  const theme = useSceneTheme();
  return (
    <group>
      {theme.id !== 'office' && (
        <mesh position={[14.5, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[420, 420]} />
          <meshStandardMaterial color={theme.palette.ground} />
        </mesh>
      )}
      {theme.landmarks && <Landmarks build={theme.landmarks} />}
      {/* Suspense 邊界固定不動，主題切換才會被 transition 視為「同一個邊界的更新」而保留舊內容 */}
      <Suspense fallback={null}>
        {theme.props.map((g) => (
          <PropGroupMesh key={`${theme.id}|${g.key}`} group={g} />
        ))}
        <ReleaseOthers themeId={theme.id} />
      </Suspense>
    </group>
  );
}
