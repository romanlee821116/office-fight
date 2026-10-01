import { FACE, getAvatar } from '@office/shared';

/**
 * 牌桌上的頭像。
 *
 * 真人上傳過照片就直接用那張；否則從角色貼圖裡裁出臉那一格——
 * 角色的頭是立方體，臉只佔 1024×1024 atlas 上 FACE 定義的那塊，
 * 跟「上傳照片當臉」用的是同一組座標。
 *
 * 注意 player.faceUrl 不是圖片網址，是一個基底路徑（底下還掛著換好臉的模型），
 * 原始照片要再接 /photo.png 才拿得到。
 */
export function PokerSeatAvatar({ avatarId, faceUrl, size = 44 }: { avatarId: string; faceUrl?: string; size?: number }) {
  if (faceUrl) {
    return <img src={`${faceUrl}/photo.png`} alt="" className="object-cover" style={{ width: size, height: size }} />;
  }
  const avatar = getAvatar(avatarId);
  // 把 atlas 放大到「臉那一格剛好等於頭像尺寸」，再把該格平移到左上角
  const scale = size / FACE.size;
  return (
    <div
      className="bg-no-repeat"
      style={{
        width: size,
        height: size,
        backgroundColor: avatar.color,
        backgroundImage: `url(/models/characters/Textures/texture-${avatar.model.replace('character-', '')}.png?v=${__ASSET_VERSION__})`,
        backgroundSize: `${1024 * scale}px ${1024 * scale}px`,
        backgroundPosition: `-${FACE.x * scale}px -${FACE.y * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
