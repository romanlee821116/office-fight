import { AVATAR_IDS, DEFAULT_AVATAR_ID, sanitizeName } from '@office/shared';
import { pool } from './pool';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarId: string;
}

interface RawRow {
  id: string;
  email: string;
  name: string;
  avatar_id: string;
}

function toUser(row: RawRow): UserRow {
  return { id: row.id, email: row.email, name: row.name, avatarId: row.avatar_id };
}

/** Google 帳號沒有可用暱稱時的遞補順序：Google 名稱 → email 帳號名 → 固定字串 */
function initialName(googleName: string, email: string): string {
  return sanitizeName(googleName) ?? sanitizeName(email.split('@')[0]) ?? '新同事';
}

/**
 * 首次登入建立資料，之後登入只更新 email 與登入時間。
 * 不覆蓋 name / avatar_id：那是玩家在遊戲裡自己改的，Google 名稱不該蓋掉。
 */
export async function upsertGoogleUser(googleSub: string, email: string, googleName: string): Promise<UserRow> {
  if (!pool) throw new Error('資料庫未設定');
  const { rows } = await pool.query<RawRow>(
    `INSERT INTO users (google_sub, email, name, avatar_id, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, last_login_at = now()
     RETURNING id, email, name, avatar_id`,
    [googleSub, email, initialName(googleName, email), DEFAULT_AVATAR_ID],
  );
  return toUser(rows[0]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  if (!pool) return null;
  const { rows } = await pool.query<RawRow>('SELECT id, email, name, avatar_id FROM users WHERE id = $1', [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

/** 回傳寫入後的資料；暱稱不合法或 avatar 不存在時回 null，由呼叫端轉成 400 */
export async function updateProfile(id: string, rawName: unknown, rawAvatarId: unknown): Promise<UserRow | null> {
  if (!pool) return null;
  const name = sanitizeName(rawName);
  if (!name || typeof rawAvatarId !== 'string' || !AVATAR_IDS.has(rawAvatarId)) return null;
  const { rows } = await pool.query<RawRow>(
    'UPDATE users SET name = $2, avatar_id = $3 WHERE id = $1 RETURNING id, email, name, avatar_id',
    [id, name, rawAvatarId],
  );
  return rows[0] ? toUser(rows[0]) : null;
}
