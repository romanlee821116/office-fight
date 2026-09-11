/**
 * 房間邊界（公尺）。原本 24 x 16 的辦公室以原點為中心（x -12～12），
 * 右側再擴建 8m 作為健身房（x 12～20），因此 X 方向不對稱。
 */
export const ROOM_MIN_X = -12;
export const ROOM_MAX_X = 20;
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

/** 地上武器生成 */
export const PICKUPS = {
  /** 同時最多幾把在地上 */
  max: 4,
  /** 開場先放幾把 */
  initial: 2,
  intervalMs: 20000,
  interactDistance: 1.4,
  /** 生成範圍（避開牆邊，含健身房） */
  area: { minX: -11, maxX: 19, minZ: -7, maxZ: 7 },
  /** 與其他道具 / 玩家的最小距離 */
  clearance: 1.5,
  /** 投射物命中判定的走廊半寬 */
  corridorHalfWidth: 0.6,
  /** 投擲拋物線最高點 */
  throwArcHeight: 1.4,
};

/** 辦公室寵物：伺服端 AI 隨機走動 / 停頓 / 跳舞，可被攻擊，死亡後重生新的一隻 */
export const PET = {
  /** 同時在場數量 */
  count: 1,
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
  /** 活動範圍（含健身房） */
  area: { minX: -11, maxX: 19, minZ: -7, maxZ: 7 },
  /** 名牌高度 */
  tagHeight: 1.15,
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
  pitchMin: (20 * Math.PI) / 180,
  pitchMax: (60 * Math.PI) / 180,
  pitchDefault: (35 * Math.PI) / 180,
  yawDefault: Math.PI / 4,
  distanceMin: 10,
  distanceMax: 30,
  distanceDefault: 18,
  followLerp: 0.1,
};

export const STATUS_PRESETS = ['工作中', '開會中', '午休', '離開', '可打擾'] as const;
