/**
 * 德州撲克：牌的表示、洗牌與牌型評估。
 *
 * 純函式、不依賴任何執行環境，前後端共用——伺服端拿來結算，前端拿來顯示
 * 「你現在是什麼牌」。真正的牌局狀態（誰拿到什麼）只存在伺服端。
 *
 * 一張牌是 0～51 的整數：`rank = card % 13`（0 是 2、12 是 A），
 * `suit = (card / 13) | 0`。用整數是因為要在網路上傳、要進 Set 比對，
 * 物件在這兩件事上都只是多餘的包裝。
 */

/** 牌面大小：索引 0 是 2、索引 12 是 A */
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
/** 花色：♠♥♦♣，順序即 suit 值 */
export const SUIT_LABELS = ['♠', '♥', '♦', '♣'] as const;

export const DECK_SIZE = 52;

export function rankOf(card: number): number {
  return card % 13;
}

export function suitOf(card: number): number {
  return (card / 13) | 0;
}

/** 顯示用的牌面，例如 `A♠`、`10♥` */
export function cardLabel(card: number): string {
  return `${RANK_LABELS[rankOf(card)]}${SUIT_LABELS[suitOf(card)]}`;
}

/** 紅色花色（♥♦）要用紅字印 */
export function isRedCard(card: number): boolean {
  const s = suitOf(card);
  return s === 1 || s === 2;
}

export function makeDeck(): number[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/**
 * Fisher-Yates 洗牌（原地）。
 *
 * `rand` 要回傳 [0, n) 的整數。伺服端務必傳入 crypto 的亂數：牌局結果牽涉到
 * 玩家的金幣，Math.random 的序列在同一個 process 內是可預測的。
 */
export function shuffle(deck: number[], rand: (n: number) => number): number[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/** 牌型分類，數字越大越好 */
export const HAND_CATEGORY = {
  highCard: 0,
  pair: 1,
  twoPair: 2,
  trips: 3,
  straight: 4,
  flush: 5,
  fullHouse: 6,
  quads: 7,
  straightFlush: 8,
} as const;

export type HandCategory = (typeof HAND_CATEGORY)[keyof typeof HAND_CATEGORY];

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HAND_CATEGORY.highCard]: '高牌',
  [HAND_CATEGORY.pair]: '一對',
  [HAND_CATEGORY.twoPair]: '兩對',
  [HAND_CATEGORY.trips]: '三條',
  [HAND_CATEGORY.straight]: '順子',
  [HAND_CATEGORY.flush]: '同花',
  [HAND_CATEGORY.fullHouse]: '葫蘆',
  [HAND_CATEGORY.quads]: '四條',
  [HAND_CATEGORY.straightFlush]: '同花順',
};

export interface HandResult {
  /** 可直接比大小的分數，越大越好；相等代表平手（要分池） */
  score: number;
  category: HandCategory;
  /** 組成這手牌的五張牌，用來在結算畫面把牌亮出來 */
  best: number[];
}

/**
 * 把「分類 + 由大到小的關鍵牌面」壓成一個整數分數。
 *
 * 每個欄位佔 4 bits（牌面 0～12 塞得下），最多五個欄位，加上分類共 24 bits，
 * 遠在 Number 的安全整數範圍內，所以可以直接用 `>` 比大小、用 `===` 判平手。
 */
function makeScore(category: HandCategory, keys: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (keys[i] ?? 0);
  return score;
}

/**
 * 五張牌的牌型。輸入必須剛好五張。
 *
 * 順子的特例是 A-2-3-4-5（俗稱輪子）：A 在這裡當 1 用，所以它的關鍵牌面是 5
 * 而不是 A，否則會被誤判成最大的順子。
 */
function evaluate5(cards: number[]): HandResult {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  // 牌面 → 張數；再依「張數優先、牌面其次」排序，就是比大小要用的關鍵牌順序
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n);
  const keys = groups.map(([r]) => r);

  const distinct = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = -1;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    // 輪子：A(12) 5 4 3 2 → 當成以 5 為首的順子
    else if (distinct[0] === 12 && distinct[1] === 3 && distinct[4] === 0) straightHigh = 3;
  }

  if (isFlush && straightHigh >= 0) return { score: makeScore(HAND_CATEGORY.straightFlush, [straightHigh]), category: HAND_CATEGORY.straightFlush, best: cards };
  if (shape[0] === 4) return { score: makeScore(HAND_CATEGORY.quads, keys), category: HAND_CATEGORY.quads, best: cards };
  if (shape[0] === 3 && shape[1] === 2) return { score: makeScore(HAND_CATEGORY.fullHouse, keys), category: HAND_CATEGORY.fullHouse, best: cards };
  if (isFlush) return { score: makeScore(HAND_CATEGORY.flush, ranks), category: HAND_CATEGORY.flush, best: cards };
  if (straightHigh >= 0) return { score: makeScore(HAND_CATEGORY.straight, [straightHigh]), category: HAND_CATEGORY.straight, best: cards };
  if (shape[0] === 3) return { score: makeScore(HAND_CATEGORY.trips, keys), category: HAND_CATEGORY.trips, best: cards };
  if (shape[0] === 2 && shape[1] === 2) return { score: makeScore(HAND_CATEGORY.twoPair, keys), category: HAND_CATEGORY.twoPair, best: cards };
  if (shape[0] === 2) return { score: makeScore(HAND_CATEGORY.pair, keys), category: HAND_CATEGORY.pair, best: cards };
  return { score: makeScore(HAND_CATEGORY.highCard, ranks), category: HAND_CATEGORY.highCard, best: cards };
}

/** 5 取 5 的組合索引（C(7,5) = 21 組，列舉比任何聰明寫法都不容易寫錯） */
const COMBOS_7_5: number[][] = (() => {
  const out: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e]);
  return out;
})();

/**
 * 從 5～7 張牌裡挑出最好的五張。
 *
 * 一手牌只會評估幾次，21 組全部算完也只是幾十次比較，所以直接暴力列舉，
 * 不做任何提前剪枝——這段程式算錯就是算錯誰拿走底池，簡單比快重要。
 */
export function evaluateHand(cards: number[]): HandResult {
  if (cards.length === 5) return evaluate5(cards);
  if (cards.length < 5) throw new Error(`評估牌型至少要五張，收到 ${cards.length} 張`);

  let best: HandResult | null = null;
  if (cards.length === 7) {
    for (const combo of COMBOS_7_5) {
      const hand = evaluate5([cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]]]);
      if (!best || hand.score > best.score) best = hand;
    }
    return best!;
  }

  // 六張（理論上用不到，但不想讓這個函式在邊界上丟例外）
  for (let skip = 0; skip < cards.length; skip++) {
    const five = cards.filter((_, i) => i !== skip);
    const hand = evaluateHand(five);
    if (!best || hand.score > best.score) best = hand;
  }
  return best!;
}

/** 牌型的中文名稱，給 UI 用 */
export function handName(result: HandResult): string {
  return CATEGORY_NAMES[result.category];
}
