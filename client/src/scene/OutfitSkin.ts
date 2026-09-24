import { useEffect, useState } from 'react';
import { Mesh, TextureLoader, type Material, type MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { SHOP_ITEMS, getShopItem } from '@office/shared';
import { hidesLegs } from './Skirt';

function outfitTextureUrl(asset: string): string {
  return `/models/characters/Textures/${asset}.png?v=${__ASSET_VERSION__}`;
}

const loader = new TextureLoader();
const cache = new Map<string, Texture>();

function load(asset: string): Promise<Texture> {
  const hit = cache.get(asset);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    loader.load(
      outfitTextureUrl(asset),
      (texture) => {
        cache.set(asset, texture);
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

/** 已經對齊過取樣參數的貼圖，不重複上傳 */
const aligned = new WeakSet<Texture>();

/**
 * TextureLoader 的預設值跟 GLTFLoader 不同：前者會產生 mipmap 且用
 * LinearMipmapLinear，後者依模型的 sampler 設定（Kenney 這組是 LINEAR、無 mipmap）。
 * 差異的後果是角色縮小時整張 1024 atlas 被平均掉，五官糊成一片。
 *
 * 與其硬編這些值，直接抄角色原本那張貼圖的全部取樣參數
 * （含 KHR_texture_transform 換算出的 offset / repeat / rotation），保證一致。
 */
function alignTo(texture: Texture, original: Texture): void {
  if (aligned.has(texture)) return;
  texture.minFilter = original.minFilter;
  texture.magFilter = original.magFilter;
  texture.generateMipmaps = original.generateMipmaps;
  texture.wrapS = original.wrapS;
  texture.wrapT = original.wrapT;
  texture.colorSpace = original.colorSpace;
  texture.flipY = original.flipY;
  texture.offset.copy(original.offset);
  texture.repeat.copy(original.repeat);
  texture.center.copy(original.center);
  texture.rotation = original.rotation;
  texture.anisotropy = original.anisotropy;
  texture.needsUpdate = true;
  aligned.add(texture);
}

/**
 * 不換貼圖的 mesh：頭部留給角色自己。
 * 換整張 atlas 等於換成另一個角色，臉和髮型都會跟著變，那就不是「換衣服」了。
 */
const KEEP_OWN_SKIN = new Set(['head']);

/** 有裙襬的服裝要藏起來的部位 */
const LEGS = ['leg-left', 'leg-right'];

/** 服裝貼圖不多也不大，先全部備好，換裝時就不會有一格空白 */
export function preloadOutfits(): void {
  for (const item of SHOP_ITEMS) {
    if (item.kind === 'outfit') void load(item.asset).catch(() => {});
  }
}

/**
 * 換裝：把角色所有 mesh 的貼圖換成指定服裝，脫下時還原。
 * 18 個角色的 UV 逐頂點相同、貼圖 atlas 佈局也一致，所以任何貼圖都能套到任何角色身上。
 *
 * 兩個不能改的地方：
 * 1. 不是用 Suspense 載貼圖。會 suspend 的元件掛在 CharacterModel 裡，
 *    角色一 mount 就帶著服裝時（例如商店的試穿預覽）動畫不會被套上，人會散成 T-pose。
 * 2. 不是用「重建 instance」來換材質。那會讓 useAnimations 的 mixer continue 綁在舊物件上，
 *    同樣沒有動畫驅動。
 *
 * 材質在這裡 clone 成該角色專屬的，Avatar 共用的 litCache 材質不會被改到
 * （否則同角色的其他玩家會一起換裝）。
 */
export function useOutfit(instance: Object3D, outfitId: string): void {
  const item = getShopItem(outfitId);
  const asset = item?.kind === 'outfit' ? item.asset : '';
  const [texture, setTexture] = useState<Texture | null>(() => (asset ? (cache.get(asset) ?? null) : null));

  useEffect(() => {
    if (!asset) {
      setTexture(null);
      return;
    }
    let alive = true;
    void load(asset)
      .then((t) => alive && setTexture(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset]);

  // 穿裙子時把腿藏起來，否則會從裙襬裡穿出去
  useEffect(() => {
    const hide = hidesLegs(outfitId);
    const changed: Mesh[] = [];
    for (const name of LEGS) {
      const leg = instance.getObjectByName(name);
      if (leg instanceof Mesh && leg.visible === hide) {
        leg.visible = !hide;
        changed.push(leg);
      }
    }
    return () => {
      for (const leg of changed) leg.visible = true;
    };
  }, [instance, outfitId]);

  useEffect(() => {
    if (!asset || !texture) return;
    const restore: [Mesh, Material | Material[]][] = [];
    instance.traverse((obj) => {
      if (!(obj instanceof Mesh) || Array.isArray(obj.material)) return;
      if (KEEP_OWN_SKIN.has(obj.name)) return;
      const current = obj.material as MeshStandardMaterial;
      if (current.map) alignTo(texture, current.map);
      restore.push([obj, obj.material]);
      const own = current.clone();
      own.map = texture;
      own.needsUpdate = true;
      obj.material = own;
    });
    return () => {
      for (const [mesh, original] of restore) {
        const swapped = mesh.material as MeshStandardMaterial;
        mesh.material = original;
        swapped.dispose();
      }
    };
  }, [instance, texture, asset]);
}
