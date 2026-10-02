import { Client, getStateCallbacks } from 'colyseus.js';
import { NPC, NPC_LINES } from '@office/shared';

const url = process.env.OFFICE_URL ?? 'ws://localhost:2599';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: string[] = [];
const check = (label: string, ok: boolean) => out.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);

const room = await new Client(url).joinOrCreate<any>('office', { name: '測試員', avatarId: 'mint' });
getStateCallbacks(room);
const said: string[] = [];
const hits: any[] = [];
room.onMessage('npcSay', (m: any) => said.push(m.text));
room.onMessage('hit', (m: any) => hits.push(m));
for (const t of ['system', 'respawn', 'duel', 'chat', 'projectile', 'petFlight']) room.onMessage(t, () => {});
await sleep(1200);

const npc = () => room.state.npc;
const me = () => room.state.players.get(room.sessionId);
check('state 有路人且滿血', Boolean(npc()) && npc().hp === NPC.maxHp);

// 1. 會走路：取樣 8 秒看位置有沒有變
const p0 = { x: npc().x, z: npc().z };
let moved = 0;
for (let i = 0; i < 16; i++) {
  await sleep(500);
  if (Math.hypot(npc().x - p0.x, npc().z - p0.z) > 0.5) moved++;
}
check(`會自己走動（8 秒內離開起點 ${moved}/16 次取樣）`, moved > 0);

// 2. 走到他旁邊，等他說話
for (let i = 0; i < 60; i++) {
  const m = me();
  const dx = npc().x - m.x;
  const dz = npc().z - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 2) break;
  const step = Math.min(0.5, d);
  room.send('move', { x: m.x + (dx / d) * step, z: m.z + (dz / d) * step, rotY: Math.atan2(dx, dz), anim: 'walk' });
  await sleep(120);
}
await sleep(20000);
check(`旁邊有人時會說話（收到 ${said.length} 句）`, said.length > 0);
check(`台詞都在設定的清單裡：${JSON.stringify(said)}`, said.every((t) => NPC_LINES.includes(t)));

// 3. 可以攻擊他
room.send('toggleFight', true);
await sleep(400);
const hpBefore = npc().hp;
for (let i = 0; i < 12 && npc().hp > 0; i++) {
  const m = me();
  const dx = npc().x - m.x;
  const dz = npc().z - m.z;
  const d = Math.hypot(dx, dz) || 1;
  // 貼到揮擊距離內並面向他
  room.send('move', { x: npc().x - (dx / d) * 0.9, z: npc().z - (dz / d) * 0.9, rotY: Math.atan2(dx, dz), anim: 'idle' });
  await sleep(150);
  room.send('attack');
  await sleep(600);
}
check(`可以打他（${hpBefore} → ${npc().hp}）`, npc().hp < hpBefore);
check('打到會噴血（有 hit 事件指向路人）', hits.some((h) => h.targetId === NPC.id));

// 4. 打倒後會倒地並重新站起來
const downed = npc().hp === 0;
check(`可以被打倒（anim=${npc().anim}）`, downed && npc().anim === 'dead');
if (downed) {
  await sleep(NPC.respawnMs + 1500);
  check(`倒地後會自己站起來（hp=${npc().hp}, anim=${npc().anim}）`, npc().hp === NPC.maxHp && npc().anim !== 'dead');
}

// 5. 他從頭到尾沒有攻擊過任何人
check('路人不會攻擊任何人', !hits.some((h) => h.attackerId === NPC.id));
check('玩家沒有被路人打到掉血', me().hp === 200);

room.leave();
console.log(out.join('\n'));
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
