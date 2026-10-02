import { Client, getStateCallbacks } from 'colyseus.js';
import { EAT, FIGHT, KITCHEN_CROISSANT_SPOT, OVEN, PICKUPS, getWeapon } from '@office/shared';

const url = process.env.OFFICE_URL ?? 'ws://localhost:2567';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (label: string, ok: boolean) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);

const roomA = await new Client(url).joinOrCreate<any>('office', { name: '廚師', avatarId: 'mint' });
const roomB = await new Client(url).joinOrCreate<any>('office', { name: '打手', avatarId: 'mint' });
getStateCallbacks(roomA);
const sys: string[] = [];
for (const r of [roomA, roomB]) {
  r.onMessage('system', (m: any) => { if (r === roomA) sys.push(m.text); });
  r.onMessage('hit', () => {});
  r.onMessage('respawn', () => {});
  r.onMessage('duel', () => {});
  r.onMessage('chat', () => {});
}
await sleep(500);

const me = () => roomA.state.players.get(roomA.sessionId);
const bob = () => roomB.state.players.get(roomB.sessionId);
const floor = () => [...roomA.state.pickups.values()].filter((p: any) => getWeapon(p.weaponId)?.spawnable !== false);

async function walkTo(room: any, who: () => any, target: { x: number; z: number }, stopAt = 0.25) {
  for (let i = 0; i < 300; i++) {
    const cur = who();
    const dx = target.x - cur.x, dz = target.z - cur.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const step = Math.min(0.2, d);
    room.send('move', { x: cur.x + (dx / d) * step, z: cur.z + (dz / d) * step, rotY: Math.atan2(dx, dz), anim: 'walk' });
    await sleep(60);
  }
  return Math.hypot(who().x - target.x, who().z - target.z) <= stopAt + 0.4;
}

/** 讓打手把廚師打到指定血量以下 */
async function damageChefTo(maxHp: number) {
  roomA.send('toggleFight', true);
  roomB.send('toggleFight', true);
  await sleep(200);
  for (let i = 0; i < 12 && me().hp > maxHp; i++) {
    await walkTo(roomB, bob, { x: me().x + 0.9, z: me().z }, 0.3);
    const dx = me().x - bob().x, dz = me().z - bob().z;
    roomB.send('move', { x: bob().x, z: bob().z, rotY: Math.atan2(dx, dz), anim: 'idle' });
    await sleep(120);
    roomB.send('attack');
    await sleep(FIGHT.cooldownMs + 150);
  }
  roomA.send('toggleFight', false);
  roomB.send('toggleFight', false);
  await sleep(200);
}

// ---------- 1. 吃東西回血 ----------
await damageChefTo(FIGHT.maxHp - EAT.healHp);
check(`打手把廚師打到 ${me().hp} 血（< ${FIGHT.maxHp}）`, me().hp < FIGHT.maxHp);

// 先吃一個原味可頌驗證一般食物回 EAT.healHp
{
  const ok = await takeKitchenCroissant();
  check('拿得到第一個可頌', ok);
  const hpBefore = me().hp;
  roomA.send('eat');
  await sleep(300);
  check(`吃掉原味可頌回 ${EAT.healHp} 血（${hpBefore} → ${me().hp}）`, me().hp === Math.min(FIGHT.maxHp, hpBefore + EAT.healHp));
  check('吃完後食物從手上消失', me().weaponId === '');
  check('吃東西有系統訊息', sys.some((t) => t.includes('吃掉了可頌')));
  await sleep(PICKUPS.kitchenRestockMs + 1500);
}

/** 到廚房吧檯拿固定供應的可頌 */
async function takeKitchenCroissant(): Promise<boolean> {
  const spot = KITCHEN_CROISSANT_SPOT;
  for (let attempt = 0; attempt < 4; attempt++) {
    const onBar: any = [...roomA.state.pickups.values()].find(
      (p: any) => p.weaponId === 'croissant' && Math.hypot(p.x - spot.x, p.z - spot.z) < 0.3,
    );
    if (!onBar) { await sleep(PICKUPS.kitchenRestockMs / 2); continue; }
    await walkTo(roomA, me, { x: spot.x + 1.0, z: spot.z });
    roomA.send('pickup', { pickupId: onBar.id });
    await sleep(300);
    if (me().weaponId === 'croissant') return true;
  }
  return false;
}

// 吃掉手上的（如果剛好撿到別的東西）不需要；直接驗證吧檯固定供應
const barHasCroissant = [...roomA.state.pickups.values()].some(
  (p: any) => p.weaponId === 'croissant' && Math.hypot(p.x - KITCHEN_CROISSANT_SPOT.x, p.z - KITCHEN_CROISSANT_SPOT.z) < 0.3,
);
check('開場廚房吧檯就有可頌', barHasCroissant);

const got = await takeKitchenCroissant();
check('可以從吧檯拿起可頌', got);

// 拿走後應該會再補一個
await sleep(PICKUPS.kitchenRestockMs + 1500);
check('可頌被拿走後會自動補貨', [...roomA.state.pickups.values()].some(
  (p: any) => p.weaponId === 'croissant' && Math.hypot(p.x - KITCHEN_CROISSANT_SPOT.x, p.z - KITCHEN_CROISSANT_SPOT.z) < 0.3,
));

// ---------- 2. 烤箱 ----------
if (got) {
  check('走得到烤箱前', await walkTo(roomA, me, { x: OVEN.x + 0.8, z: OVEN.z }, 0.3));

  roomA.send('ovenTake');
  await sleep(200);
  check('空烤箱拿不到東西', me().weaponId === 'croissant' && roomA.state.ovenFoodId === '');

  roomA.send('ovenPlace');
  await sleep(250);
  check('可頌放進烤箱後手上淨空', me().weaponId === '' && roomA.state.ovenFoodId === 'croissant');
  check('烤箱進入烘烤中', roomA.state.ovenStage === 'baking');

  roomA.send('ovenTake');
  await sleep(250);
  check('烤到一半可以拿回原味可頌', me().weaponId === 'croissant' && roomA.state.ovenStage === '');

  roomA.send('ovenPlace');
  await sleep(200);
  const t0 = Date.now();
  while (roomA.state.ovenStage !== 'done' && Date.now() - t0 < OVEN.bakeMs + 5000) await sleep(100);
  const elapsed = Date.now() - t0;
  check(`${(OVEN.bakeMs / 1000).toFixed(0)} 秒後出爐（實測 ${(elapsed / 1000).toFixed(1)}s）`, roomA.state.ovenStage === 'done' && elapsed >= OVEN.bakeMs - 600);
  check('出爐後變成巨無霸可頌', roomA.state.ovenFoodId === 'croissant-baked');

  roomA.send('ovenTake');
  await sleep(250);
  check('可以從烤箱取出巨無霸可頌', me().weaponId === 'croissant-baked' && roomA.state.ovenFoodId === '');

  const raw = getWeapon('croissant')!;
  const baked = getWeapon('croissant-baked')!;
  check(`巨無霸可頌是原味的 ${OVEN.bakeScale} 倍大`, Math.abs(baked.scale - raw.scale * OVEN.bakeScale) < 1e-9);
  check('巨無霸可頌不會隨機生成在地上', baked.spawnable === false);

  // ---------- 3. 巨無霸可頌回滿血 ----------
  // 先離開廚房角落，打手才走得到身邊（格鬥模式一開會先補滿血，所以要開了才打）
  await walkTo(roomA, me, { x: -4, z: 2 }, 0.4);
  await damageChefTo(FIGHT.maxHp - EAT.healHp - 1);
  const hpBefore = me().hp;
  check(`吃之前只剩 ${hpBefore} 血`, hpBefore < FIGHT.maxHp - EAT.healHp && me().weaponId === 'croissant-baked');
  roomA.send('eat');
  await sleep(300);
  check(`吃掉巨無霸可頌回滿血（${hpBefore} → ${me().hp}）`, me().hp === FIGHT.maxHp && me().weaponId === '');
}

await roomA.leave();
await roomB.leave();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
