import { Client, getStateCallbacks } from 'colyseus.js';
import { SEAT_BY_ID } from '@office/shared';

const url = process.env.OFFICE_URL ?? 'ws://localhost:2567';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (label: string, ok: boolean) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);

const a = new Client(url);
const b = new Client(url);

// 1. 暱稱驗證
try {
  await a.joinOrCreate('office', { name: 'x', avatarId: 'mint' });
  check('暱稱過短應被拒絕', false);
} catch (e: any) {
  check(`暱稱過短應被拒絕 (${e.message})`, /暱稱/.test(e.message));
}

const roomA = await a.joinOrCreate<any>('office', { name: 'Alice', avatarId: 'mint' });
const roomB = await b.joinOrCreate<any>('office', { name: 'Bob', avatarId: 'unknown-avatar' });
check('兩人加入同一房間', roomA.roomId === roomB.roomId);

const $b = getStateCallbacks(roomB);
const seenB: Record<string, any> = {};
const systemMsgs: string[] = [];
const chats: any[] = [];
$b(roomB.state).players.onAdd((p: any, id: string) => {
  seenB[id] = { name: p.name, avatarId: p.avatarId, x: p.x, z: p.z, status: p.status, anim: p.anim, seatId: p.seatId, fightMode: p.fightMode, hp: p.hp, duelWith: p.duelWith };
  $b(p).onChange(() => {
    seenB[id] = { name: p.name, avatarId: p.avatarId, x: p.x, z: p.z, status: p.status, anim: p.anim, seatId: p.seatId, fightMode: p.fightMode, hp: p.hp, duelWith: p.duelWith };
  });
});
$b(roomB.state).players.onRemove((_p: any, id: string) => { delete seenB[id]; });
roomB.onMessage('system', (m: any) => systemMsgs.push(m.text));
roomB.onMessage('chat', (m: any) => chats.push(m));
const hits: any[] = [];
const respawns: any[] = [];
roomB.onMessage('hit', (m: any) => hits.push(m));
roomB.onMessage('respawn', (m: any) => respawns.push(m));
roomA.onMessage('hit', () => {});
roomA.onMessage('respawn', () => {});
const duelA: any[] = [];
const duelB: any[] = [];
roomA.onMessage('duel', (m: any) => duelA.push(m));
roomB.onMessage('duel', (m: any) => duelB.push(m));
roomA.onMessage('system', () => {});
roomA.onMessage('chat', () => {});

/** 以合法步伐把某位玩家走到目標點附近 */
async function walkTo(room: any, target: { x: number; z: number }, stopAt = 0.08) {
  for (let i = 0; i < 60; i++) {
    const cur = seenB[room.sessionId];
    const dx = target.x - cur.x, dz = target.z - cur.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) break;
    const step = Math.min(0.45, d);
    room.send('move', { x: cur.x + (dx / d) * step, z: cur.z + (dz / d) * step, rotY: Math.atan2(dx, dz), anim: 'walk' });
    await sleep(120);
  }
}
/** 面向某位玩家 */
async function face(room: any, otherId: string) {
  const me = seenB[room.sessionId], o = seenB[otherId];
  room.send('move', { x: me.x, z: me.z, rotY: Math.atan2(o.x - me.x, o.z - me.z), anim: 'idle' });
  await sleep(120);
}

await sleep(300);
check('B 看到兩位玩家', Object.keys(seenB).length === 2);
check('未知 avatarId 回退為預設', seenB[roomB.sessionId]?.avatarId === 'ally');
check('出生點在房間範圍內', Math.abs(seenB[roomA.sessionId].x) < 12 && Math.abs(seenB[roomA.sessionId].z) < 8);

// 2. 合法移動
const startA = seenB[roomA.sessionId];
roomA.send('move', { x: startA.x + 0.1, z: startA.z - 0.1, rotY: 1, anim: 'walk' });
await sleep(200);
check('合法移動被同步', Math.abs(seenB[roomA.sessionId].x - (startA.x + 0.1)) < 1e-3 && seenB[roomA.sessionId].anim === 'walk');

// 3. 瞬移（速度異常）應被拒絕
const before = { ...seenB[roomA.sessionId] };
roomA.send('move', { x: before.x + 8, z: before.z, rotY: 0, anim: 'run' });
await sleep(200);
check('瞬移被拒絕', Math.abs(seenB[roomA.sessionId].x - before.x) < 1e-3);

// 4. 走進家具（desk-0 位於 -9,-4.5）應被推出
roomA.send('move', { x: -9, z: -4.5, rotY: 0, anim: 'walk' }); // 會因距離過大被拒
await sleep(120);

// 5. 狀態
roomA.send('setStatus', '  開會中<script>  超長超長超長超長超長超長超長超長超長超長超長超長超長');
await sleep(200);
const st = seenB[roomA.sessionId].status;
check(`狀態清理與截斷 ("${st}")`, !st.includes('<') && [...st].length <= 30 && st.startsWith('開會中'));

// 6. 聊天 + 速率限制（1 秒最多 2 則）
roomA.send('chat', '哈囉 1');
roomA.send('chat', '哈囉 2');
roomA.send('chat', '哈囉 3');
roomA.send('chat', '   ');
await sleep(300);
check(`聊天速率限制（收到 ${chats.length} 則）`, chats.length === 2 && chats[0].name === 'Alice');
check('聊天訊息含 senderId/ts', chats[0]?.senderId === roomA.sessionId && typeof chats[0]?.ts === 'number');

// 7. 坐下 / 起身：先以合法步伐走到沙發旁
const seat = SEAT_BY_ID.get('sofa-0:0')!;
let cur = { ...seenB[roomA.sessionId] };
roomA.send('sit', { seatId: seat.id });
await sleep(150);
check('距離太遠時坐下被拒絕', !seenB[roomA.sessionId].seatId);
// 沙發前方被咖啡桌擋住，從後方（+Z）繞過去靠近
const waypoints = [{ x: seat.x, z: 7.2 }, { x: seat.x, z: seat.z + 0.9 }];
for (const wp of waypoints) {
  for (let i = 0; i < 40 && Math.hypot(wp.x - cur.x, wp.z - cur.z) > 0.08; i++) {
    const dx = wp.x - cur.x, dz = wp.z - cur.z, d = Math.hypot(dx, dz), step = Math.min(0.45, d);
    roomA.send('move', { x: cur.x + (dx / d) * step, z: cur.z + (dz / d) * step, rotY: 0, anim: 'walk' });
    await sleep(120);
    cur = { ...seenB[roomA.sessionId] };
  }
}
check(`走到沙發旁（距離 ${Math.hypot(seat.x - cur.x, seat.z - cur.z).toFixed(2)}m）`, Math.hypot(seat.x - cur.x, seat.z - cur.z) <= 1.4);
roomA.send('sit', { seatId: seat.id });
await sleep(200);
const sat = seenB[roomA.sessionId];
check('坐下後座位與姿勢同步', sat.seatId === seat.id && Math.abs(sat.x - seat.x) < 1e-3 && sat.anim === 'sit');
roomA.send('move', { x: seat.x + 0.3, z: seat.z, rotY: 0, anim: 'walk' });
await sleep(150);
check('坐著時 move 被忽略', Math.abs(seenB[roomA.sessionId].x - seat.x) < 1e-3);
roomB.send('sit', { seatId: seat.id });
await sleep(150);
check('同一座位第二人被拒絕', !seenB[roomB.sessionId].seatId);
roomA.send('stand');
await sleep(200);
const stood = seenB[roomA.sessionId];
check(`起身後站到沙發後方 (${stood.x.toFixed(2)}, ${stood.z.toFixed(2)})`, stood.seatId === '' && stood.anim === 'idle' && stood.z > seat.z + 0.5);

// 8. 格鬥模式
const aId = roomA.sessionId, bId = roomB.sessionId;
await walkTo(roomB, { x: seenB[aId].x, z: 7.0 }, 0.1);
await walkTo(roomB, { x: seenB[aId].x - 1.1, z: seenB[aId].z + 0.2 }, 0.1);
await face(roomB, aId);
check(`B 走到 A 旁（距離 ${Math.hypot(seenB[aId].x - seenB[bId].x, seenB[aId].z - seenB[bId].z).toFixed(2)}m）`, Math.hypot(seenB[aId].x - seenB[bId].x, seenB[aId].z - seenB[bId].z) <= 1.5);
roomB.send('attack');
await sleep(200);
check('未開格鬥模式時攻擊無效', hits.length === 0 && seenB[aId].hp === 200);
roomB.send('toggleFight', true);
await sleep(150);
roomB.send('attack');
await sleep(700);
check('只有攻擊者開啟時不會命中', hits.length === 0 && seenB[aId].hp === 200 && seenB[bId].fightMode === true);
roomA.send('toggleFight', true);
await sleep(150);
const beforeHit = { ...seenB[aId] };
roomB.send('attack');
roomB.send('attack'); // 冷卻中，應被忽略
await sleep(300);
check(`命中一次：hp ${seenB[aId].hp}，hit 事件 ${hits.length} 則`, hits.length === 1 && seenB[aId].hp === 175 && hits[0].targetId === aId && hits[0].attackerId === bId);
check(`被擊退 ${Math.hypot(seenB[aId].x - beforeHit.x, seenB[aId].z - beforeHit.z).toFixed(2)}m 並面向攻擊者`, Math.hypot(seenB[aId].x - beforeHit.x, seenB[aId].z - beforeHit.z) > 0.8 && seenB[aId].anim === 'hit');
for (let i = 0; i < 7; i++) {
  await sleep(700);
  const a = seenB[aId];
  await walkTo(roomB, { x: a.x - 1.0, z: a.z }, 0.1);
  await face(roomB, aId);
  roomB.send('attack');
  await sleep(300);
}
check(`八拳後倒地：hp ${seenB[aId].hp}，anim ${seenB[aId].anim}`, seenB[aId].hp === 0 && seenB[aId].anim === 'dead' && hits.length === 8 && hits[7].killed === true);
check('倒地廣播系統訊息', systemMsgs.some((t) => t.includes('擊倒了 Alice')));
roomA.send('move', { x: seenB[aId].x + 0.2, z: seenB[aId].z, rotY: 0, anim: 'walk' });
await sleep(150);
check('倒地時 move 被忽略', seenB[aId].anim === 'dead');
await sleep(3200);
check(`3 秒後復活：hp ${seenB[aId].hp}，位置 (${seenB[aId].x.toFixed(1)}, ${seenB[aId].z.toFixed(1)})`, seenB[aId].hp === 200 && seenB[aId].anim === 'idle' && respawns.length === 1 && Math.abs(seenB[aId].z - 6) < 1.5 && Math.abs(seenB[aId].x) < 2);

// 9. 決鬥邀請
roomA.send('duel', { action: 'invite', targetId: bId });
await sleep(200);
check('邀請送達雙方', duelA.some((m) => m.kind === 'sent' && m.toId === bId) && duelB.some((m) => m.kind === 'invite' && m.fromId === aId));
roomB.send('duel', { action: 'decline', fromId: aId });
await sleep(200);
check('拒絕後邀請者收到 declined', duelA.some((m) => m.kind === 'declined' && m.reason === 'declined'));
// 先站到 A 的 +Z 側面對 A，之後每一拳都把 A 往房間中央（-Z）推，避開家具
await walkTo(roomB, { x: seenB[aId].x, z: seenB[aId].z + 1.0 }, 0.1);
await face(roomB, aId);
// 先站到 A 的 +Z 側面對 A，之後每一拳都把 A 往房間中央（-Z）推，避開家具
await walkTo(roomB, { x: seenB[aId].x, z: seenB[aId].z + 1.0 }, 0.1);
await face(roomB, aId);
roomA.send('duel', { action: 'invite', targetId: bId });
await sleep(150);
roomB.send('duel', { action: 'accept', fromId: aId });
await sleep(250);
const startEv = duelB.find((m) => m.kind === 'start');
check('接受後決鬥開始並雙方鎖定', Boolean(startEv) && seenB[aId].duelWith === bId && seenB[bId].duelWith === aId && seenB[aId].fightMode && seenB[bId].fightMode && seenB[aId].hp === 200);
roomA.send('toggleFight', false);
await sleep(150);
check('決鬥中無法關閉格鬥模式', seenB[aId].fightMode === true);
const hitsBefore = hits.length;
roomB.send('attack');
await sleep(200);
check('倒數期間攻擊無效', hits.length === hitsBefore && seenB[aId].hp === 200);
await sleep(Math.max(0, startEv.startsAt - Date.now()) + 300);
for (let i = 0; i < 8; i++) {
  const a = seenB[aId];
  await walkTo(roomB, { x: a.x, z: a.z + 1.0 }, 0.1);
  await face(roomB, aId);
  roomB.send('attack');
  await sleep(i === 0 ? 300 : 700);
  if (i === 0) check(`決鬥開始後命中：A hp ${seenB[aId].hp}`, seenB[aId].hp === 175);
}
await sleep(300);
const endEv = duelB.find((m) => m.kind === 'end');
check(`八拳 KO 結束決鬥：勝者 ${endEv?.winnerName}`, endEv?.winnerId === bId && endEv?.reason === 'ko' && seenB[aId].anim === 'dead');
check('結束後雙方解除決鬥與格鬥模式，勝者回滿血', seenB[aId].duelWith === '' && seenB[bId].duelWith === '' && !seenB[aId].fightMode && !seenB[bId].fightMode && seenB[bId].hp === 200);
await sleep(3200);

// 10. 離開
await roomA.leave(true);
await sleep(300);
check('A 離開後 B 名單移除', !(roomA.sessionId in seenB));
check(`系統訊息（${systemMsgs.join(' / ')}）`, systemMsgs.some((t) => t.includes('Bob') && t.includes('進入')) && systemMsgs.some((t) => t.includes('Alice') && t.includes('離開')));

await roomB.leave(true);
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
