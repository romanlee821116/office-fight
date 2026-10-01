import { DECK_SIZE, evaluateHand } from '@office/shared';
import { randomInt } from 'node:crypto';
import type { ActionKind, PokerTable, Seat } from './pokerTable';

/**
 * 牌桌 NPC 的決策。
 *
 * 用蒙地卡羅估勝率再跟底池賠率比，而不是寫一張起手牌表——表要寫對很花工夫，
 * 而且在這種同事之間的牌桌上，AI 強不強遠不如「每個人打法不一樣」來得有趣。
 * 個性就是三個係數：跟得鬆不鬆、加注兇不兇、會不會沒牌亂吹。
 */

export interface Personality {
  name: string;
  /** 對應 AVATARS 的 id；名字與外觀要一致，老周就該長老周的樣子 */
  avatarId: string;
  /** 跟注門檻的折扣：越小越鬆（什麼牌都想看） */
  looseness: number;
  /** 手上有牌時加注的機率 */
  aggression: number;
  /** 沒牌也下注的機率 */
  bluff: number;
  /** 牌桌上的碎碎念 */
  lines: string[];
}

/**
 * 四個同事，個性刻意拉開：遇到丁oe 要敢跟，遇到老周要信他的加注。
 * 名字沿用員工福利社那套便服的角色名，不另外造人設。
 */
export const POKER_NPCS: Personality[] = [
  {
    name: '丁oe',
    avatarId: 'boss',
    looseness: 0.45,
    aggression: 0.55,
    bluff: 0.3,
    lines: ['這把我跟定了', '不信邪', '再一把就回本', '你們是不是都有牌'],
  },
  {
    name: '老周',
    avatarId: 'chou',
    looseness: 1.25,
    aggression: 0.5,
    bluff: 0.04,
    lines: ['我只玩大牌', '這手不行', '穩一點好'],
  },
  {
    name: '艾莉',
    avatarId: 'ally',
    looseness: 0.95,
    aggression: 0.75,
    bluff: 0.22,
    lines: ['加一點', '你敢跟嗎', '我覺得你在吹'],
  },
  {
    name: '阿凱',
    avatarId: 'kai',
    looseness: 0.8,
    aggression: 0.35,
    bluff: 0.1,
    lines: ['跟', '再看一張', '算了算了'],
  },
];

/**
 * 蒙地卡羅估勝率：隨機補滿對手底牌與剩下的公共牌，看自己贏多少次。
 * 平手算半勝，否則 AI 會在明顯該分池的局面上過度自信。
 */
export function estimateEquity(hole: number[], board: number[], opponents: number, iterations: number): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board]);
  const deck: number[] = [];
  for (let c = 0; c < DECK_SIZE; c++) if (!known.has(c)) deck.push(c);

  let score = 0;
  const need = 5 - board.length;
  for (let iter = 0; iter < iterations; iter++) {
    // 部分洗牌：只打亂要用到的前幾張，不必每次洗整副
    const draw = opponents * 2 + need;
    for (let i = 0; i < draw; i++) {
      const j = i + randomInt(deck.length - i);
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    const fullBoard = [...board];
    for (let i = 0; i < need; i++) fullBoard.push(deck[i]);
    const mine = evaluateHand([...hole, ...fullBoard]).score;

    let best = -1;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const a = deck[need + o * 2];
      const b = deck[need + o * 2 + 1];
      const s = evaluateHand([a, b, ...fullBoard]).score;
      if (s > best) {
        best = s;
        ties = 1;
      } else if (s === best) ties++;
    }
    if (mine > best) score += 1;
    else if (mine === best) score += 1 / (ties + 1);
  }
  return score / iterations;
}

export interface Decision {
  action: ActionKind;
  amount: number;
  /** 偶爾說一句話，讓牌桌不會安安靜靜 */
  say?: string;
}

/**
 * 決定一個動作。
 *
 * 核心只有一句：勝率有沒有高過底池賠率。其餘都是讓它看起來像人——
 * 牌很好時不會每次都加注、沒牌時偶爾吹一把、面對全下時門檻拉高。
 */
export function decide(table: PokerTable, seat: Seat, persona: Personality): Decision {
  const opponents = table
    .occupied()
    .filter((s) => s.id !== seat.id && s.inHand && !s.folded).length;
  if (opponents === 0) return { action: 'check', amount: 0 };

  const toCall = table.callAmount(seat);
  const pot = table.occupied().reduce((sum, s) => sum + s.committed, 0);
  // 翻牌前牌面資訊少，多跑一些次數讓估計穩一點
  const iterations = table.board.length === 0 ? 320 : 220;
  const equity = estimateEquity(seat.hole, table.board, opponents, iterations);

  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  // looseness 越小，要求的勝率越低（越愛跟）
  const threshold = potOdds * persona.looseness;
  const { min, max } = table.raiseBounds(seat);
  const canRaise = max > table.currentBet && seat.chips > 0;
  const say = randomInt(100) < 12 ? persona.lines[randomInt(persona.lines.length)] : undefined;

  // 很強的牌：多半加注，偶爾裝弱等人上鉤
  if (equity > 0.72 && canRaise && randomInt(100) < persona.aggression * 100) {
    const sized = Math.min(max, Math.max(min, Math.floor(seat.bet + toCall + pot * (0.5 + Math.random() * 0.4))));
    return { action: 'raise', amount: sized, say };
  }
  if (toCall === 0) {
    // 沒人下注：有點牌就下，沒牌偶爾吹一把
    const shouldBet = equity > 0.55 ? randomInt(100) < persona.aggression * 100 : randomInt(100) < persona.bluff * 100;
    if (shouldBet && canRaise) {
      const sized = Math.min(max, Math.max(min, Math.floor(pot * (0.35 + Math.random() * 0.35))));
      return { action: 'raise', amount: sized, say };
    }
    return { action: 'check', amount: 0, say };
  }
  // 要跟的錢超過手上一半，門檻再拉高一點（短碼不亂送）
  const pressure = toCall >= seat.chips * 0.5 ? 1.25 : 1;
  if (equity >= threshold * pressure) return { action: 'call', amount: 0, say };
  // 牌不行但偶爾詐唬一把
  if (canRaise && randomInt(100) < persona.bluff * 100) {
    const sized = Math.min(max, Math.max(min, Math.floor(seat.bet + toCall + pot * 0.6)));
    return { action: 'raise', amount: sized, say };
  }
  return { action: 'fold', amount: 0, say };
}
