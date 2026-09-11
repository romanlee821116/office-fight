/** WMO 天氣代碼 → 顯示與渲染參數 */
export interface WeatherInfo {
  emoji: string;
  label: string;
  /** 陰沉程度 0～1（影響光線與天色） */
  overcast: number;
  precip: 'none' | 'rain' | 'snow';
  /** 降水強度 0～1（影響粒子數量） */
  intensity: number;
  thunder: boolean;
  foggy: boolean;
}

const UNKNOWN: WeatherInfo = { emoji: '☁️', label: '—', overcast: 0.3, precip: 'none', intensity: 0, thunder: false, foggy: false };

export function weatherInfo(code: number): WeatherInfo {
  if (code < 0) return UNKNOWN;
  if (code === 0) return { emoji: '☀️', label: '晴朗', overcast: 0, precip: 'none', intensity: 0, thunder: false, foggy: false };
  if (code === 1) return { emoji: '🌤️', label: '大致晴', overcast: 0.15, precip: 'none', intensity: 0, thunder: false, foggy: false };
  if (code === 2) return { emoji: '⛅', label: '多雲', overcast: 0.4, precip: 'none', intensity: 0, thunder: false, foggy: false };
  if (code === 3) return { emoji: '☁️', label: '陰天', overcast: 0.7, precip: 'none', intensity: 0, thunder: false, foggy: false };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: '起霧', overcast: 0.75, precip: 'none', intensity: 0, thunder: false, foggy: true };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: '毛毛雨', overcast: 0.7, precip: 'rain', intensity: 0.35, thunder: false, foggy: false };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: '下雨', overcast: 0.85, precip: 'rain', intensity: 0.8, thunder: false, foggy: false };
  if (code >= 71 && code <= 77) return { emoji: '❄️', label: '下雪', overcast: 0.65, precip: 'snow', intensity: 0.7, thunder: false, foggy: false };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: '陣雨', overcast: 0.8, precip: 'rain', intensity: 1, thunder: false, foggy: false };
  if (code === 85 || code === 86) return { emoji: '❄️', label: '陣雪', overcast: 0.65, precip: 'snow', intensity: 1, thunder: false, foggy: false };
  if (code >= 95) return { emoji: '⛈️', label: '雷雨', overcast: 0.9, precip: 'rain', intensity: 1, thunder: true, foggy: false };
  return UNKNOWN;
}

/** 依本地小時回傳時段名稱 */
export function phaseLabel(hour: number): string {
  if (hour >= 5 && hour < 8) return '清晨';
  if (hour >= 8 && hour < 17) return '白天';
  if (hour >= 17 && hour < 19.5) return '傍晚';
  return '夜晚';
}
