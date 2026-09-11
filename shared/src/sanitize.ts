import { CHAT_MAX, NAME_MAX, NAME_MIN, STATUS_MAX } from './constants';

/** Unicode 控制字元（Cc 類別） */
const CONTROL_CHARS = /\p{Cc}/gu;

/** 移除控制字元與 HTML 角括號，並正規化空白 */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL_CHARS, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function sanitizeName(input: unknown): string | null {
  const name = cleanText(input, NAME_MAX);
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return null;
  return name;
}

export function sanitizeStatus(input: unknown): string {
  return cleanText(input, STATUS_MAX);
}

export function sanitizeChat(input: unknown): string {
  return cleanText(input, CHAT_MAX);
}
