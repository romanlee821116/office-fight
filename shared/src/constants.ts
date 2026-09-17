import type { NpcHazard } from './types';

/**
 * 房間邊界（公尺）。原本 24 x 16 的辦公室以原點為中心（x -12～12），
 * 右側再擴建 8m 作為健身房（x 12～20），因此 X 方向不對稱。
 */
export const ROOM_MIN_X = -12;
export const ROOM_MAX_X = 41;
export const ROOM_MIN_Z = -8;
export const ROOM_MAX_Z = 8;
export const ROOM_WIDTH = ROOM_MAX_X - ROOM_MIN_X;
export const ROOM_DEPTH = ROOM_MAX_Z - ROOM_MIN_Z;
export const ROOM_CENTER_X = (ROOM_MIN_X + ROOM_MAX_X) / 2;
/** 舊常數：辦公區半寬 / 半深，仍供辦公區家具座標與招牌使用 */
export const HALF_W = 12;
export const HALF_D = ROOM_DEPTH / 2;
export const WALL_HEIGHT = 3;
/** 健身房分隔牆所在的 X */
export const GYM_WALL_X = 12;
/** 室內（辦公室＋健身房）與戶外露台的分界 X */
export const TERRACE_WALL_X = 23;
/** 室內範圍（後牆、地板材質與雨雪排除用） */
export const INDOOR_MIN_X = ROOM_MIN_X;
export const INDOOR_MAX_X = TERRACE_WALL_X;

/**
 * 兒童遊戲區：從露台正前方（z = ROOM_MAX_Z）再往 +Z 延伸的一塊戶外場地，
 * 只佔露台那一段 X；左半邊 (x < PLAY_MIN_X, z 8~20) 由聖誕小鎮補滿。
 */
export const PLAY_MIN_X = TERRACE_WALL_X;
export const PLAY_MAX_X = ROOM_MAX_X;
export const PLAY_MIN_Z = ROOM_MAX_Z;
export const PLAY_MAX_Z = 20;
export const PLAY_CENTER_X = (PLAY_MIN_X + PLAY_MAX_X) / 2;
export const PLAY_CENTER_Z = (PLAY_MIN_Z + PLAY_MAX_Z) / 2;

/**
 * 遊樂園：兒童遊戲區再往 +Z 的一塊戶外場地，橫跨健身房與匹克球場的正後方。
 * 只佔 x >= PARK_MIN_X 那一段，左半邊 (x < PARK_MIN_X) 由打雪仗場地補滿。
 * 入口在兒童遊戲區南側圍籬的缺口（PARK_GATE_X）。
 */
export const PARK_MIN_X = GYM_WALL_X;
export const PARK_MAX_X = ROOM_MAX_X;
export const PARK_MIN_Z = PLAY_MAX_Z;
export const PARK_MAX_Z = 40;
export const PARK_CENTER_X = (PARK_MIN_X + PARK_MAX_X) / 2;
export const PARK_CENTER_Z = (PARK_MIN_Z + PARK_MAX_Z) / 2;
/** 從兒童遊戲區走進遊樂園的缺口中心與寬度 */
export const PARK_GATE_X = 30;
export const PARK_GATE_W = 4;

/**
 * 聖誕小鎮：辦公室／健身房正前方（z = ROOM_MAX_Z）那一整條，補滿兒童遊戲區左邊的空缺。
 * 走出辦公室大門就是小鎮，往南（+Z）穿過圍籬缺口即是打雪仗場地。
 */
export const XMAS_MIN_X = ROOM_MIN_X;
export const XMAS_MAX_X = PLAY_MIN_X;
export const XMAS_MIN_Z = ROOM_MAX_Z;
export const XMAS_MAX_Z = PLAY_MAX_Z;
export const XMAS_CENTER_X = (XMAS_MIN_X + XMAS_MAX_X) / 2;
export const XMAS_CENTER_Z = (XMAS_MIN_Z + XMAS_MAX_Z) / 2;

/**
 * 打雪仗場地：小鎮再往 +Z，與遊樂園並排的最後一塊，補滿後世界外框就是完整長方形。
 * 24 x 20m，和遊樂園（29 x 20m）同樣深、面積相當。
 */
export const SNOW_MIN_X = ROOM_MIN_X;
export const SNOW_MAX_X = PARK_MIN_X;
export const SNOW_MIN_Z = PLAY_MAX_Z;
export const SNOW_MAX_Z = PARK_MAX_Z;
export const SNOW_CENTER_X = (SNOW_MIN_X + SNOW_MAX_X) / 2;
export const SNOW_CENTER_Z = (SNOW_MIN_Z + SNOW_MAX_Z) / 2;
/** 從小鎮走進雪仗場地的缺口中心與寬度（開在 cabin-a 與 cabin-b 之間的巷子正下方） */
export const SNOW_GATE_X = -3.75;
export const SNOW_GATE_W = 4.5;
/**
 * 雪仗場地與遊樂園之間的缺口（開在東側圍籬 x = SNOW_MAX_X 上），讓兩塊場地直接互通。
 * z 選在旋轉木馬碰撞盒（到 z 30.5）與場地東南角那棵雪松（從 z 37.3 起）之間的空檔。
 */
export const SNOW_PARK_GATE_Z = 34;
export const SNOW_PARK_GATE_W = 4.5;

/** 世界外框：四塊場地拼起來剛好是 x -12~41、z -8~40 的長方形 */
export const WORLD_MIN_X = ROOM_MIN_X;
export const WORLD_MAX_X = ROOM_MAX_X;
export const WORLD_MIN_Z = ROOM_MIN_Z;
export const WORLD_MAX_Z = PARK_MAX_Z;

/** 玩家 */
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 3;
export const RUN_SPEED = 5;
export const SPAWN_POINT = { x: 0, z: HALF_D - 2 };

/** 互動 */
export const SEAT_INTERACT_DISTANCE = 1.4;
/** 起身後站到座位後方的距離 */
export const SEAT_STAND_OFFSET = 0.8;
export const EMOTE_DURATION_MS = 1400;

/** 格鬥模式 */
export const FIGHT = {
  /** 200 / 25 = 8 拳倒地 */
  maxHp: 200,
  damage: 25,
  /** 攻擊判定距離（中心到中心） */
  range: 1.5,
  /** 扇形半角 55° 的 cos */
  coneCos: Math.cos((55 * Math.PI) / 180),
  cooldownMs: 600,
  /** 攻擊動畫長度（attack-melee-right 0.42s） */
  attackAnimMs: 420,
  knockback: 1.5,
  knockbackMs: 250,
  staggerMs: 350,
  respawnMs: 3000,
};

/**
 * 打雪仗。場地就是 SNOW_*（x -12～12、z 20～40），中線 z = SNOW_CENTER_Z：
 * 北半場歸紅隊、南半場歸藍隊（只是報名點的位置，不限制誰能站哪邊）。
 *
 * 雪仗模式是一個獨立於格鬥模式的狀態：手上只會有雪球、只打得到同樣在雪仗模式的人、
 * 而且走不出場地。血量沿用 FIGHT.maxHp，但歸零不是倒地而是「出局」。
 */
export const SNOWFIGHT = {
  /** 一次最多帶幾顆雪球（剛好等於打倒一個人所需的顆數，所以一輪彈藥最多解決一個對手） */
  maxBalls: 5,
  /** 一顆的傷害：滿血 FIGHT.maxHp（200），五顆出局 */
  damage: 40,
  /** 走到雪堆旁按 E 補滿，以及兩次補彈之間的最短間隔 */
  pileRange: 1.8,
  reloadCooldownMs: 600,
  /**
   * 報名點：紅隊在北側入口內、藍隊在南側底線。
   * 兩個點都避開了既有的雪人、雪橇與拐杖糖裝飾（見 christmasTownModel 的 decorations）。
   */
  slotRed: { x: 3, z: 21.5 },
  slotBlue: { x: -3, z: 38.5 },
  joinRange: 1.4,
  /** 兩隊都有人之後的開賽倒數 */
  countdownMs: 5000,
  /** 分出勝負後結算畫面停留多久才清場 */
  overResetMs: 5000,
};

/** 隊伍顏色：地上的隊伍圈與 HUD 共用同一組色票 */
export const SNOW_TEAM_COLOR = { red: '#D9534F', blue: '#3E8ED0' } as const;
export const SNOW_TEAM_LABEL = { red: '紅隊', blue: '藍隊' } as const;

/** 座標是否落在雪仗場地內（margin 為往外放寬的公尺數） */
export function inSnowArena(x: number, z: number, margin = 0): boolean {
  return x >= SNOW_MIN_X - margin && x <= SNOW_MAX_X + margin && z >= SNOW_MIN_Z - margin && z <= SNOW_MAX_Z + margin;
}

/**
 * 這個人是不是被關在雪仗場地裡。
 *
 * 只有**分隊比賽**的人走不出去（不然可以躲出場外賴皮）；自由模式想走就走，
 * 走出場地由伺服端的 tickSnowArena 自動退出雪仗模式。
 */
export function snowConfined(snowMode: boolean, snowTeam: string): boolean {
  return snowMode && snowTeam !== '';
}

/**
 * 把座標夾回雪仗場地（留出玩家半徑）。場地四周除了北側那個通往小鎮的缺口都有碰撞盒，
 * 所以這個夾制實際上只在缺口生效。前後端共用同一條，才不會一邊走得出去一邊被拉回來。
 */
export function clampToSnowArena(x: number, z: number, r: number = PLAYER_RADIUS): { x: number; z: number } {
  return {
    x: x < SNOW_MIN_X + r ? SNOW_MIN_X + r : x > SNOW_MAX_X - r ? SNOW_MAX_X - r : x,
    z: z < SNOW_MIN_Z + r ? SNOW_MIN_Z + r : z > SNOW_MAX_Z - r ? SNOW_MAX_Z - r : z,
  };
}

/** 地上武器生成 */
export const PICKUPS = {
  /** 同時最多幾把在地上 */
  max: 4,
  /** 開場先放幾把 */
  initial: 2,
  intervalMs: 20000,
  interactDistance: 1.4,
  /** 生成範圍（避開牆邊，含健身房；不進露台） */
  area: { minX: -11, maxX: 22, minZ: -7, maxZ: 7 },
  /** 與其他道具 / 玩家的最小距離 */
  clearance: 1.5,
  /** 投射物命中判定的走廊半寬 */
  corridorHalfWidth: 1,
  /** 投擲拋物線最高點 */
  throwArcHeight: 1.4,
  /** 廚房吧檯上的可頌被拿走後，多久檢查一次要不要補上 */
  kitchenRestockMs: 5000,
};

/** 辦公室寵物：伺服端 AI 隨機走動 / 停頓 / 跳舞，可被攻擊，死亡後重生新的一隻 */
export const PET = {
  /** 同時在場數量 */
  count: 3,
  maxHp: 100,
  /** 模型縮放（原始約 1.6～1.8 單位高） */
  scale: 0.45,
  /** 碰撞半徑 */
  radius: 0.3,
  walkSpeed: 1.3,
  aiTickMs: 100,
  /** 停頓時間範圍 */
  idleMs: [2000, 5000] as [number, number],
  danceMs: [4000, 8000] as [number, number],
  /** 走一段路的放棄時限 */
  walkTimeoutMs: 12000,
  /** 每次散步的最遠距離 */
  wanderDist: 6,
  /** 被打後的僵直 */
  staggerMs: 600,
  /** 倒地屍體停留時間 */
  deadMs: 2500,
  /** 死亡到新寵物出生的間隔 */
  respawnMs: 8000,
  /** 寵物比較輕，擊退距離倍率 */
  knockbackFactor: 1.4,
  /** 活動範圍（含健身房與戶外露台） */
  area: { minX: -11, maxX: 39, minZ: -7, maxZ: 7 },
  /** 名牌高度 */
  tagHeight: 1.15,
  /** 最多餵幾次；餵滿時體型為兩倍 */
  feedMax: 5,
  /** 抱起的互動距離 */
  pickupRange: 1.5,
  /** 抱著時寵物在頭頂的高度 */
  carryY: 1.8,
  /** 丟出距離與速度 */
  throwDist: 6,
  throwSpeed: 9,
  /** 拋物線最高點 */
  throwArc: 1.3,
  /** 落地後生氣抖動的時間 */
  landStaggerMs: 1200,
};

/**
 * 辦公室路人：固定一位，伺服端 AI 隨機走動，附近有人時會轉過去說一句話。
 * 可以被攻擊（打倒後躺一會兒再站起來），但他不會攻擊任何人。
 */
export const NPC = {
  /** 場上唯一，前端拿它當名牌與對話泡泡的 key */
  id: 'npc-passerby',
  name: 'NPC',
  /** 借用玩家的角色模型 */
  avatarId: 'chou',
  maxHp: 1000,
  radius: 0.35,
  walkSpeed: 1.1,
  aiTickMs: 100,
  /** 停下來發呆的時間範圍 */
  idleMs: [2500, 6000] as [number, number],
  /** 走一段路的放棄時限 */
  walkTimeoutMs: 12000,
  /** 每次散步的最遠距離 */
  wanderDist: 8,
  /** 被打後的僵直 */
  staggerMs: 600,
  /** 倒下到再站起來的間隔 */
  respawnMs: 10000,
  /** 活動範圍（與寵物相同，含健身房與戶外露台） */
  area: { minX: -11, maxX: 39, minZ: -7, maxZ: 7 },
  /** 名牌高度 */
  tagHeight: 2.1,
  /** 多近才算「旁邊有人可以講話」 */
  speakRange: 7,
  /** 兩句話之間的間隔 */
  speakGapMs: [3000, 7000] as [number, number],
  /** 說話時揮手的動作長度 */
  speakAnimMs: 1200,
  /** 走近多少距離可以把他扛起來 */
  pickupRange: 1.6,
  /** 被拖著時，頭離拖的人多遠（人躺在他身後） */
  dragDist: 0.75,
  /** 被拖著時上半身被提起來的角度（rad，0 = 完全躺平、π/2 = 站著） */
  dragPitch: 1.25,
  /** 角色模型的頭頂高度，用來把頭對準爐面／水面 */
  headY: 1.7,
  /** 被押住時整個人被倒提過來的前傾角（rad，超過 90° 就是頭朝下） */
  pinPitch: 2.6,
  /** 押在火裡／水裡時每次結算的傷害與間隔（1000 血約撐 8 秒） */
  pinDamage: 60,
  hazardTickMs: 500,
  /** 掙扎抖動的幅度與週期 */
  struggleAmp: 0.06,
  struggleMs: 130,
  /** 放開後的僵直（爬起來喘一下） */
  releaseStaggerMs: 1200,
};

/** 站在 (x, z) 時最近的可用危險區；都搆不到就是 null */
export function findNpcHazard(x: number, z: number): NpcHazard | null {
  let best: NpcHazard | null = null;
  let bestDist = Infinity;
  for (const key of Object.keys(NPC_HAZARDS) as NpcHazard[]) {
    const h = NPC_HAZARDS[key];
    const dist = Math.hypot(h.x - x, h.z - z);
    if (dist > h.range || dist >= bestDist) continue;
    best = key;
    bestDist = dist;
  }
  return best;
}

/** 被按在爐火上時的求饒台詞 */
export const NPC_FIRE_LINES = ['幹好燙好燙好燙', '我支持你，但這樣我會熟', '我不支持這個！', '我支持放開我'];

/** 被壓進水裡時的求饒台詞（嘴巴在水裡，講不清楚） */
export const NPC_WATER_LINES = ['幹咕嚕咕嚕咕嚕...', '我支持你，但我不會游泳', '我不支持這個！咕嚕', '我支持放開我…咕嚕'];

/** 依危險區挑一份求饒台詞 */
export const NPC_PIN_LINES: Record<NpcHazard, readonly string[]> = {
  stove: NPC_FIRE_LINES,
  pond: NPC_WATER_LINES,
};

/** 路人的台詞，每次隨機挑一句（不會連說同一句） */
export const NPC_LINES = ['我支持你們，但JOE說不行', '我支持你們的支持', '我支持你說話', '我支持你們，但我真沒錢', '那從公司的角度有什麼更好的做法嗎？', '要不要吃餅'];

/**
 * 廚房瓦斯爐：拿著食物按 E 放上去煎，放太久會燒起來。
 * 位置對應 furniture.ts 的 kitchen-run（中心 x -11.52, z 4.84）中 dx 1.29 的瓦斯爐。
 */
export const STOVE = {
  x: -11.52,
  z: 3.55,
  /** 食物放在平底鍋上的高度 */
  topY: 0.95,
  /** 互動距離 */
  range: 1.7,
  /** 放上去多久後燒起來 */
  burnAfterMs: 20000,
  /** 燒起來多久後化成灰 */
  goneAfterMs: 12000,
  /** 著火時的延燒半徑：靠近會被燒到 */
  burnRadius: 1.4,
  /** 每次延燒判定的傷害與間隔 */
  burnDamage: 6,
  burnTickMs: 500,
  /** 離開火源後頭上的火多久熄滅 */
  fireLingerMs: 2000,
  /**
   * 常駐爐火：沒放食物時爐口也一直燒著，所以隨時可以把人押上去烤。
   * 半徑刻意小於「玩家能站到的最近距離」——流理台 AABB 的邊在 x -11.07，
   * 加上 PLAYER_RADIUS 0.35 後最近只能站到 0.8m——站在爐前煮東西不會被燙，
   * 但被壓在爐面上（距離 0）的人一定燒起來。
   */
  pilotRadius: 0.7,
  pilotDamage: 3,
};

/**
 * 廚房烤箱：位於左牆冰箱旁的獨立電烤箱（面向 +X）。
 * 拿著可以烤的食物（目前只有可頌）走近按 F 放進去，bakeMs 後出爐，空手按 E 取出。
 */
export const OVEN = {
  x: -11.52,
  z: 0.95,
  /** 互動距離 */
  range: 1.7,
  /** 烤好需要的時間 */
  bakeMs: 5000,
  /** 烤箱門（正面 +X）中心高度，運作時這裡會透出爐火的光 */
  doorY: 0.45,
  /** 出爐後食物浮在烤箱上方的高度（提示「可以拿了」） */
  showY: 1.15,
  /** 烤好後體型變幾倍（weapons.ts 依此推出烤過的食物尺寸） */
  bakeScale: 3,
};

/** 吃東西：手上拿著食物按 R（或底部按鈕）吃掉，回復血量 */
export const EAT = {
  /** 一般食物回復的血量（個別食物可用 WeaponDef.heal 覆寫） */
  healHp: 60,
  /** 進食動作長度 */
  durationMs: 1400,
  /** 咬下第一口才通知伺服端，食物才不會在動作一開始就消失 */
  sendDelayMs: 500,
};

/** 餵寵物後進食動畫與 AI 暫停的時間 */
export const PET_EAT_MS = 3000;

/** 即時天氣：伺服端定時抓 Open-Meteo（免金鑰），全房間共用 */
export const WEATHER = {
  refreshMs: 30 * 60 * 1000,
  /** 預設座標：台北（可用 WEATHER_LAT / WEATHER_LON 環境變數覆寫） */
  defaultLat: 25.04,
  defaultLon: 121.56,
};

/**
 * 匹克球場（戶外露台 x 20~38）。
 * 場地 13.4 x 6.1m，網在 x=COURT.netX；每球得分制，先到 winScore 獲勝。
 */
export const COURT = {
  minX: 25.3,
  maxX: 38.7,
  minZ: -3.05,
  maxZ: 3.05,
  netX: 32,
  netHeight: 0.86,
  /** 兩側報名點（站上去按 E 加入） */
  slotA: { x: 24.6, z: 4.3 },
  slotB: { x: 39.4, z: 4.3 },
  joinRange: 1.4,
  winScore: 7,
  /** 回擊判定：與球的水平距離、落地前後的時間窗 */
  hitRange: 1.7,
  hitWindowMs: 420,
  /** 揮拍冷卻（防連點） */
  swingCooldownMs: 350,
  /** 發球倒數與每分之間的間隔 */
  serveDelayMs: 2500,
  betweenPointsMs: 1800,
  /** 球的水平速度與飛行時間範圍 */
  ballSpeed: 8.5,
  flightMinMs: 650,
  flightMaxMs: 1500,
  /** 第一次落地後的反彈：距離為原飛行的比例、時間比例與高度比例（第二次觸地才算失分） */
  bounceDistFactor: 0.32,
  bounceMsFactor: 0.55,
  bounceArcFactor: 0.45,
  bounceMsMin: 340,
  bounceMsMax: 750,
  /** 第二次觸地後的緩衝 */
  secondTouchGraceMs: 120,
  /** 結束畫面停留時間，之後清場 */
  overResetMs: 6000,
};

/**
 * 遊戲區設施：所有數值來自 playground.glb 各零件「校正旋轉、縮放 scale、底部對齊 y=0」
 * 之後的局部座標（公尺），前後端共用（座位表推導、前端擺盪動畫都讀這裡）。
 *
 * 模型是一整包 Sketchfab 場景，各設施在檔案裡是歪的，fixYaw 為把它轉正所需的角度；
 * scale 以鞦韆架原始高 5.94 單位 ≈ 現實 2.4m 校準得出。
 */
export const PLAYGROUND = {
  scale: 0.4,
  /** 溜滑梯：爬梯在 -Z 端，滑道朝 +Z 下降 */
  slide: {
    fixYaw: (57.6 * Math.PI) / 180,
    /** 對齊後外框（公尺） */
    width: 1.26,
    depth: 3.78,
    /** 爬梯底部（座位就設在這裡：走到梯子旁按 E 開始） */
    ladderZ: -1.86,
    /** 平台踏面高度 */
    deckY: 1.69,
    /** 滑道起點 / 終點 */
    chuteTopZ: -0.55,
    chuteEndZ: 1.8,
    chuteEndY: 0.2,
    /** 滑完站起來的位置（要落在碰撞盒外） */
    exitZ: 2.45,
    /** 爬梯 → 走到滑道口 → 滑下來 的總時間 */
    rideMs: 3400,
    /** 三段動作各自的結束進度 */
    climbEnd: 0.42,
    walkEnd: 0.56,
  },
  /** 盪鞦韆：橫梁沿 X，兩個座位沿 ±Z 擺盪 */
  swing: {
    fixYaw: (19.72 * Math.PI) / 180,
    width: 4.03,
    depth: 0.5,
    height: 2.38,
    /** 兩個座位的局部 X（架子左右不對稱，數值直接取自模型） */
    seatX: [-0.38, 0.611] as const,
    /** 座墊上緣高度 */
    seatY: 0.71,
    /** 繩子頂端（擺盪支點）高度 */
    pivotY: 2.176,
    /** 擺幅（弧度）與拍速：120/bpm 秒一個來回 */
    amplitude: 0.55,
    bpm: 48,
  },
  /** 蹺蹺板：板身沿 X，兩端各一個座位 */
  seesaw: {
    fixYaw: (46.97 * Math.PI) / 180,
    width: 3.57,
    depth: 0.86,
    seatX: [-1.05, 1.05] as const,
    /** 水平時的板面高度 */
    seatY: 0.8,
    /** 支點（板身繞它傾斜） */
    pivotY: 0.737,
    amplitude: 0.26,
    bpm: 34,
  },
  /** 水池 */
  pond: { width: 3.22, depth: 2.55 },
  /** 沙坑（純裝飾，可以走過去） */
  sandbox: { width: 1.64, depth: 1.63 },
};

/**
 * 旋轉木馬。carousel.glb 是單一 mesh（屋頂與轉盤熔在一起），所以整座一起轉——
 * 底座是平的圓盤，轉起來看不出來。原始半徑 12.112 單位、高 19.08 單位。
 */
export const CAROUSEL = {
  x: 18,
  z: 26,
  radius: 4.5,
  /** carousel.glb 載入後整體寬 0.2422 單位，×37.2 得到直徑 9m（高 7.1m） */
  scale: 37.2,
  /** 轉一圈的秒數；與牆上時鐘同一條時間軸，所有人看到的角度一致 */
  turnSec: 18,
  /**
   * 木馬的位置全部量自 carousel.glb 的頂點：8 匹馬間隔 45°，馬身半徑 2.26~2.69。
   * 以某匹馬為 0° 時，-18°~-6° 是臀部與後腿、+3°~+15° 是前腿與馬頭（最高 1.59m），
   * 中間 0° 附近頂點稀疏、頂面在 1.38m，那就是馬鞍。
   * 馬頭朝角度遞增的方向，所以轉盤往正角度轉，馬才是頭朝前跑。
   */
  seatCount: 8,
  seatRadius: 2.5,
  /** 馬鞍相對於馬匹中心的角度（量下來剛好就在中心） */
  seatAngle: 0,
  /**
   * 座位離地高度。整座木馬是單一 mesh、馬不會上下動，
   * 所以人也不能起伏，不然會飄離馬背。馬背頂面實測 1.38m，
   * 角色坐姿的臀部約在原點上方 0.45m，兩者相減即為此值。
   */
  seatY: 0.95,
  /** 上下車時站的地面點離中心多遠 */
  boardRadius: 6,
};

/**
 * 兒童遊戲區的水池：平常只是擋路的景，但可以把路人押進去溺水。
 * 座標與 furniture.ts 的 pond 家具共用這一份。
 */
export const POND = {
  x: 26.5,
  z: 11.8,
  /**
   * 站在池邊多近可以把人壓進水裡。水池半寬 1.61 + PLAYER_RADIUS 0.35 = 1.96，
   * 也就是從左右兩側最近只能站到 1.96m，所以門檻要大於 2。
   */
  pinRange: 2.6,
  /** 頭被壓進水裡的高度（水面約在 0.3，壓到這個高度就整顆沒入） */
  headY: 0.12,
};

/**
 * 可以把路人押進去的危險區：押下去的落點，以及玩家要站多近才押得到。
 * 前後端共用這一份，判定距離才不會兩邊走偏。
 */
export const NPC_HAZARDS: Record<
  NpcHazard,
  { x: number; z: number; range: number; label: string; action: string; headY: number }
> = {
  stove: { x: STOVE.x, z: STOVE.z, range: STOVE.range, label: '瓦斯爐', action: '按在爐火上', headY: STOVE.topY },
  pond: { x: POND.x, z: POND.z, range: POND.pinRange, label: '水池', action: '壓進水裡', headY: POND.headY },
};

/**
 * 雲霄飛車。軌道由 data/coaster.ts 依零件表推出來，這裡只放整體參數。
 * Kenney coaster kit 是 1 unit = 1m，所以零件不縮放直接用。
 */
export const COASTER = {
  /** 軌道起點（車站月台那一端）與起始朝向（+X） */
  startX: 26,
  startZ: 22,
  startYaw: Math.PI / 2,
  /**
   * 整條軌道的最低軌面高度。抬到 2.6m 讓人可以從底下任意走過去，
   * 這樣軌道完全不需要碰撞盒；上車靠車站地面的座位，坐下去就送上車。
   */
  baseY: 2.6,
  /** 車廂在軌面上的高度、車廂間距、幾節車廂（= 幾個座位） */
  carY: 0,
  carGap: 1.45,
  carCount: 3,
  /** 乘客坐在車廂底盤上方多高 */
  riderY: 0.3,
  /**
   * 速度用能量守恆推：v = sqrt(vMin² + 2g(hMax - y))，所以爬坡慢、俯衝快。
   * vMin 是最高點的速度，g 調大一點讓落差更有感。
   */
  minSpeed: 3.2,
  gravity: 10,
  /** 進站後停留多久讓人上下車 */
  dwellMs: 3000,
};

/**
 * 海盜船：吊在 A 字架下的擺盪帆船。船身用 pirate kit 的 ship-pirate-small，
 * 架子是程式生成的（套件沒有擺盪機構的零件）。
 * 沿 X 軸擺盪，所以船身長軸要轉 90° 對到世界 X。
 *
 * 關鍵限制：船吊在支點下方，所以**桅杆不能高過擺臂**，否則會穿過頂端橫梁。
 * 船原尺寸桅杆頂 9.96m，×0.85 後 8.47m，擺臂拉到 9m 才剛好留 0.53m 餘裕。
 * A 字架擺在船身兩側（±frameZ）之外，船只在中間的平面擺盪，兩者在 Z 上錯開。
 */
export const SHIP = {
  x: 26,
  z: 35,
  /** 支點高度與擺臂長度；兩者相減就是靜止時船底離地的高度 */
  pivotY: 10.1,
  arm: 9,
  /** 最大擺角 */
  maxAngle: (75 * Math.PI) / 180,
  /** 擺盪幾次、一次幾秒 */
  swings: 6,
  swingSec: 3.6,
  /** 停下來讓人上下船的時間 */
  dwellMs: 6000,
  /** ship-pirate-small 原始長 8.8、寬 4.8、桅杆頂 9.96；×0.85 後長 7.5m、寬 4.1m */
  scale: 0.85,
  /**
   * 幾個座位、沿船身的間距，以及整排座位往船艏偏移多少。
   * 這是一艘真的帆船模型，甲板上有東西：艉樓在船身 z -4~-2.5、高到 4.28，
   * 桅杆在 z 0~3。整排人平均攤在船上會有幾個坐進艉樓，所以往船艏挪開。
   */
  seatCount: 6,
  seatGap: 0.8,
  seatOffsetX: 0.35,
  /** 座位相對船底的高度＝主甲板，實測 2.10（×0.85） */
  seatY: 2.1 * 0.85,
  /**
   * 上下船的地面點相對船中心的位置，seats.ts 與 Park.tsx 都讀這一組。
   *
   * Z 要擺到 A 字架之外（frameZ 3.4），玩家才是從南邊走過來排隊，
   * 不會穿過船底下——船靜止時船底只離地 1.1m，站在底下會被船身穿過去。
   * 園區南圍籬在 z 40，所以這個值最多到 4.5 左右。
   *
   * X 則是往船身一端挪開，免得搭乘口就貼在船正側面。擺盪端點其實很安全
   * （船盪到那裡已經抬到 3m 以上），所以往兩側讓開不會被撞到。
   */
  boardOffsetX: 6,
  boardOffsetZ: 4,
  /** A 字架在 ±Z 的位置（要大於船半寬 2.04），以及腳往 ±X 張開多遠 */
  frameZ: 3.4,
  frameSpread: 4.3,
  /**
   * 走到擺盪中的船底下會被撞飛。船身當成一個跟著擺臂轉的方盒：
   * 長 8.8×scale、寬 4.8×scale，從船底往上算 hullHeight 高。
   */
  hullHeight: 3 * 0.85,
  /** 被撞一次扣多少血（滿血 200，所以撐得住四下） */
  hitDamage: 50,
  /** 被撞飛的距離（一般揮拳的擊退是 1.5m） */
  hitKnockback: 14,
  /** 同一個人兩次被撞之間的最短間隔，免得同一趟掃過去連續結算 */
  hitCooldownMs: 800,
};

/** 決鬥 */
export const DUEL = {
  inviteTtlMs: 30000,
  countdownMs: 3000,
  /** 結果橫幅顯示時間 */
  resultBannerMs: 5000,
};

/** 網路 */
export const SYNC_INTERVAL_MS = 50; // 20Hz
/** 斷線後保留座位與狀態的秒數（網路短暫中斷可原位接回） */
export const RECONNECT_WINDOW_SEC = 30;

/**
 * 閒置自動離開：避免忘記關的分頁長時間佔用免費雲端方案的執行額度。
 * 以「分頁是否在背景」區分忘記關的分頁與開著在看辦公室的人，
 * 後者用較寬鬆的無操作門檻，才不會把坐在位子上工作的人踢掉。
 */
export const IDLE = {
  /** 分頁切到背景超過此時間就自動離開 */
  hiddenMs: 60 * 60 * 1000,
  /** 分頁開著但完全沒有任何操作超過此時間也離開（例如放在副螢幕忘了） */
  inactiveMs: 3 * 60 * 60 * 1000,
  /** 離開前多久發出警告 */
  warnBeforeMs: 5 * 60 * 1000,
  /** 伺服端檢查間隔 */
  checkIntervalMs: 30 * 1000,
};
export const MAX_CLIENTS = 20;

/** 文字限制 */
export const NAME_MIN = 2;
export const NAME_MAX = 12;
export const STATUS_MAX = 30;
export const CHAT_MAX = 200;
export const CHAT_HISTORY = 100;
export const CHAT_RATE_LIMIT = { count: 2, windowMs: 1000 };
export const BUBBLE_DURATION_MS = 5000;

/** 相機 */
export const CAMERA = {
  /** 放寬到 8°：讓玩家能把鏡頭抬到接近水平，看見場景主題的天際線 */
  pitchMin: (8 * Math.PI) / 180,
  pitchMax: (60 * Math.PI) / 180,
  pitchDefault: (35 * Math.PI) / 180,
  yawDefault: Math.PI / 4,
  distanceMin: 10,
  distanceMax: 30,
  distanceDefault: 18,
  followLerp: 0.1,
};

export const STATUS_PRESETS = ['工作中', '開會中', '午休', '離開', '可打擾'] as const;
