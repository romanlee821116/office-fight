import { deflateSync, inflateSync } from 'node:zlib';

/**
 * 最小的 PNG 讀寫，只為了把臉合成到角色貼圖上。
 *
 * 支援 8bit 非交錯的 RGB / RGBA / 調色盤三種——角色的 atlas 是調色盤格式，
 * 瀏覽器上傳的照片是 RGBA，剛好都涵蓋到。輸出一律 RGBA。
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA，每像素 4 bytes */
  data: Buffer;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 還原掃描線的 filter（PNG 規格的五種） */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const type = raw[p++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v: number;
      if (type === 0) v = cur;
      else if (type === 1) v = cur + a;
      else if (type === 2) v = cur + b;
      else if (type === 3) v = cur + ((a + b) >> 1);
      else {
        // Paeth
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + x] = v & 255;
    }
    p += stride;
  }
  return out;
}

export function decodePng(buf: Buffer): Bitmap | null {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) return null;
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let alpha: Buffer | null = null;
  const idat: Buffer[] = [];

  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') alpha = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }

  if (depth !== 8 || interlace !== 0 || width <= 0 || height <= 0) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0;
  if (channels === 0) return null;
  if (colorType === 3 && !palette) return null;

  const flat = unfilter(inflateSync(Buffer.concat(idat)), width, height, channels);
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0, k = 0; k < data.length; i += channels, k += 4) {
    if (colorType === 3) {
      const idx = flat[i];
      data[k] = palette![idx * 3];
      data[k + 1] = palette![idx * 3 + 1];
      data[k + 2] = palette![idx * 3 + 2];
      if (alpha && idx < alpha.length) data[k + 3] = alpha[idx];
    } else if (colorType === 0) {
      data[k] = data[k + 1] = data[k + 2] = flat[i];
    } else {
      data[k] = flat[i];
      data[k + 1] = flat[i + 1];
      data[k + 2] = flat[i + 2];
      if (channels === 4) data[k + 3] = flat[i + 3];
    }
  }
  return { width, height, data };
}

export function encodePng({ width, height, data }: Bitmap): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** 把 src 以最近鄰縮放後貼到 dst 的指定矩形（照片和目標格子都是正方形，夠用了） */
export function blit(dst: Bitmap, src: Bitmap, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    const sy = Math.min(src.height - 1, ((dy * src.height) / h) | 0);
    for (let dx = 0; dx < w; dx++) {
      const sx = Math.min(src.width - 1, ((dx * src.width) / w) | 0);
      const s = (sy * src.width + sx) * 4;
      const d = ((y + dy) * dst.width + (x + dx)) * 4;
      if (d < 0 || d + 3 >= dst.data.length) continue;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = 255;
    }
  }
}
