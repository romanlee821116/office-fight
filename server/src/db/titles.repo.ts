import { pool } from './pool';

/** 會累積的統計；欄位名與 user_stats 的欄位一致 */
export interface UserStats {
  workSeconds: number;
  deaths: number;
  caught: number;
  feeds: number;
  gymSeconds: number;
  danceSeconds: number;
  bakes: number;
}

export const EMPTY_STATS: UserStats = { workSeconds: 0, deaths: 0, caught: 0, feeds: 0, gymSeconds: 0, danceSeconds: 0, bakes: 0 };

/** 只允許這幾個欄位被累加，避免把呼叫端的字串直接拼進 SQL */
const COLUMNS: Record<keyof UserStats, string> = {
  workSeconds: 'work_seconds',
  deaths: 'deaths',
  caught: 'caught',
  feeds: 'feeds',
  gymSeconds: 'gym_seconds',
  danceSeconds: 'dance_seconds',
  bakes: 'bakes',
};

export async function loadStats(userId: string): Promise<UserStats> {
  if (!pool) return { ...EMPTY_STATS };
  const { rows } = await pool.query<Record<string, number>>(
    'SELECT work_seconds, deaths, caught, feeds, gym_seconds, dance_seconds, bakes FROM user_stats WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) return { ...EMPTY_STATS };
  return {
    workSeconds: row.work_seconds,
    deaths: row.deaths,
    caught: row.caught,
    feeds: row.feeds,
    gymSeconds: row.gym_seconds,
    danceSeconds: row.dance_seconds,
    bakes: row.bakes,
  };
}

/**
 * 累加統計並回傳累加後的值。
 * 用 UPSERT 一句解決，第一次玩的人不必先建列。
 */
export async function bumpStat(userId: string, field: keyof UserStats, amount: number): Promise<number | null> {
  if (!pool || amount === 0) return null;
  const column = COLUMNS[field];
  const { rows } = await pool.query<Record<string, number>>(
    `INSERT INTO user_stats (user_id, ${column}) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET ${column} = user_stats.${column} + EXCLUDED.${column}
     RETURNING ${column}`,
    [userId, amount],
  );
  return rows[0]?.[column] ?? null;
}

export async function listTitles(userId: string): Promise<string[]> {
  if (!pool) return [];
  const { rows } = await pool.query<{ title_id: string }>('SELECT title_id FROM user_titles WHERE user_id = $1', [userId]);
  return rows.map((r) => r.title_id);
}

/** 解鎖稱號；回傳 true 代表這次才拿到（用來決定要不要廣播） */
export async function grantTitle(userId: string, titleId: string): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, titleId],
  );
  return (rowCount ?? 0) > 0;
}

export async function wearTitle(userId: string, titleId: string): Promise<void> {
  if (!pool) return;
  await pool.query('UPDATE users SET title_id = $2 WHERE id = $1', [userId, titleId]);
}
