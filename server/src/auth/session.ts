import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const SECRET = (process.env.AUTH_SECRET ?? '').trim();

export const SESSION_COOKIE = 'office_session';
export const STATE_COOKIE = 'office_oauth_state';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const STATE_TTL_MS = 10 * 60 * 1000;

export function hasAuthSecret(): boolean {
  return SECRET.length > 0;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** 簽出 `<payload>.<到期毫秒>.<簽章>`；payload 不加密，只保證未被竄改 */
export function sign(payload: string, ttlMs: number): string {
  const body = `${Buffer.from(payload, 'utf8').toString('base64url')}.${Date.now() + ttlMs}`;
  return `${body}.${hmac(body)}`;
}

export function verify(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [data, expStr, sig] = parts;
  const expected = hmac(`${data}.${expStr}`);
  // 長度不同時 timingSafeEqual 會 throw，先擋掉
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!Number(expStr) || Number(expStr) < Date.now()) return null;
  return Buffer.from(data, 'base64url').toString('utf8');
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function isSecure(req: Request): boolean {
  return req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
}

export function setCookie(req: Request, res: Response, name: string, value: string, maxAgeMs: number): void {
  res.cookie(name, value, {
    httpOnly: true,
    // OAuth 導回時是 top-level GET，Lax 帶得到 cookie，同時擋掉跨站 POST
    sameSite: 'lax',
    secure: isSecure(req),
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearCookie(req: Request, res: Response, name: string): void {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: '/' });
}

/** 從 session cookie 取出 user id，未登入或過期回 null */
export function currentUserId(req: Request): string | null {
  return verify(readCookie(req, SESSION_COOKIE));
}

/** 進場票有效期間：夠前端拿到票後立刻連線，短到撿到也沒什麼用 */
export const TICKET_TTL_MS = 2 * 60 * 1000;
const TICKET_PREFIX = 'ticket:';

/**
 * Colyseus 的房間拿不到 HTTP cookie，改由前端先換一張短期票再帶進 joinOptions。
 * payload 加前綴，票才不能反過來當成 session cookie 用。
 */
export function signTicket(userId: string): string {
  return sign(`${TICKET_PREFIX}${userId}`, TICKET_TTL_MS);
}

export function verifyTicket(token: unknown): string | null {
  const payload = verify(token);
  return payload?.startsWith(TICKET_PREFIX) ? payload.slice(TICKET_PREFIX.length) : null;
}
