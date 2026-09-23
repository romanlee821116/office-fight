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
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz
      )
    `);
    logger.info('資料庫：已連線，users 表就緒');
    return true;
  } catch (err) {
    logger.error('資料庫連線失敗，會員功能停用', err);
    return false;
  }
}
