import { createPortal } from '@react-three/fiber';
import type { Object3D } from 'three';
import { getShopItem } from '@office/shared';

/**
 * 裙襬：貼圖做不出「下半身連成一片」的外形，只能靠幾何。
 * 掛在 torso 節點下，跟著上半身一起動（腿的擺動不影響裙子，正好）。
 *
 * 注意單位：torso 節點沒有 scale，局部座標就是公尺級——
 * 軀幹 x ±0.4、y 0.3～1.2，往下推腿的 translation 可知腳底在 y = -0.7。
 * 這跟 head 節點不同，那個自帶 scale 0.1、所以頭寬是 8（見 Crown）。
 * 段數刻意只用 8，帶點稜角才貼 Kenney 的風格。
 */
interface SkirtDef {
  /** 腰際半徑（軀幹半寬是 0.4） */
  top: number;
  /** 裙襬半徑 */
  bottom: number;
  /** 裙長 */
  height: number;
  /** 腰際的 y（torso 局部座標，軀幹底部是 0.3） */
  waistY: number;
  color: string;
  /**
   * 是否連腿一起藏起來。裙子與腿同色時不需要藏：
   * 腿正好填滿裙襬底下，不會看到空洞，走路擺動穿出裙面也是白配白。
   */
  hideLegs?: boolean;
}

const SKIRTS: Record<string, SkirtDef> = {
  // 腰 0.3 往下 0.9 到 y = -0.6，腳底在 -0.7；腿的貼圖也是白的，留著當裙內襯
  'outfit-gown': { top: 0.42, bottom: 0.78, height: 0.9, waistY: 0.3, color: '#FBF7F1' },
};

export function skirtOf(outfitId: string): SkirtDef | null {
  return SKIRTS[outfitId] ?? null;
}

/** 裙襬與腿不同色時才需要藏腿，否則會看到腿從裙子裡穿出去 */
export function hidesLegs(outfitId: string): boolean {
  return skirtOf(outfitId)?.hideLegs === true;
}

export function Skirt({ torso, outfitId }: { torso: Object3D | null; outfitId: string }) {
  const def = skirtOf(outfitId);
  const item = getShopItem(outfitId);
  if (!torso || !def || item?.kind !== 'outfit') return null;

  return createPortal(
    <mesh position={[0, def.waistY - def.height / 2, 0]} castShadow>
      {/* 開口的圓台：上窄下寬，8 段本身就夠稜角，不需要 flatShading */}
      <cylinderGeometry args={[def.top, def.bottom, def.height, 8, 1, true]} />
      {/*
        單面渲染：腿留著當內襯，看不到裙子內壁。
        不用 DoubleSide + flatShading——背面法線要靠 gl_FrontFacing 翻轉，
        而 flat shading 用螢幕空間導數推法線，兩者搭在一起會整片吃不到光。
        再給一點 emissive 保底，婚紗在背光角度也不該變灰。
      */}
      <meshStandardMaterial color={def.color} emissive={def.color} emissiveIntensity={0.25} roughness={0.85} metalness={0} />
    </mesh>,
    torso,
  );
}
