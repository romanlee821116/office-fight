import type { Object3D } from 'three';
import { HeadProp, preloadHeadProp } from './HeadProp';

const CROWN_URL = `/models/props/crown.glb?v=${__ASSET_VERSION__}`;
preloadHeadProp(CROWN_URL);

/** 皇冠比頭略寬一點，底部往下埋一點才像扣在頭上 */
const CROWN_WIDTH = 8.8;
const CROWN_BASE_Y = 7.2;

/** 打倒過丁oe的人頭上的皇冠：跟著頭的動畫一起動 */
export function Crown({ head }: { head: Object3D | null }) {
  return <HeadProp head={head} url={CROWN_URL} width={CROWN_WIDTH} baseY={CROWN_BASE_Y} />;
}
