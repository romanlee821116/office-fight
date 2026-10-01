import { evaluateHand, HAND_CATEGORY, cardLabel, makeDeck, shuffle } from '@office/shared';

let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got !== want) { console.log(`✗ ${name}: 得到 ${got}，應為 ${want}`); fail++; }
}

/** 用 'As' 這種寫法組牌：rank + 花色字母 */
const R = '23456789TJQKA';
const S = 'shdc';
function c(txt: string): number { return S.indexOf(txt[1]) * 13 + R.indexOf(txt[0]); }
function hand(...t: string[]): number[] { return t.map(c); }

// 分類判定
check('同花順', evaluateHand(hand('9s','8s','7s','6s','5s','2h','3d')).category, HAND_CATEGORY.straightFlush);
check('四條', evaluateHand(hand('9s','9h','9d','9c','5s','2h','3d')).category, HAND_CATEGORY.quads);
check('葫蘆', evaluateHand(hand('9s','9h','9d','5c','5s','2h','3d')).category, HAND_CATEGORY.fullHouse);
check('同花', evaluateHand(hand('As','Js','7s','6s','2s','9h','3d')).category, HAND_CATEGORY.flush);
check('順子', evaluateHand(hand('9s','8h','7d','6c','5s','2h','3d')).category, HAND_CATEGORY.straight);
check('三條', evaluateHand(hand('9s','9h','9d','6c','5s','2h','3d')).category, HAND_CATEGORY.trips);
check('兩對', evaluateHand(hand('9s','9h','6d','6c','5s','2h','3d')).category, HAND_CATEGORY.twoPair);
check('一對', evaluateHand(hand('9s','9h','Kd','6c','5s','2h','3d')).category, HAND_CATEGORY.pair);
check('高牌', evaluateHand(hand('9s','Jh','Kd','6c','5s','2h','3d')).category, HAND_CATEGORY.highCard);

// 輪子 A-2-3-4-5：是順子，但要比 6 高的順子小
check('輪子是順子', evaluateHand(hand('As','2h','3d','4c','5s','Kh','9d')).category, HAND_CATEGORY.straight);
const wheel = evaluateHand(hand('As','2h','3d','4c','5s','Kh','9d')).score;
const six = evaluateHand(hand('2s','3h','4d','5c','6s','Kh','9d')).score;
check('輪子 < 6 高順子', wheel < six, true);

// 輪子同花順 vs 皇家同花順
const steelWheel = evaluateHand(hand('As','2s','3s','4s','5s','Kh','9d')).score;
const royal = evaluateHand(hand('As','Ks','Qs','Js','Ts','2h','9d')).score;
check('輪子同花順 < 皇家同花順', steelWheel < royal, true);

// A 不能繞回：K-A-2-3-4 不是順子
check('KA234 不是順子', evaluateHand(hand('Ks','Ah','2d','3c','4s','7h','9d')).category, HAND_CATEGORY.highCard);

// 踢腳比較：同為一對 A，踢腳 K 大於踢腳 Q
const kickK = evaluateHand(hand('As','Ah','Kd','7c','5s','2h','3d')).score;
const kickQ = evaluateHand(hand('As','Ah','Qd','7c','5s','2h','3d')).score;
check('一對A 踢腳K > 踢腳Q', kickK > kickQ, true);

// 公共牌一樣、底牌一樣 → 必須完全平手
const board = ['Ks','Qd','7h','4c','2s'];
const tieA = evaluateHand(hand('As','Ah', ...board)).score;
const tieB = evaluateHand(hand('Ad','Ac', ...board)).score;
check('同牌力平手', tieA, tieB);

// 七張裡選得出最好的五張：手上兩張爛牌不該拖累公共牌的同花
const boardFlush = evaluateHand(hand('2h','3d','As','Ks','Qs','Js','Ts'));
check('公共牌同花順優先', boardFlush.category, HAND_CATEGORY.straightFlush);

// 葫蘆要選大的那組：999 + KK 勝過 999 + 55
const fh = evaluateHand(hand('9s','9h','9d','Ks','Kh','5c','5d'));
check('葫蘆取大對', fh.category, HAND_CATEGORY.fullHouse);
check('葫蘆 999KK > 999 55', fh.score > evaluateHand(hand('9s','9h','9d','5c','5d','3h','2s')).score, true);

// 洗牌不重複也不遺失
const deck = shuffle(makeDeck(), (n) => Math.floor(Math.random() * n));
check('洗牌後 52 張', deck.length, 52);
check('洗牌後無重複', new Set(deck).size, 52);

// 窮舉抽樣：任意 7 張都評得出 5 張、分數單調
for (let i = 0; i < 20000; i++) {
  const d = shuffle(makeDeck(), (n) => Math.floor(Math.random() * n)).slice(0, 7);
  const h = evaluateHand(d);
  if (h.best.length !== 5) { console.log('✗ best 不是五張'); fail++; break; }
  if (!h.best.every((x) => d.includes(x))) { console.log('✗ best 出現不在手上的牌'); fail++; break; }
}

console.log(fail === 0 ? '✓ 牌型評估通過' : `✗ 牌型評估 ${fail} 項失敗`);

// ---------------------------------------------------------------------------
// 牌局引擎：邊池、分錢與籌碼守恆
// ---------------------------------------------------------------------------
import { buildPots, settlePots, PokerTable, type ActionKind } from '../server/src/rooms/pokerTable';
import { POKER } from '@office/shared';

function potShape(pots: { amount: number; eligible: string[] }[]): string {
  return pots.map((p) => `${p.amount}[${p.eligible.join('')}]`).join(' ');
}

// 三人同額 → 一個主池
check(
  '同額單一主池',
  potShape(buildPots([
    { id: 'A', committed: 100, folded: false },
    { id: 'B', committed: 100, folded: false },
    { id: 'C', committed: 100, folded: false },
  ])),
  '300[ABC]',
);

// A 短碼全下 100，B/C 打到 500 → 主池 300 三人分，邊池 800 只有 B/C 有份
check(
  '短碼全下切出邊池',
  potShape(buildPots([
    { id: 'A', committed: 100, folded: false },
    { id: 'B', committed: 500, folded: false },
    { id: 'C', committed: 500, folded: false },
  ])),
  '300[ABC] 800[BC]',
);

// 蓋牌者的錢要留在池子裡，但他沒資格分
check(
  '蓋牌者的籌碼留在池中',
  potShape(buildPots([
    { id: 'A', committed: 50, folded: true },
    { id: 'B', committed: 200, folded: false },
    { id: 'C', committed: 200, folded: false },
  ])),
  '150[BC] 300[BC]',
);

// 三層邊池
check(
  '三層邊池',
  potShape(buildPots([
    { id: 'A', committed: 100, folded: false },
    { id: 'B', committed: 300, folded: false },
    { id: 'C', committed: 600, folded: false },
  ])),
  '300[ABC] 400[BC] 300[C]',
);

// 平手分池：除不盡的零頭給位置最前的人
const split = settlePots([{ amount: 101, eligible: ['A', 'B'] }], new Map([['A', 5], ['B', 5]]), ['B', 'A']);
check('平手分池 B 先拿零頭', split.get('B'), 51);
check('平手分池 A 拿剩下', split.get('A'), 50);

// 邊池贏家與主池贏家可以不同人
const multi = settlePots(
  [
    { amount: 300, eligible: ['A', 'B', 'C'] },
    { amount: 800, eligible: ['B', 'C'] },
  ],
  new Map([['A', 9], ['B', 5], ['C', 7]]),
  ['A', 'B', 'C'],
);
check('主池給全下的 A', multi.get('A'), 300);
check('邊池給牌力次大的 C', multi.get('C'), 800);
check('B 什麼都沒拿', multi.get('B'), undefined);

// --- 完整牌局模擬：隨機動作跑很多手，驗證籌碼永遠守恆 ---
function randomHand(playerCount: number, seedChips: number[]): string | null {
  const table = new PokerTable();
  const ids = ['P0', 'P1', 'P2', 'P3', 'P4'].slice(0, playerCount);
  ids.forEach((id, i) => table.sit(i, { id, name: id, isNpc: false, chips: seedChips[i] }));
  const before = table.occupied().reduce((s, x) => s + x.chips, 0);

  let now = 1000;
  table.startHand(now);
  if (table.street === 'idle') return null; // 人數不足，不算一手

  let guard = 0;
  while (table.street !== 'idle') {
    if (++guard > 500) return '牌局沒有結束（可能卡在某個狀態）';
    if (table.toAct >= 0) {
      const seat = table.seats[table.toAct]!;
      const toCall = table.callAmount(seat);
      const { min, max } = table.raiseBounds(seat);
      const choices: [ActionKind, number][] = [];
      choices.push(['fold', 0]);
      if (toCall === 0) choices.push(['check', 0]);
      if (toCall > 0) choices.push(['call', 0]);
      if (max > table.currentBet && seat.chips > 0) {
        choices.push(['raise', min]);
        choices.push(['raise', max]); // 全下
      }
      const [action, amount] = choices[Math.floor(Math.random() * choices.length)];
      now += 10;
      if (!table.act(seat.id, action, amount, now)) return `合法動作被拒絕：${action} ${amount}`;
    } else {
      now = table.deadline + 1;
      table.tick(now);
    }
  }

  const after = table.occupied().reduce((s, x) => s + x.chips, 0);
  if (after !== before) return `籌碼不守恆：開始 ${before}、結束 ${after}`;
  if (table.occupied().some((s) => s.chips < 0)) return '出現負籌碼';
  return null;
}

let simFail = 0;
for (let i = 0; i < 4000; i++) {
  const n = 2 + (i % 4); // 2～5 人輪流
  const chips = Array.from({ length: n }, () => (i % 7 === 0 ? 40 + Math.floor(Math.random() * 120) : POKER.buyIn));
  const err = randomHand(n, chips);
  if (err) {
    console.log(`✗ 模擬第 ${i} 手（${n} 人）：${err}`);
    simFail++;
    if (simFail > 3) break;
  }
}
check('四千手隨機牌局籌碼守恆', simFail, 0);

console.log(fail === 0 ? '✓ 牌局引擎通過' : `✗ 牌局引擎 ${fail} 項失敗`);

// ---------------------------------------------------------------------------
// NPC：勝率估計與整桌自動對打
// ---------------------------------------------------------------------------
import { estimateEquity, decide, POKER_NPCS } from '../server/src/rooms/pokerAi';

/** 勝率估計要對得上公認數字，否則 AI 的每個判斷都是歪的 */
function near(name: string, got: number, want: number, tol: number) {
  if (Math.abs(got - want) > tol) { console.log(`✗ ${name}: 得到 ${(got * 100).toFixed(1)}%，應約 ${(want * 100).toFixed(1)}%`); fail++; }
}
near('AA 對單一對手', estimateEquity(hand('As', 'Ah'), [], 1, 8000), 0.852, 0.02);
near('72o 對單一對手', estimateEquity(hand('7s', '2h'), [], 1, 8000), 0.354, 0.025);
near('AA 對四個對手', estimateEquity(hand('As', 'Ah'), [], 4, 8000), 0.558, 0.03);
near('河牌堅果同花必勝', estimateEquity(hand('As', 'Ks'), hand('Qs', 'Js', 'Ts', '3h', '2d'), 3, 2000), 1.0, 0.001);

// 整桌 NPC 自動對打：不卡住、籌碼守恆
let npcFail = 0;
for (let round = 0; round < 60; round++) {
  const table = new PokerTable();
  for (let i = 0; i < 4; i++) table.sit(i, { id: `N${i}`, name: POKER_NPCS[i].name, isNpc: true, chips: POKER.buyIn });
  const before = table.occupied().reduce((s, x) => s + x.chips, 0);
  let now = 1000;
  table.startHand(now);
  let guard = 0;
  while (table.street !== 'idle' && ++guard < 400) {
    if (table.toAct >= 0) {
      const seat = table.seats[table.toAct]!;
      const d = decide(table, seat, POKER_NPCS[Number(seat.id.slice(1))]);
      now += 10;
      if (!table.act(seat.id, d.action, d.amount, now)) { console.log(`✗ NPC 動作被拒：${d.action} ${d.amount}`); npcFail++; break; }
    } else { now = table.deadline + 1; table.tick(now); }
  }
  if (guard >= 400) { console.log('✗ NPC 牌局沒有結束'); npcFail++; }
  const after = table.occupied().reduce((s, x) => s + x.chips, 0);
  if (after !== before) { console.log(`✗ NPC 牌局籌碼不守恆：${before} → ${after}`); npcFail++; }
  if (npcFail > 2) break;
}
check('NPC 自動對打', npcFail, 0);

console.log(fail === 0 ? '✓ NPC 通過' : `✗ NPC ${fail} 項失敗`);

console.log(fail === 0 ? '✓ 全部通過' : `✗ 共 ${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
