// マップ・ダンジョン構造
export const MAP_WIDTH = 78;
export const MAP_HEIGHT = 24;
export const SECTION_COLS = 3;
export const SECTION_ROWS = 3;
export const SECTION_WIDTH = MAP_WIDTH / SECTION_COLS; // 26
export const SECTION_HEIGHT = MAP_HEIGHT / SECTION_ROWS; // 8

export const MAX_FLOOR = 99;

export const TILE = Object.freeze({
  WALL: 0,
  FLOOR: 1,
  STAIRS: 2,
});

export const VISIBILITY = Object.freeze({
  UNSEEN: 0,
  REMEMBERED: 1,
  VISIBLE: 2,
});

export const CORRIDOR_VIEW_RADIUS = 1;

// ターンループ・速度
export const TICK_INTERVAL_MS = 120;
export const SPEED_LEVELS = [1, 2, 4, 8];

// 自動探索AIの安全弁(フロアごとにリセット)
export const SOFT_TURN_BUDGET = 600;
export const HARD_TURN_BUDGET = 1500;

// プレイヤーの各種しきい値
export const HP_POTION_THRESHOLD_RATIO = 0.3;
export const HUNGER_MAX = 100;
// 1階の探索だけで100〜300ターン程度かかるため、1ターン=1減少では数階で餓死してしまう。
// 満腹度100が尽きるまで約800ターン(=数階分)というゆるやかな背景プレッシャーにする。
export const HUNGER_DRAIN_PER_TURN = 0.12;
export const HUNGER_EAT_THRESHOLD = 20;
export const HUNGER_EAT_RESTORE = 50;
export const HUNGER_STARVE_DAMAGE = 1;
export const MONSTER_DETECTION_RADIUS = 6;

export const STARTING_STATS = Object.freeze({
  hp: 20,
  maxHp: 20,
  atk: 3,
  def: 1,
  gold: 0,
  hunger: HUNGER_MAX,
});

// ログ・記録の上限(無限稼働を前提とするため必須)
export const MESSAGE_LOG_MAX = 200;
export const HALL_OF_FAME_MAX = 30;

// セーブ
export const AUTOSAVE_TURN_INTERVAL = 50;
export const AUTOSAVE_TIME_INTERVAL_MS = 10000;
export const SCHEMA_VERSION = 1;
export const STORAGE_KEYS = Object.freeze({
  AUTO: 'kanjiRogue.save.auto',
  MANUAL: 'kanjiRogue.save.manual',
  META: 'kanjiRogue.meta',
});

// 演出
export const ENDING_DISPLAY_MS = 20000;
export const OBITUARY_DISPLAY_MS = 9000;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
