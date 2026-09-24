import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import type { AuthMe } from '@office/shared';
import { pool } from '../db/pool';
import { findUserById, listOwnedItems, listPetNames, listPetTints, updateProfile, upsertGoogleUser, type UserRow } from '../db/users.repo';
import { logger } from '../logger';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  STATE_COOKIE,
  STATE_TTL_MS,
  clearCookie,
  currentUserId,
  hasAuthSecret,
  readCookie,
  setCookie,
  sign,
  signTicket,
  verify,
} from './session';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
const CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN ?? '').trim().replace(/\/$/, '');
/** 選填：只允許這個 Google Workspace 網域的帳號登入 */
const ALLOWED_HD = (process.env.GOOGLE_ALLOWED_HD ?? '').trim().toLowerCase();

/** 四項設定齊全才開放會員功能，缺一就整組停用（前端不會顯示登入按鈕） */
export function authEnabled(): boolean {
  return Boolean(pool) && hasAuthSecret() && CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0 && PUBLIC_ORIGIN.length > 0;
}

export function authConfigHint(): string {
  const missing: string[] = [];
  if (!pool) missing.push('DATABASE_URL');
  if (!hasAuthSecret()) missing.push('AUTH_SECRET');
  if (!CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!PUBLIC_ORIGIN) missing.push('PUBLIC_ORIGIN');
  return missing.length ? `會員登入：未啟用（缺少 ${missing.join(' / ')}）` : '會員登入：已啟用（Google）';
}

function redirectUri(): string {
  return `${PUBLIC_ORIGIN}/api/auth/google/callback`;
}

/** Google 回傳的 id_token 內容（只取我們需要的欄位） */
interface IdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  hd?: string;
}

/**
 * id_token 是後端直接向 Google TLS 端點換來的，不經過瀏覽器，
 * 因此這裡只解碼取值，不需要再驗一次 JWT 簽章。
 */
function decodeIdToken(idToken: string): IdTokenClaims | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    return null;
  }
}

async function exchangeCode(code: string): Promise<IdTokenClaims | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    logger.error(`Google token 交換失敗（${res.status}）：${await res.text()}`);
    return null;
  }
  const data = (await res.json()) as { id_token?: string };
  return data.id_token ? decodeIdToken(data.id_token) : null;
}

function fail(res: Response, reason: string): void {
  res.redirect(`/?login_error=${encodeURIComponent(reason)}`);
}

async function toAuthMe(user: UserRow): Promise<AuthMe> {
  return {
    email: user.email,
    name: user.name,
    avatarId: user.avatarId,
    coins: user.coins,
    hatId: user.hatId,
    outfitId: user.outfitId,
    weaponId: user.weaponId,
    petId: user.petId,
    ownedItems: await listOwnedItems(user.id),
    petNames: await listPetNames(user.id),
    petTints: await listPetTints(user.id),
  };
}

export function createAuthRouter(): Router {
  const router = express.Router();

  router.get('/api/auth/google', (req: Request, res: Response) => {
    if (!authEnabled()) {
      res.status(503).json({ error: '會員功能未啟用' });
      return;
    }
    // state 同時放進網址與 cookie，回來時兩邊比對 + 驗簽，擋掉 CSRF
    const state = sign(crypto.randomUUID(), STATE_TTL_MS);
    setCookie(req, res, STATE_COOKIE, state, STATE_TTL_MS);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    if (ALLOWED_HD) params.set('hd', ALLOWED_HD);
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  router.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    if (!authEnabled()) {
      res.status(503).send('會員功能未啟用');
      return;
    }
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieState = readCookie(req, STATE_COOKIE);
    clearCookie(req, res, STATE_COOKIE);
    if (!state || state !== cookieState || !verify(state)) {
      fail(res, 'state');
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      fail(res, 'cancelled');
      return;
    }

    try {
      const claims = await exchangeCode(code);
      if (!claims?.sub || !claims.email || claims.email_verified === false) {
        fail(res, 'google');
        return;
      }
      if (ALLOWED_HD && (claims.hd ?? '').toLowerCase() !== ALLOWED_HD) {
        fail(res, 'domain');
        return;
      }
      const user = await upsertGoogleUser(claims.sub, claims.email, claims.name ?? '');
      setCookie(req, res, SESSION_COOKIE, sign(user.id, SESSION_TTL_MS), SESSION_TTL_MS);
      logger.info(`登入：${user.email}（${user.name}）`);
      res.redirect('/');
    } catch (err) {
      logger.error('Google 登入處理失敗', err);
      fail(res, 'server');
    }
  });

  router.post('/api/auth/logout', (req: Request, res: Response) => {
    clearCookie(req, res, SESSION_COOKIE);
    res.json({ ok: true });
  });

  /** 換一張短期進場票，讓 Colyseus 房間認得出這是哪個帳號（訪客拿不到） */
  router.get('/api/auth/ticket', (req: Request, res: Response) => {
    const userId = authEnabled() ? currentUserId(req) : null;
    if (!userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }
    res.json({ ticket: signTicket(userId) });
  });

  router.get('/api/me', async (req: Request, res: Response) => {
    const userId = authEnabled() ? currentUserId(req) : null;
    const user = userId ? await findUserById(userId) : null;
    if (!user) {
      res.status(401).json({ error: '未登入' });
      return;
    }
    res.json(await toAuthMe(user));
  });

  router.put('/api/me', express.json({ limit: '1kb' }), async (req: Request, res: Response) => {
    const userId = authEnabled() ? currentUserId(req) : null;
    if (!userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }
    const body = req.body as { name?: unknown; avatarId?: unknown } | undefined;
    const user = await updateProfile(userId, body?.name, body?.avatarId);
    if (!user) {
      res.status(400).json({ error: '暱稱或角色不合法' });
      return;
    }
    res.json(await toAuthMe(user));
  });

  return router;
}
