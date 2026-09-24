import { Pool } from 'pg';
import { logger } from '../logger';

/**
 * pg 目前把 sslmode=require 當成 verify-full，但下個大版本會改成較寬鬆的 libpq 語意，
 * 因此啟動時會印一則警告。這裡直接寫成 verify-full：現在的行為完全不變，
 * 也不會在升版後悄悄變成不驗憑證（Neon 的憑證本來就驗得過）。
 */
function strictSsl(raw: string): string {
  return raw.replace(/sslmode=(require|prefer|verify-ca)\b/i, 'sslmode=verify-full');
}

const url = strictSsl((process.env.DATABASE_URL ?? '').trim());

/**
 * 沒設定 DATABASE_URL 就是 null：會員功能整組停用，遊戲維持匿名模式。
 * 本機開發與尚未接資料庫的部署不受任何影響。
 */
export const pool: Pool | null = url ? new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30_000 }) : null;

/** 啟動時建表（可重複執行）。失敗不阻擋伺服器啟動，只是會員功能不可用 */
export async function initDb(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        google_sub    text UNIQUE NOT NULL,
        email         text NOT NULL,
        name          text NOT NULL,
        avatar_id     text NOT NULL,
        coins         integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz
      )
    `);
    // 舊資料庫補上後來才加的欄位
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0');
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS hat_id text NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS outfit_id text NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS weapon_id text NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS pet_id text NOT NULL DEFAULT ''");
    // 已購買的商品；商品本身定義在程式碼裡（shared/data/shop.ts），這裡只記誰買了什麼
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_items (
        user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id   text NOT NULL,
        bought_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, item_id)
      )
    `);
    // 寵物可以取名；其他類型的商品用不到，留空
    await pool.query("ALTER TABLE user_items ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE user_items ADD COLUMN IF NOT EXISTS tint text NOT NULL DEFAULT ''");
    logger.info('資料庫：已連線，users / user_items 表就緒');
    return true;
  } catch (err) {
    logger.error('資料庫連線失敗，會員功能停用', err);
    return false;
  }
}
