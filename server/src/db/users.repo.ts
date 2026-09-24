import { AVATAR_IDS, COINS, DEFAULT_AVATAR_ID, sanitizeName } from '@office/shared';
import { pool } from './pool';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarId: string;
  coins: number;
  hatId: string;
  outfitId: string;
  weaponId: string;
  petId: string;
  titleId: string;
}

interface RawRow {
  id: string;
  email: string;
  name: string;
  avatar_id: string;
  coins: number;
  hat_id: string;
  outfit_id: string;
  weapon_id: string;
  pet_id: string;
  title_id: string;
}

const USER_COLUMNS = 'id, email, name, avatar_id, coins, hat_id, outfit_id, weapon_id, pet_id, title_id';

function toUser(row: RawRow): UserRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarId: row.avatar_id,
    coins: row.coins,
    hatId: row.hat_id,
    outfitId: row.outfit_id,
    weaponId: row.weapon_id,
    petId: row.pet_id,
    titleId: row.title_id,
  };
}

/** Google 帳號沒有可用暱稱時的遞補順序：Google 名稱 → email 帳號名 → 固定字串 */
function initialName(googleName: string, email: string): string {
  return sanitizeName(googleName) ?? sanitizeName(email.split('@')[0]) ?? '新同事';
}

/**
 * 首次登入建立資料，之後登入只更新 email 與登入時間。
 * 不覆蓋 name / avatar_id：那是玩家在遊戲裡自己改的，Google 名稱不該蓋掉。
 *
 * 見面禮只在 INSERT 那次給：ON CONFLICT 的分支不碰 coins，
 * 所以同一個帳號重複登入不會再拿一次。
 */
export async function upsertGoogleUser(googleSub: string, email: string, googleName: string): Promise<UserRow> {
  if (!pool) throw new Error('資料庫未設定');
  const { rows } = await pool.query<RawRow>(
    `INSERT INTO users (google_sub, email, name, avatar_id, coins, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, last_login_at = now()
     RETURNING ${USER_COLUMNS}`,
    [googleSub, email, initialName(googleName, email), DEFAULT_AVATAR_ID, COINS.signupBonus],
  );
  return toUser(rows[0]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  if (!pool) return null;
  const { rows } = await pool.query<RawRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

/** 回傳寫入後的資料；暱稱不合法或 avatar 不存在時回 null，由呼叫端轉成 400 */
export async function updateProfile(id: string, rawName: unknown, rawAvatarId: unknown): Promise<UserRow | null> {
  if (!pool) return null;
  const name = sanitizeName(rawName);
  if (!name || typeof rawAvatarId !== 'string' || !AVATAR_IDS.has(rawAvatarId)) return null;
  const { rows } = await pool.query<RawRow>(
    `UPDATE users SET name = $2, avatar_id = $3 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, name, rawAvatarId],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * 以「加總」而非「覆寫」寫回金幣，同一個帳號同時開兩個分頁也不會互相蓋掉。
 * 回傳寫入後的總額，讓房間把畫面上的數字校正成資料庫的真實值。
 */
export async function addCoins(id: string, amount: number): Promise<number | null> {
  if (!pool || amount <= 0) return null;
  const { rows } = await pool.query<{ coins: number }>(
    'UPDATE users SET coins = coins + $2 WHERE id = $1 RETURNING coins',
    [id, amount],
  );
  return rows[0]?.coins ?? null;
}

/** 這個帳號買過的所有商品 id */
export async function listOwnedItems(id: string): Promise<string[]> {
  if (!pool) return [];
  const { rows } = await pool.query<{ item_id: string }>('SELECT item_id FROM user_items WHERE user_id = $1', [id]);
  return rows.map((r) => r.item_id);
}

/** 買過的寵物各自取的名字（商品 id → 名字），沒取名的不會出現在結果裡 */
export async function listPetNames(id: string): Promise<Record<string, string>> {
  if (!pool) return {};
  const { rows } = await pool.query<{ item_id: string; nickname: string }>(
    "SELECT item_id, nickname FROM user_items WHERE user_id = $1 AND nickname <> ''",
    [id],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.nickname]));
}

/** 買過的寵物各自的染色（商品 id → 染色 id），沒染過的不會出現在結果裡 */
export async function listPetTints(id: string): Promise<Record<string, string>> {
  if (!pool) return {};
  const { rows } = await pool.query<{ item_id: string; tint: string }>(
    "SELECT item_id, tint FROM user_items WHERE user_id = $1 AND tint <> ''",
    [id],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.tint]));
}

/**
 * 染色：扣款與寫入包在同一個交易裡，連點兩次不會被扣兩次錢。
 * 回傳扣款後的餘額；餘額不足或沒有這件商品時回 null。
 */
export async function tintItem(id: string, itemId: string, tint: string, price: number): Promise<number | null> {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paid = await client.query<{ coins: number }>(
      'UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins',
      [id, price],
    );
    if (!paid.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    const applied = await client.query('UPDATE user_items SET tint = $3 WHERE user_id = $1 AND item_id = $2', [id, itemId, tint]);
    if (!applied.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('COMMIT');
    return paid.rows[0].coins;
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return null;
  } finally {
    client.release();
  }
}

/** 幫某件已購買的商品取名；回傳寫入後的名字，沒有這件商品時回 null */
export async function setItemNickname(id: string, itemId: string, nickname: string): Promise<string | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ nickname: string }>(
    'UPDATE user_items SET nickname = $3 WHERE user_id = $1 AND item_id = $2 RETURNING nickname',
    [id, itemId, nickname],
  );
  return rows[0]?.nickname ?? null;
}

export type BuyResult = { ok: true; coins: number } | { ok: false; reason: 'funds' | 'owned' | 'error' };

/**
 * 扣款與寫入擁有物包在同一個交易裡。扣款條件帶 `coins >= price`，
 * 所以連點兩次只會有一次成功（第二次 rowCount 為 0 或撞主鍵）。
 */
export async function buyItem(id: string, itemId: string, price: number): Promise<BuyResult> {
  if (!pool) return { ok: false, reason: 'error' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query('SELECT 1 FROM user_items WHERE user_id = $1 AND item_id = $2', [id, itemId]);
    if (owned.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'owned' };
    }
    const paid = await client.query<{ coins: number }>(
      'UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins',
      [id, price],
    );
    if (!paid.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'funds' };
    }
    await client.query('INSERT INTO user_items (user_id, item_id) VALUES ($1, $2)', [id, itemId]);
    await client.query('COMMIT');
    return { ok: true, coins: paid.rows[0].coins };
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, reason: 'error' };
  } finally {
    client.release();
  }
}

/** 更新身上的頭飾、服裝、隨身武器與跟班寵物（呼叫端需先確認這些 id 確實已購買） */
export async function equipItems(id: string, hatId: string, outfitId: string, weaponId: string, petId: string): Promise<void> {
  if (!pool) return;
  await pool.query('UPDATE users SET hat_id = $2, outfit_id = $3, weapon_id = $4, pet_id = $5 WHERE id = $1', [
    id,
    hatId,
    outfitId,
    weaponId,
    petId,
  ]);
}
