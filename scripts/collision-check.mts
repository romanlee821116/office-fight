import { moveWithCollision, resolveAgainstPlayers, findFreeSpawn, PLAYER_RADIUS } from '@office/shared';
const r = PLAYER_RADIUS;
const say = (label: string, ok: boolean, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${extra}`);
// 1. 重疊時被推開到剛好貼齊（距離 2r）
const a = resolveAgainstPlayers(0.2, 0, [{ x: 0, z: 0 }]);
say('重疊被推開', Math.abs(Math.hypot(a.x, a.z) - 2 * r) < 1e-6, `dist=${Math.hypot(a.x, a.z).toFixed(3)}`);
// 2. 直直走向站著的人：停在他前面，不穿過
let p = { x: 0, z: 3 };
for (let i = 0; i < 60; i++) p = moveWithCollision(p, 0, -0.1, undefined, [{ x: 0, z: 0 }]);
say('走向他人被擋住', p.z >= 2 * r - 1e-6 && p.z < 1.0, `z=${p.z.toFixed(3)}`);
// 3. 斜著走可以滑過去
p = { x: -0.3, z: 3 };
for (let i = 0; i < 80; i++) p = moveWithCollision(p, 0.02, -0.1, undefined, [{ x: 0, z: 0 }]);
say('斜走可滑過他人', p.z < -1.5, `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
// 4. 出生點避開他人
const crowd = Array.from({ length: 6 }, (_, i) => ({ x: -1.2 + i * 0.5, z: 6 }));
const spawn = findFreeSpawn({ x: 0, z: 6 }, crowd);
say('出生點避開人群', crowd.every((o) => Math.hypot(o.x - spawn.x, o.z - spawn.z) >= 2 * r + 0.2 - 1e-6), `(${spawn.x.toFixed(2)}, ${spawn.z.toFixed(2)})`);
// 5. 不動的人不受影響：函式只回傳移動者位置（純函式）
say('純函式不改動他人', crowd[0].x === -1.2);
