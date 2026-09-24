import { NearestFilter, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { PET_TINTS, getPetTint } from '@office/shared';

/**
 * 寵物染色：改寫 Kenney 的色票貼圖。
 *
 * 十隻寵物共用一張 colormap.png，那不是繪製好的貼圖而是一格一格的純色方塊，
 * 模型的 UV 指到哪一格就是哪個顏色。所以染色不是疊一層濾鏡，
 * 而是把色票本身重新上色，出來的結果一樣乾淨。
 *
 * 眼睛一律保留原色。Kenney 的眼睛用的是色票裡那格低飽和的深灰藍
 * rgb(61,63,75)，而熊貓、企鵝的黑色部位用的是**同一格**——
 * 所以沒辦法只染黑塊不染眼睛，取捨後選擇保留眼睛：
 * 熊貓染的是白色部位，黑塊與眼睛都留著，剛好維持牠的黑白特徵。
 */

const SOURCE_URL = `/models/pets/Textures/colormap.png?v=${__ASSET_VERSION__}`;
/**
 * 五官判定：低飽和又暗的像素不染。
 * 色票裡這一格是 rgb(61,63,75) 附近（S≈0.10、L≈0.27），
 * 眼睛、鼻子與熊貓企鵝的黑色部位都取自它。
 */
const FEATURE_S = 0.22;
const FEATURE_L = 0.4;
/** 染色後的明度範圍：太亮會看不出顏色、太暗會糊成一團，壓進這個區間再保留層次 */
const TINTED_L_MIN = 0.28;
const TINTED_L_SPAN = 0.5;

const loader = new TextureLoader();
/** key 為染色 id；原色不進這裡，直接用共用的原始貼圖 */
const cache = new Map<string, Texture>();
let sourceImage: Promise<HTMLImageElement> | null = null;

function loadSource(): Promise<HTMLImageElement> {
  sourceImage ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = SOURCE_URL;
  });
  return sourceImage;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3) * 255, hueToRgb(p, q, h) * 255, hueToRgb(p, q, h - 1 / 3) * 255];
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function repaint(img: HTMLImageElement, color: string): Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const [th, ts] = hexToHsl(color);

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    // 五官不染，其餘整片換成目標色
    if (s <= FEATURE_S && l < FEATURE_L) continue;
    /*
     * 色相與飽和度一律吃目標色，明度保留原本的相對關係。
     * 不能用「有飽和度才染」當條件——貓、兔子身上大片是低飽和的米白與灰，
     * 那樣判會整片被當成黑白跳過，結果只有眼睛和頭頂變色。
     * 明度要壓進 TINTED_L 區間，白色的部位才不會染完還是白的。
     */
    const out = hslToRgb(th, ts, TINTED_L_MIN + l * TINTED_L_SPAN);
    px[i] = out[0];
    px[i + 1] = out[1];
    px[i + 2] = out[2];
  }
  ctx.putImageData(data, 0, 0);

  const texture = new Texture(canvas);
  // 對齊 GLTFLoader 對這張色票的設定：色票是純色方塊，用 Nearest 不會在格子邊緣糊出雜色
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 取得染色後的貼圖。還沒生成好時回 null（呼叫端先用原色顯示），
 * 生成完成會透過 onReady 通知重繪。同一組顏色只會生成一次。
 */
export function petTintTexture(tintId: string, onReady: () => void): Texture | null {
  const def = getPetTint(tintId);
  if (!def) return null;
  const key = tintId;
  const hit = cache.get(key);
  if (hit) return hit;

  void loadSource().then((img) => {
    if (cache.has(key)) return;
    const texture = repaint(img, def.color);
    if (!texture) return;
    cache.set(key, texture);
    onReady();
  });
  return null;
}

/** 讓 TextureLoader 也預熱一次原圖，避免第一次染色等太久 */
export function preloadPetColormap(): void {
  void loadSource();
  loader.load(SOURCE_URL, () => {});
}

/**
 * 先把某個模式的所有顏色都生成好，點色票才會立刻變色。
 * 一張 512×512 重畫大約幾毫秒，八張連著跑會卡一下，所以逐張排進 task queue。
 */
export function warmPetTints(onReady: () => void): void {
  void loadSource().then((img) => {
    for (const def of PET_TINTS) {
      const key = def.id;
      if (cache.has(key)) continue;
      setTimeout(() => {
        if (cache.has(key)) return;
        const texture = repaint(img, def.color);
        if (!texture) return;
        cache.set(key, texture);
        onReady();
      }, 0);
    }
  });
}
