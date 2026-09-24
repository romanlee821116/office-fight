/**
 * 產生服裝貼圖（client/public/models/characters/Textures/outfit-*.png）。
 *
 * Kenney Blocky Characters 的 18 個角色共用同一套 UV，貼圖是 1024×1024 的 atlas，
 * 每個部位是一張立方體的十字展開圖：
 *
 *        [ 上 ]
 *   [左][ 前 ][右][後]
 *        [ 下 ]
 *
 * 所以「中間那一橫排」才是環繞身體的四個側面，在它的垂直範圍內分段，
 * 才會對應到身體實際的上下（胸 → 腰 → 腿）。上下兩格是頂面與底面。
 *
 * 分區座標由 character-a.glb 的 UV 反推（取小數部分後的包圍盒），
 * 每面的深/寬/高再由十字展開的幾何關係解出：寬 = 2(深+寬)、高 = 2深 + 高。
 *
 * 頭部不畫：useOutfit 不會替換 head 的貼圖，臉與髮型一律保留角色自己的。
 *
 * 用法：npx tsx scripts/gen-outfits.mts
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 1024;
const OUT_DIR = 'client/public/models/characters/Textures';

// ---------- PNG 輸出（只需要 RGBA / 8bit，自己寫比拉相依套件省事） ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 每條掃描線前面補一個 filter byte（0 = None）
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 畫布 ----------

type RGB = [number, number, number];

function hex(value: string): RGB {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Canvas {
  readonly data = Buffer.alloc(SIZE * SIZE * 4);

  fill(color: RGB): void {
    this.rect(0, 0, SIZE, SIZE, color);
  }

  rect(x: number, y: number, w: number, h: number, [r, g, b]: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(SIZE, Math.round(x + w));
    const y1 = Math.min(SIZE, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * SIZE + px) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = 255;
      }
    }
  }
}

// ---------- 部位分區（由 UV 反推，見檔頭說明） ----------

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 立方體的深度：十字展開左右兩翼與上下兩格的邊長 */
  depth: number;
}

const PARTS = {
  torso: { x: 5, y: 693, w: 438, h: 328, depth: 91 },
  armLeft: { x: 771, y: 537, w: 251, h: 227, depth: 62 },
  armRight: { x: 483, y: 537, w: 251, h: 227, depth: 62 },
  legLeft: { x: 771, y: 803, w: 250, h: 214, depth: 62 },
  legRight: { x: 483, y: 803, w: 251, h: 214, depth: 62 },
} satisfies Record<string, Part>;

const ARMS = [PARTS.armLeft, PARTS.armRight];
const LEGS = [PARTS.legLeft, PARTS.legRight];

/** 相對身體高度的一段顏色（0 = 該部位最上緣，1 = 最下緣） */
interface Band {
  from: number;
  to: number;
  color: RGB;
}

/**
 * 一個部位：先整塊鋪底（含頂面與底面），再把環繞的四個側面依 band 分段上色。
 * band 的 0～1 對應立方體側面的高度，也就是身體實際的上下。
 *
 * 貼到頂端（from ≤ 0）或底端（to ≥ 1）的 band 會一路延伸吃掉頂面／底面那一格，
 * 否則腳底會是褲子的顏色而不是鞋底。
 */
function paint(canvas: Canvas, part: Part, base: RGB, bands: Band[] = []): void {
  canvas.rect(part.x, part.y, part.w, part.h, base);
  const top = part.y + part.depth;
  const height = part.h - part.depth * 2;
  for (const band of bands) {
    const y0 = band.from <= 0 ? part.y : top + height * band.from;
    const y1 = band.to >= 1 ? part.y + part.h : top + height * band.to;
    canvas.rect(part.x, y0, part.w, y1 - y0, band.color);
  }
}

// ---------- 服裝 ----------

/** 中性膚色：頭部保留角色自己的貼圖，所以裸露處多少會有色差，取一個折衷值 */
const SKIN = hex('#F0C79C');
const BACKDROP = hex('#2B2B2B');

interface Outfit {
  file: string;
  torso: { base: RGB; bands?: Band[] };
  arm: { base: RGB; bands?: Band[] };
  leg: { base: RGB; bands?: Band[] };
}

const OUTFITS: Outfit[] = [
  {
    // 泳衣：大面積裸露，軀幹下緣與大腿上段是泳褲
    file: 'outfit-swim',
    torso: { base: SKIN, bands: [{ from: 0.78, to: 1, color: hex('#2E86AB') }] },
    arm: { base: SKIN },
    leg: {
      base: SKIN,
      bands: [
        { from: 0, to: 0.3, color: hex('#2E86AB') },
        { from: 0.3, to: 0.34, color: hex('#F2F2F2') },
      ],
    },
  },
  {
    // 比基尼：胸口一條環繞的帶子、下身泳褲，其餘都是皮膚
    file: 'outfit-bikini',
    torso: {
      base: SKIN,
      bands: [
        { from: 0.12, to: 0.3, color: hex('#E8536F') },
        { from: 0.3, to: 0.33, color: hex('#FFF1F3') },
        { from: 0.76, to: 0.8, color: hex('#FFF1F3') },
        { from: 0.8, to: 1, color: hex('#E8536F') },
      ],
    },
    arm: { base: SKIN },
    leg: {
      base: SKIN,
      bands: [
        { from: 0, to: 0.26, color: hex('#E8536F') },
        { from: 0.26, to: 0.3, color: hex('#FFF1F3') },
      ],
    },
  },
  {
    // Y2K：亮粉短上衣露腰、低腰牛仔褲、厚底鞋
    file: 'outfit-y2k',
    torso: {
      base: hex('#FF5CA8'),
      bands: [
        { from: 0, to: 0.46, color: hex('#FF5CA8') },
        { from: 0.46, to: 0.8, color: SKIN },
        { from: 0.8, to: 1, color: hex('#6E9BE0') },
      ],
    },
    arm: {
      base: SKIN,
      bands: [
        { from: 0, to: 0.3, color: hex('#FF5CA8') },
        { from: 0.3, to: 0.35, color: hex('#FFD34D') },
      ],
    },
    leg: {
      base: hex('#6E9BE0'),
      bands: [
        { from: 0, to: 0.08, color: hex('#4E7ABF') },
        { from: 0.82, to: 1, color: hex('#2B2B33') },
      ],
    },
  },
  {
    // 婚紗：裙襬是另外掛上去的 3D 配件，貼圖負責上半身與手套
    file: 'outfit-gown',
    torso: {
      base: hex('#FBF7F1'),
      bands: [
        { from: 0, to: 0.12, color: SKIN },
        { from: 0.12, to: 0.52, color: hex('#FBF7F1') },
        { from: 0.52, to: 0.6, color: hex('#D9C9A8') },
        { from: 0.6, to: 1, color: hex('#FBF7F1') },
      ],
    },
    arm: {
      base: hex('#FBF7F1'),
      bands: [
        { from: 0, to: 0.22, color: SKIN },
        { from: 0.22, to: 1, color: hex('#FBF7F1') },
      ],
    },
    leg: { base: hex('#FBF7F1') },
  },
];

for (const outfit of OUTFITS) {
  const canvas = new Canvas();
  canvas.fill(BACKDROP);
  paint(canvas, PARTS.torso, outfit.torso.base, outfit.torso.bands);
  for (const arm of ARMS) paint(canvas, arm, outfit.arm.base, outfit.arm.bands);
  for (const leg of LEGS) paint(canvas, leg, outfit.leg.base, outfit.leg.bands);
  const path = `${OUT_DIR}/${outfit.file}.png`;
  writeFileSync(path, encodePng(SIZE, SIZE, canvas.data));
  console.log(`寫出 ${path}`);
}
