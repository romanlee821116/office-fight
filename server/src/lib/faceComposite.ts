import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATARS, FACE } from '@office/shared';
import { logger } from '../logger';
import { blit, decodePng, encodePng, type Bitmap } from './png';

/**
 * 把玩家上傳的照片合成到角色貼圖的臉那一格，輸出成一張完整的 PNG。
 *
 * 之所以在伺服端做而不是前端 canvas：前端那條路要手動建 texture、自己對齊
 * flipY / colorSpace / filter，環節多而且出錯時只會得到一片黑。合成成 PNG 之後
 * 前端就只是「載入一張貼圖」，跟換服裝走同一條已經驗證過的路徑。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** dev 時讀 client/public，build 後讀 client/dist */
const ROOTS = [path.resolve(__dirname, '../../../client/dist'), path.resolve(__dirname, '../../../client/public')];

const MODELS = new Set(AVATARS.map((a) => a.model));
/** 角色模型引用的貼圖檔名（character-a.glb → texture-a.png） */
const TEXTURES = new Set(AVATARS.map((a) => `${a.model.replace('character-', 'texture-')}.png`));
const atlasCache = new Map<string, Bitmap>();
/** key：`${userId}:${model}:${version}`，換照片或換角色都會產生新的 key */
const composed = new Map<string, Buffer>();
/** 同時在線的人數有限，快取滿了就整個清掉重來，不必做 LRU */
const MAX_CACHE = 200;

/** 白名單比對，擋掉路徑穿越 */
export function isKnownModel(file: string): boolean {
  return MODELS.has(file.replace(/\.glb$/, ''));
}

export function isKnownTexture(file: string): boolean {
  return TEXTURES.has(file);
}

/** 角色模型檔的實體路徑；找不到回 null */
export function modelPath(file: string): string | null {
  for (const root of ROOTS) {
    const full = path.join(root, 'models/characters', file);
    if (existsSync(full)) return full;
  }
  return null;
}

function loadAtlas(texture: string): Bitmap | null {
  const hit = atlasCache.get(texture);
  if (hit) return hit;
  const file = `models/characters/Textures/${texture}`;
  for (const root of ROOTS) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const bitmap = decodePng(readFileSync(full));
    if (!bitmap) {
      logger.error(`角色貼圖解不開：${full}`);
      return null;
    }
    atlasCache.set(texture, bitmap);
    return bitmap;
  }
  logger.error(`找不到角色貼圖：${file}`);
  return null;
}

/** 合成後的 PNG；來源解不開時回 null，呼叫端改用原本的貼圖 */
export function composeFace(userId: string, texture: string, version: number, photo: Buffer): Buffer | null {
  const key = `${userId}:${texture}:${version}`;
  const hit = composed.get(key);
  if (hit) return hit;

  const atlas = loadAtlas(texture);
  const face = decodePng(photo);
  if (!atlas || !face) return null;

  // atlas 要複製一份再畫，不然快取裡那張會被寫髒
  const out: Bitmap = { width: atlas.width, height: atlas.height, data: Buffer.from(atlas.data) };
  blit(out, face, FACE.x, FACE.y, FACE.size, FACE.size);
  const png = encodePng(out);

  if (composed.size >= MAX_CACHE) composed.clear();
  composed.set(key, png);
  return png;
}
