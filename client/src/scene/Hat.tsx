import type { Object3D } from 'three';
import { SHOP_ITEMS, getShopItem } from '@office/shared';
import { HeadProp, preloadHeadProp } from './HeadProp';

export function hatUrl(asset: string): string {
  return `/models/${asset}.glb?v=${__ASSET_VERSION__}`;
}

SHOP_ITEMS.filter((item) => item.kind === 'hat').forEach((item) => preloadHeadProp(hatUrl(item.asset)));

/** 買來的頭飾；fit 沒設定時退回皇冠那組基準 */
export function Hat({ head, hatId }: { head: Object3D | null; hatId: string }) {
  const item = getShopItem(hatId);
  if (!item || item.kind !== 'hat') return null;
  const fit = item.fit ?? { width: 8.8, baseY: 7.2 };
  return <HeadProp head={head} url={hatUrl(item.asset)} width={fit.width} baseY={fit.baseY} />;
}
