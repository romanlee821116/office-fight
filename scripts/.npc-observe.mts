import { Client } from 'colyseus.js';
const r = await new Client(process.env.OFFICE_URL ?? 'ws://localhost:2611').joinOrCreate<any>('office', { name: '觀察員', avatarId: 'mint' });
for (const t of ['system', 'hit', 'respawn', 'duel', 'chat', 'projectile', 'petFlight', 'npcSay']) r.onMessage(t, () => {});
await new Promise((res) => setTimeout(res, 12000));
await r.leave();
process.exit(0);
