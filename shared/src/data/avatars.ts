import type { AvatarDef } from '../types';

/**
 * 可選角色（Kenney Blocky Characters 全部 18 個，CC0）。
 * model 對應 client/public/models/characters/<model>.glb；
 * color 用於名單頭像與腳下光圈，accent 用於載入前的替代幾何。
 */
export const AVATARS: AvatarDef[] = [
  { id: 'ally', name: '艾莉', model: 'character-a', color: '#5FBFAF', accent: '#2B2B2B' },
  { id: 'kai', name: '阿凱', model: 'character-b', color: '#D9534F', accent: '#2B2B2B' },
  { id: 'david', name: '大衛', model: 'character-c', color: '#7BC67E', accent: '#C9A063' },
  { id: 'violet', name: '小紫', model: 'character-e', color: '#A98BD6', accent: '#6B4A2B' },
  { id: 'lily', name: '莉莉', model: 'character-f', color: '#79C79A', accent: '#2B2B2B' },
  { id: 'chou', name: '老周', model: 'character-i', color: '#8FB8E0', accent: '#B8B8B8' },
  { id: 'derek', name: '阿德', model: 'character-k', color: '#C94C4C', accent: '#4A2E1B' },
  { id: 'boss', name: '老闆', model: 'character-q', color: '#3B3F4A', accent: '#1A1A1A' },
  { id: 'officer', name: '警官', model: 'character-j', color: '#3D5A99', accent: '#1A1A1A' },
  { id: 'ranger', name: '探險家', model: 'character-m', color: '#6E8B3D', accent: '#4A2E1B' },
  { id: 'kimono', name: '小和', model: 'character-n', color: '#C2495A', accent: '#1A1A1A' },
  { id: 'pirate', name: '海盜', model: 'character-p', color: '#3F6FB5', accent: '#5A3A22' },
  { id: 'ninja', name: '忍者', model: 'character-r', color: '#2B2B33', accent: '#111111' },
  { id: 'dummy', name: '假人', model: 'character-d', color: '#F2C21B', accent: '#1A1A1A' },
  { id: 'robot', name: '鐵仔', model: 'character-g', color: '#9AA5B1', accent: '#C0392B' },
  { id: 'robot2', name: '紫電', model: 'character-h', color: '#8E6BC4', accent: '#3A2A5A' },
  { id: 'zombie', name: '殭屍小綠', model: 'character-l', color: '#6FA36A', accent: '#2B2B2B' },
  { id: 'zombie2', name: '殭屍大叔', model: 'character-o', color: '#4F8F6F', accent: '#5A3A22' },
];

export const AVATAR_IDS = new Set(AVATARS.map((a) => a.id));
export const DEFAULT_AVATAR_ID = AVATARS[0].id;

export function getAvatar(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
