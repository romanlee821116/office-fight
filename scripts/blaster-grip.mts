/**
 * 算出每把泡棉槍的 grip.position。
 *
 * 模型朝向：槍口在 -Z、握把在 +Z 且往 -Y 突出，而角色面向 +Z，
 * 所以要繞 Y 轉 180° 槍口才朝前；旋轉後握把跑到 -Z，位置得補回來。
 *
 * HeldWeapon 把武器掛在 arm-right 節點下，套的是
 *   <group position={P} rotation={R} scale={S}><模型/></group>
 * 模型上的點 p 落在手臂座標的 P + S·R·p，
 * 令握把中心落在手掌 HAND，即得 P = HAND − S·R·grip。
 *
 * 用法：npx tsx scripts/blaster-grip.mts
 */
import { readFileSync } from 'node:fs';

/** 手掌在 arm-right 局部座標的位置（沿用食物武器的握點） */
const HAND: [number, number, number] = [-0.2, -1.0, 0];
/** 角色模型單位不是公尺，武器要放大回真實尺寸（與現有武器同一個除數） */
const UNIT = 0.65;
/** 取最低的這個比例的頂點當作握把 */
const GRIP_PORTION = 0.18;

/** 每把的顯示縮放：狙擊槍原尺寸 1.64m 比角色還長，縮到約 1m */
const MODELS: [string, number][] = [
  ['blaster-b', 1],
  ['blaster-i', 1],
  ['blaster-a', 1],
  ['blaster-p', 0.9],
  ['blaster-e', 0.9],
];

function positions(file: string): [number, number, number][] {
  const buf = readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = buf.subarray(20 + jsonLength + 8);
  const out: [number, number, number][] = [];
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      const view = gltf.bufferViews[acc.bufferView];
      const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      for (let i = 0; i < acc.count; i++) {
        out.push([bin.readFloatLE(start + i * 12), bin.readFloatLE(start + i * 12 + 4), bin.readFloatLE(start + i * 12 + 8)]);
      }
    }
  }
  return out;
}

/**
 * 槍口朝哪一端：這套模型的朝向並不一致，有的槍口在 +Z、有的在 -Z。
 * 用「槍口一定比槍身細」來判定——取兩端各 12% 的頂點，比較橫截面大小。
 */
function muzzleSign(pts: [number, number, number][]): 1 | -1 {
  const sorted = [...pts].sort((a, b) => a[2] - b[2]);
  const n = Math.max(8, Math.round(pts.length * 0.12));
  const girth = (slice: [number, number, number][]) => {
    const xs = slice.map((v) => v[0]);
    const ys = slice.map((v) => v[1]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  return girth(sorted.slice(0, n)) < girth(sorted.slice(-n)) ? -1 : 1;
}

for (const [model, scale] of MODELS) {
  const gripScale = scale / UNIT;
  const pts = positions(`client/public/models/blaster/${model}.glb`);
  // 握把 = 最低的一撮頂點，取其中心
  const lowest = [...pts].sort((a, b) => a[1] - b[1]).slice(0, Math.max(8, Math.round(pts.length * GRIP_PORTION)));
  const grip = lowest.reduce((acc, p) => [acc[0] + p[0] / lowest.length, acc[1] + p[1] / lowest.length, acc[2] + p[2] / lowest.length], [0, 0, 0]);

  // 槍口朝 -Z 的要繞 Y 轉 180°，讓它朝向角色正面
  const flip = muzzleSign(pts) === -1;
  const afterY: [number, number, number] = flip ? [-grip[0], grip[1], -grip[2]] : [grip[0], grip[1], grip[2]];
  // 再繞 X 轉 90°：武器掛在 arm-right 底下，手臂垂下時那個節點的 Z 軸是垂直的，
  // 不補這一下槍會直挺挺立在手邊。three 的 Euler XYZ 是 R = Rx·Ry·Rz，
  // 所以 Rx(π/2) 之後 (x, y, z) → (x, −z, y)。
  const rotated: [number, number, number] = [afterY[0], -afterY[2], afterY[1]];
  const p = HAND.map((h, i) => h - gripScale * rotated[i]);

  const zs = pts.map((v) => v[2]);
  console.log(
    `${model}  原長 ${(Math.max(...zs) - Math.min(...zs)).toFixed(2)}m → 顯示 ${((Math.max(...zs) - Math.min(...zs)) * scale).toFixed(2)}m` +
      `  rotation [Math.PI/2, ${flip ? 'Math.PI' : '0'}, 0]  scale: ${scale}  grip.scale: ${+gripScale.toFixed(3)}` +
      `  position: [${p.map((v) => +v.toFixed(2)).join(', ')}]`,
  );
}
