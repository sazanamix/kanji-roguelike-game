import { SCHEMA_VERSION, STORAGE_KEYS, HALL_OF_FAME_MAX } from './constants.js';
import { createRng, createDungeonRng } from './rng.js';
import { generateFloor } from './dungeon.js';

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

// 地形(壁/床/階段/開始位置)は masterSeed+floorNumber から再生成できるため保存しない。
// 保存が必要なのは再生成不可能な「現在の生きた状態」(モンスター/アイテム/霧/プレイヤー)のみ。
export function serializeRun(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    masterSeed: state.masterSeed,
    gameplayRngState: state.gameplayRng.getState(),
    floorNumber: state.floorNumber,
    floorTurnCount: state.floorTurnCount,
    turnCount: state.turnCount,
    player: state.player,
    visibility: Array.from(state.visibility).join(''),
    monsters: state.monsters,
    items: state.items,
    aiGoal: state.aiGoal,
    messageLog: state.messageLog,
  };
}

function isValidRunData(data) {
  return (
    data &&
    data.schemaVersion === SCHEMA_VERSION &&
    typeof data.masterSeed === 'number' &&
    typeof data.floorNumber === 'number' &&
    typeof data.gameplayRngState === 'number' &&
    data.player &&
    Array.isArray(data.monsters) &&
    Array.isArray(data.items) &&
    typeof data.visibility === 'string'
  );
}

export function deserializeRun(data) {
  if (!isValidRunData(data)) return null;
  const dungeon = generateFloor(data.floorNumber, createDungeonRng(data.masterSeed, data.floorNumber));
  if (data.visibility.length !== dungeon.width * dungeon.height) return null;
  const messageLog = Array.isArray(data.messageLog) ? data.messageLog : [];

  return {
    masterSeed: data.masterSeed,
    gameplayRng: createRng(data.gameplayRngState),
    floorNumber: data.floorNumber,
    floorTurnCount: data.floorTurnCount || 0,
    turnCount: data.turnCount || 0,
    player: { buffs: [], ...data.player },
    dungeon,
    visibility: Uint8Array.from(data.visibility.split('').map(Number)),
    monsters: data.monsters,
    items: data.items,
    aiGoal: data.aiGoal || null,
    gameOver: null,
    messageLog,
    // ロード直後にレンダラー側のカウンタを0へ戻す運用と対にして、
    // 読み込んだログ全件を「未表示」として扱わせるための基準値。
    totalMessageCount: messageLog.length,
  };
}

export function saveRun(state, slot) {
  const key = slot === 'manual' ? STORAGE_KEYS.MANUAL : STORAGE_KEYS.AUTO;
  return safeSetItem(key, JSON.stringify(serializeRun(state)));
}

export function loadRun(slot) {
  const key = slot === 'manual' ? STORAGE_KEYS.MANUAL : STORAGE_KEYS.AUTO;
  const raw = safeGetItem(key);
  if (!raw) return null;
  try {
    return deserializeRun(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

export function clearAutoSave() {
  safeRemoveItem(STORAGE_KEYS.AUTO);
}

export function createDefaultMeta() {
  return {
    schemaVersion: SCHEMA_VERSION,
    bestFloorReached: 0,
    totalRunsCompleted: 0,
    totalClears: 0,
    hallOfFame: [],
  };
}

export function loadMeta() {
  const raw = safeGetItem(STORAGE_KEYS.META);
  if (!raw) return createDefaultMeta();
  try {
    const data = JSON.parse(raw);
    if (data.schemaVersion !== SCHEMA_VERSION) return createDefaultMeta();
    const meta = { ...createDefaultMeta(), ...data };
    // 過去バージョン(直近順で保存されたもの)からの移行も含め、読み込み時に必ず
    // ハイスコア順へ正規化しておくことで、以降どこで読んでもソート済みを前提にできる。
    meta.hallOfFame = [...meta.hallOfFame].sort(compareEntries);
    return meta;
  } catch (e) {
    return createDefaultMeta();
  }
}

export function saveMeta(meta) {
  return safeSetItem(STORAGE_KEYS.META, JSON.stringify(meta));
}

// 殿堂は「直近の記録」ではなく「歴代ハイスコア」の順位表として扱う。
// CLEAR済み > 到達階が深い > レベルが高い > ターン数が少ない(効率的) の順で比較し、
// 完全に同着の場合のみ記録順(挿入順)を維持する(Array#sortは安定ソート)。
function compareEntries(a, b) {
  const aClear = a.result === 'CLEAR' ? 1 : 0;
  const bClear = b.result === 'CLEAR' ? 1 : 0;
  if (aClear !== bClear) return bClear - aClear;
  if (b.floorReached !== a.floorReached) return b.floorReached - a.floorReached;
  if (b.level !== a.level) return b.level - a.level;
  return a.turnCount - b.turnCount;
}

// meta.hallOfFame は上位N件でキャップされるため、bestFloorReached等は
// 別カウンタとして持ち、下位の記録が押し出されても集計値が劣化しないようにする。
export function recordRunEnd(meta, entry) {
  meta.totalRunsCompleted += 1;
  if (entry.result === 'CLEAR') meta.totalClears += 1;
  meta.bestFloorReached = Math.max(meta.bestFloorReached, entry.floorReached);
  meta.hallOfFame.push(entry);
  meta.hallOfFame.sort(compareEntries);
  if (meta.hallOfFame.length > HALL_OF_FAME_MAX) meta.hallOfFame.length = HALL_OF_FAME_MAX;
  return meta;
}
