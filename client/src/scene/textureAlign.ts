import type { Texture } from 'three';

/** 已經對齊過取樣參數的貼圖，不重複上傳 */
const aligned = new WeakSet<Texture>();

/**
 * 把自己載入／合成的貼圖，對齊模型原本那張貼圖的全部取樣參數。
 *
 * TextureLoader 的預設值跟 GLTFLoader 不同：前者會產生 mipmap 且用
 * LinearMipmapLinear，後者依模型的 sampler 設定（Kenney 這組是 LINEAR、無 mipmap）。
 * 差異的後果是角色縮小時整張 1024 atlas 被平均掉，五官糊成一片。
 *
 * 與其一項一項硬編，直接整組抄過來——包含 KHR_texture_transform 換算出的
 * offset / repeat / rotation，那是手動設定最容易漏掉的部分。
 */
export function alignTo(texture: Texture, original: Texture): void {
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
