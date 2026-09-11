import { Color } from 'three';

/** 一天中的燈光與天色（純函式，方便測試） */
export interface DayPalette {
  bg: Color;
  dir: number;
  dirColor: Color;
  amb: number;
  hemi: number;
}

interface Stop {
  hour: number;
  bg: string;
  dir: number;
  dirColor: string;
  amb: number;
  hemi: number;
}

/** 關鍵時刻的調色：夜 → 清晨 → 白天 → 黃昏 → 夜，之間線性過渡 */
const STOPS: Stop[] = [
  { hour: 0, bg: '#232C40', dir: 0.32, dirColor: '#8FA8D8', amb: 0.52, hemi: 0.2 },
  { hour: 5, bg: '#232C40', dir: 0.32, dirColor: '#8FA8D8', amb: 0.52, hemi: 0.2 },
  { hour: 6.5, bg: '#EBCDBE', dir: 0.95, dirColor: '#FFC896', amb: 0.72, hemi: 0.35 },
  { hour: 8.5, bg: '#DFE8F0', dir: 1.6, dirColor: '#FFFFFF', amb: 0.85, hemi: 0.5 },
  { hour: 16.5, bg: '#DFE8F0', dir: 1.6, dirColor: '#FFFFFF', amb: 0.85, hemi: 0.5 },
  { hour: 18.2, bg: '#F0BE96', dir: 1.0, dirColor: '#FFAE6E', amb: 0.72, hemi: 0.4 },
  { hour: 19.8, bg: '#232C40', dir: 0.32, dirColor: '#8FA8D8', amb: 0.52, hemi: 0.2 },
  { hour: 24, bg: '#232C40', dir: 0.32, dirColor: '#8FA8D8', amb: 0.52, hemi: 0.2 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 依當地時間（小時，可含小數）取得日夜調色 */
export function paletteAt(hourF: number): DayPalette {
  const h = ((hourF % 24) + 24) % 24;
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].hour <= h) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
  return {
    bg: new Color(a.bg).lerp(new Color(b.bg), t),
    dir: lerp(a.dir, b.dir, t),
    dirColor: new Color(a.dirColor).lerp(new Color(b.dirColor), t),
    amb: lerp(a.amb, b.amb, t),
    hemi: lerp(a.hemi, b.hemi, t),
  };
}
