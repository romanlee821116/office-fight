/**
 * 牌桌整合層驗證：NPC 補位、事件轉播、schema 同步與帳務平衡。
 *
 * 放在 server/scripts 而不是根目錄的 scripts，是因為這支會 import Colyseus schema，
 * 而那些 @type 裝飾器需要 server/tsconfig.json 的 experimentalDecorators 設定。
 * 純規則的驗證（牌型、下注輪、邊池）在 scripts/poker-check.mts。
 *
 *   npx tsx server/scripts/poker-room-check.mts
 */
import { POKER, POKER_SEATS, type PokerEventPayload } from '@office/shared';
import { PokerRoom } from '../src/rooms/pokerRoom';
import { OfficeState, Player } from '../src/rooms/schema';

let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.log(`✗ ${name}: 得到 ${got}，應為 ${want}`);
    fail++;
  }
}

/** 假時鐘：測試自己決定時間往前跳多少，不必真的等 NPC 想牌 */
let clock = 1_000_000;

const state = new OfficeState();
const me = new Player();
me.id = 'ME';
me.name = '我';
me.coins = 5000;
me.hp = 200;
// 站到第一個座位旁，否則會被「離座位太遠」擋下來
me.x = POKER_SEATS[0].x;
me.z = POKER_SEATS[0].z;

let charged = 0;
let settled = 0;
const sent: PokerEventPayload[] = [];
const room = new PokerRoom(state, {
  player: (id) => (id === 'ME' ? me : undefined),
  isMember: () => true,
  charge: async (_id, amount) => {
    charged += amount;
    me.coins -= amount;
    return true;
  },
  settle: async (_id, amount) => {
    settled += amount;
    me.coins += amount;
  },
  send: (_id, payload) => sent.push(payload),
  broadcastEvent: (payload) => sent.push(payload),
  system: () => {},
  prepareForSeat: () => {},
}, () => clock);

await room.sit('ME', 0);
check('入座扣了買入', charged, POKER.buyIn);
check('入座後 seatId 設定正確', me.seatId, POKER_SEATS[0].id);
check('NPC 補位到四人', state.pokerSeats.filter((s) => s.id !== '').length, POKER.npcFillTo);
check('其中三個是 NPC', state.pokerSeats.filter((s) => s.isNpc).length, POKER.npcFillTo - 1);
check('NPC 有角色外觀', state.pokerSeats.filter((s) => s.isNpc && s.avatarId !== '').length, POKER.npcFillTo - 1);

// 替真人自動打：永遠跟到底，確保會走到攤牌
let handsPlayed = 0;
let guard = 0;
let sawBoard = false;
let sawHole = false;
let sawShowdown = false;
let boardLeak = false;
let bustedOut = false;
while (handsPlayed < 8 && guard++ < 6000) {
  // 永遠跟注的打法很容易輸光，輸光會被自動請下桌——那也是要驗證的行為之一
  if (state.pokerSeats.findIndex((s) => s.id === 'ME') < 0) {
    bustedOut = true;
    break;
  }
  room.tick();
  if (state.pokerBoard.length >= 3) sawBoard = true;
  // 翻牌前不該有公共牌：新的一手要是沒把上一手的牌收掉，這裡會抓到
  if (state.pokerStreet === 'preflop' && state.pokerBoard.length > 0) boardLeak = true;
  if (sent.some((e) => e.kind === 'hole' && e.cards.length === 2)) sawHole = true;
  if (sent.some((e) => e.kind === 'showdown')) sawShowdown = true;
  const mySeat = state.pokerSeats.findIndex((s) => s.id === 'ME');
  if (state.pokerToAct === mySeat && mySeat >= 0) {
    const seat = state.pokerSeats[mySeat];
    room.act('ME', state.pokerCurrentBet > seat.bet ? 'call' : 'check', 0);
  } else {
    // 沒輪到自己就把時鐘往前撥，跳過 NPC 思考與發牌停頓
    clock += 300;
  }
  if (state.pokerStreet === 'idle' && state.pokerResult) {
    handsPlayed++;
    state.pokerResult = '';
    // 結算畫面要人自己關掉才會開下一手
    room.continueHand('ME');
  }
}
check('至少打完一手', handsPlayed >= 1, true);
check('有走到攤牌', sawShowdown, true);
check('翻牌前沒有殘留的公共牌', boardLeak, false);
// 要嘛打滿預定手數，要嘛是籌碼輸光被請下桌，不該有第三種停法
check('牌局正常收尾', handsPlayed >= 8 || bustedOut, true);
check('底牌有私訊給本人', sawHole, true);
check('公共牌有發出來', sawBoard, true);
check('有動作播報', sent.some((e) => e.kind === 'action'), true);

// 結算畫面沒關掉之前不該開下一手：牌一亮就被收走的話根本看不到誰是什麼牌
// bustedOut 只在迴圈中途抓得到；最後一手才輸光的話旗標來不及設，所以直接看座位還在不在
const atTable = state.pokerSeats.findIndex((s) => s.id === 'ME') >= 0;
if (atTable) {
  // 先等新的一手開起來，否則下面的迴圈會因為已經在 idle 而整個跳過
  let g1 = 0;
  while (state.pokerStreet === 'idle' && g1++ < 300) {
    clock += 300;
    room.tick();
  }
  check('繼續之後新的一手有開起來', state.pokerStreet !== 'idle', true);
  // 打到這手結束，這次不按繼續
  let g2 = 0;
  while (state.pokerStreet !== 'idle' && g2++ < 2000) {
    const mySeat = state.pokerSeats.findIndex((s) => s.id === 'ME');
    if (state.pokerToAct === mySeat && mySeat >= 0) {
      const seat = state.pokerSeats[mySeat];
      room.act('ME', state.pokerCurrentBet > seat.bet ? 'call' : 'check', 0);
    } else clock += 300;
    room.tick();
  }
  // 這手剛好輸光被請下桌的話就沒什麼好等的了——離座的人本來就不該卡住牌桌
  const stillSeated = state.pokerSeats.findIndex((s) => s.id === 'ME') >= 0;
  if (stillSeated) {
    // 時間往前撥得夠開好幾手，但沒按繼續就該一直停在 idle
    for (let i = 0; i < 40; i++) {
      clock += 400;
      room.tick();
    }
    check('沒按繼續就不開下一手', state.pokerStreet, 'idle');
    room.continueHand('ME');
    for (let i = 0; i < 40; i++) {
      clock += 400;
      room.tick();
    }
    check('按了繼續就會開下一手', state.pokerStreet !== 'idle', true);
  }
}

// 帳務：不論是自己離座還是輸光被請下桌，「買入 - 歸還」都要等於桌上少掉的籌碼
if (atTable) {
  const chipsOnTable = state.pokerSeats.find((s) => s.id === 'ME')?.chips ?? 0;
  const coinsBefore = me.coins;
  await room.leave('ME');
  check('離座後起身', me.seatId, '');
  check('桌上籌碼全數歸還', me.coins, coinsBefore + chipsOnTable);
  check('帳務平衡（買入 - 歸還 = 淨輸贏）', charged - settled, POKER.buyIn - chipsOnTable);
} else {
  check('輸光後已離座', state.pokerSeats.findIndex((s) => s.id === 'ME'), -1);
  check('輸光後起身', me.seatId, '');
  check('輸光等於買入全沒了', charged - settled, POKER.buyIn);
  check('金幣回到買入前的水位（扣掉輸掉的）', me.coins, 5000 - POKER.buyIn);
}

// --- NPC 開關：關掉之後桌上該只剩真人，開回來要補滿 ---
{
  let clock2 = 2_000_000;
  const st = new OfficeState();
  const p2 = new Player();
  p2.id = 'ME2';
  p2.name = '我二';
  p2.coins = 5000;
  p2.hp = 200;
  p2.x = POKER_SEATS[0].x;
  p2.z = POKER_SEATS[0].z;
  const room2 = new PokerRoom(st, {
    player: (id) => (id === 'ME2' ? p2 : undefined),
    isMember: () => true,
    charge: async (_id, amt) => {
      p2.coins -= amt;
      return true;
    },
    settle: async (_id, amt) => {
      p2.coins += amt;
    },
    send: () => {},
    broadcastEvent: () => {},
    system: () => {},
    prepareForSeat: () => {},
  }, () => clock2);

  await room2.sit('ME2', 0);
  check('開關前有 NPC 陪打', st.pokerSeats.filter((x) => x.isNpc).length, POKER.npcFillTo - 1);

  // 牌局還沒開始，關掉應該立刻生效
  room2.setNpcs('ME2', false);
  check('關掉後 NPC 全部離席', st.pokerSeats.filter((x) => x.isNpc).length, 0);
  check('自己還在桌上', st.pokerSeats.filter((x) => x.id === 'ME2').length, 1);
  check('schema 反映開關狀態', st.pokerNpcs, false);

  // 只剩一個人，牌局不該開始
  for (let i = 0; i < 50; i++) {
    room2.tick();
    clock2 += 500;
  }
  check('一個人時不會開局', st.pokerStreet, 'idle');

  room2.setNpcs('ME2', true);
  check('開回來後 NPC 補滿', st.pokerSeats.filter((x) => x.isNpc).length, POKER.npcFillTo - 1);
}

console.log(fail === 0 ? '✓ 全部通過' : `✗ 共 ${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);