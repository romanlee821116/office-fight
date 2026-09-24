import { FACE } from '@office/shared';
import { pool } from './pool';

export interface FaceRow {
  image: Buffer;
  mime: string;
  updatedAt: Date;
}

/** 只認這兩種格式，用檔頭的 magic bytes 判斷，不信任前端送來的 mime */
function sniff(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/**
 * 從 data URL 取出圖片位元組。
 * 大小與格式都在這裡擋掉：前端已經縮過圖，正常情況只有幾 KB，
 * 超過 FACE.maxBytes 的一律拒絕，資料庫不會被塞進大檔。
 */
export function parseDataUrl(dataUrl: unknown): { image: Buffer; mime: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.startsWith('data:image/')) return null;
  let image: Buffer;
  try {
    image = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch {
    return null;
  }
  if (image.length === 0 || image.length > FACE.maxBytes) return null;
  const mime = sniff(image);
  return mime ? { image, mime } : null;
}

export async function saveFace(userId: string, image: Buffer, mime: string): Promise<Date | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ updated_at: Date }>(
    `INSERT INTO user_faces (user_id, image, mime, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET image = EXCLUDED.image, mime = EXCLUDED.mime, updated_at = now()
     RETURNING updated_at`,
    [userId, image, mime],
  );
  return rows[0]?.updated_at ?? null;
}

export async function loadFace(userId: string): Promise<FaceRow | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ image: Buffer; mime: string; updated_at: Date }>(
    'SELECT image, mime, updated_at FROM user_faces WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  return row ? { image: row.image, mime: row.mime, updatedAt: row.updated_at } : null;
}

/** 只取更新時間，用來組網址（帶版本號讓瀏覽器換圖後重抓） */
export async function faceVersion(userId: string): Promise<number | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ updated_at: Date }>('SELECT updated_at FROM user_faces WHERE user_id = $1', [userId]);
  return rows[0] ? rows[0].updated_at.getTime() : null;
}

export async function deleteFace(userId: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM user_faces WHERE user_id = $1', [userId]);
}

/**
 * 臉的網址「前綴」，不是圖片本身——底下還有 /model/<角色>.glb 與 /photo.png。
 * 版本號放在路徑裡，換照片就是一組全新的網址，可以安心長快取。
 */
export function faceUrl(userId: string, version: number): string {
  return `/api/face/${userId}/${version}`;
}

/** 目前的臉部網址，沒上傳過就是空字串 */
export async function currentFaceUrl(userId: string): Promise<string> {
  const version = await faceVersion(userId);
  return version === null ? '' : faceUrl(userId, version);
}
