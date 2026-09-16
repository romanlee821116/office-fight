import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from '@office/shared';
import { useSceneTheme } from './SceneTheme';

/** 地台往外多出來的裙邊，讓整塊地看起來像一片浮島而不是一張薄紙 */
const SKIRT = 0.6;
const THICKNESS = 0.6;

/**
 * 整個世界共用的地台。
 *
 * 原本辦公室、兒童遊戲區、遊樂園、聖誕小鎮各畫一塊自己的地台，每塊都往外多 0.6m 裙邊，
 * 相鄰的兩塊就會有一條 1.2m 寬的重疊帶——上下面完全共面，交界處整條都在 z-fighting。
 * 世界外框補成長方形之後，直接用一塊蓋住全部，接縫就不存在了。
 */
export function WorldBase() {
  const { palette } = useSceneTheme();
  return (
    <mesh position={[(WORLD_MIN_X + WORLD_MAX_X) / 2, -THICKNESS / 2 - 0.02, (WORLD_MIN_Z + WORLD_MAX_Z) / 2]} receiveShadow>
      <boxGeometry args={[WORLD_MAX_X - WORLD_MIN_X + SKIRT * 2, THICKNESS, WORLD_MAX_Z - WORLD_MIN_Z + SKIRT * 2]} />
      <meshStandardMaterial color={palette.base} />
    </mesh>
  );
}
