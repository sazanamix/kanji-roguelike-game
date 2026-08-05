import {
  TICK_INTERVAL_MS,
  SPEED_LEVELS,
  MAX_FLOOR,
  AUTOSAVE_TURN_INTERVAL,
  AUTOSAVE_TIME_INTERVAL_MS,
  ENDING_DISPLAY_MS,
  OBITUARY_DISPLAY_MS,
  MESSAGE_LOG_MAX,
} from './constants.js';
import { createRng, createMasterSeed } from './rng.js';
import { createPlayer } from './entities.js';
import { enterFloor, runTurn } from './turn.js';
import { createRenderer, render, renderHallOfFame, showOverlay, hideOverlay } from './render.js';
import { saveRun, loadRun, saveMeta, loadMeta, clearAutoSave, recordRunEnd } from './save.js';

function queryDom() {
  const id = (x) => document.getElementById(x);
  return {
    viewport: id('dungeon-viewport'),
    grid: id('dungeon-grid'),
    floor: id('stat-floor'),
    turn: id('stat-turn'),
    hpBar: id('stat-hp-bar'),
    hpText: id('stat-hp-text'),
    level: id('stat-level'),
    expBar: id('stat-exp-bar'),
    expText: id('stat-exp-text'),
    atk: id('stat-atk'),
    def: id('stat-def'),
    hungerBar: id('stat-hunger-bar'),
    hungerText: id('stat-hunger-text'),
    gold: id('stat-gold'),
    kills: id('stat-kills'),
    bestFloor: id('stat-best-floor'),
    totalRuns: id('stat-total-runs'),
    totalClears: id('stat-total-clears'),
    messageLog: id('message-log'),
    equipWeaponValue: id('equip-weapon-value'),
    equipArmorValue: id('equip-armor-value'),
    equipRingValue: id('equip-ring-value'),
    equipInventory: id('equip-inventory-value'),
    hallOfFameList: id('hall-of-fame-list'),
    overlay: id('overlay'),
    overlayTitle: id('overlay-title'),
    overlaySubtitle: id('overlay-subtitle'),
    overlayBody: id('overlay-body'),
    overlaySkip: id('overlay-skip'),
    btnPause: id('btn-pause'),
    btnSpeed: id('btn-speed'),
    btnSave: id('btn-save'),
    btnLoad: id('btn-load'),
    btnReset: id('btn-reset'),
  };
}

// 開発/検証用: ?seed= ?speed= ?startFloor= (本番機能としては非表示)
function getDevParams() {
  const params = new URLSearchParams(window.location.search);
  const startFloor = params.has('startFloor') ? Number(params.get('startFloor')) : null;
  return {
    seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
    speed: params.has('speed') ? Number(params.get('speed')) : null,
    startFloor: startFloor && startFloor >= 1 && startFloor <= MAX_FLOOR ? startFloor : null,
  };
}

function createLogger(state) {
  return (message) => {
    state.messageLog.push(message);
    state.totalMessageCount += 1;
    if (state.messageLog.length > MESSAGE_LOG_MAX) state.messageLog.shift();
  };
}

function createFreshState(devParams) {
  const masterSeed = devParams.seed != null ? devParams.seed : createMasterSeed();
  const state = {
    masterSeed,
    gameplayRng: createRng((masterSeed ^ 0x2545f491) >>> 0),
    floorNumber: 1,
    floorTurnCount: 0,
    turnCount: 0,
    totalMessageCount: 0,
    messageLog: [],
    player: createPlayer(),
    dungeon: null,
    visibility: null,
    monsters: [],
    items: [],
    aiGoal: null,
    gameOver: null,
  };
  const log = createLogger(state);
  enterFloor(state, devParams.startFloor || 1, log);
  log('迷宮への挑戦が始まった。');
  return state;
}

function buildResultLines(state, entry) {
  const p = state.player;
  if (entry.result === 'CLEAR') {
    return [
      '到達階  99 / 99 (CLEAR)',
      `レベル  ${p.level}`,
      `所持金  ${p.gold}`,
      `撃破数  ${p.kills}`,
      `ターン数  ${state.turnCount}`,
      '',
      '――  Staff  ――',
      '企画・製作  sazanamix',
      '文字設計    常用漢字表',
      '実装協力    Claude Code',
      '',
      'ここまで見守ってくれてありがとう。',
    ];
  }
  return [
    `到達階  ${entry.floorReached} / 99`,
    `死因    ${entry.cause}`,
    `レベル  ${p.level}`,
    `所持金  ${p.gold}`,
    `撃破数  ${p.kills}`,
    `ターン数  ${state.turnCount}`,
  ];
}

function main() {
  const dom = queryDom();
  const devParams = getDevParams();
  const meta = loadMeta();
  const renderer = createRenderer(dom);

  let state = loadRun('auto') || createFreshState(devParams);
  let log = createLogger(state);
  saveRun(state, 'auto');

  let speedIndex = 0;
  if (devParams.speed != null) {
    const idx = SPEED_LEVELS.indexOf(devParams.speed);
    if (idx !== -1) speedIndex = idx;
  }
  let paused = false;
  let intervalId = null;
  let restartTimeoutId = null;
  let turnsSinceAutosave = 0;
  let lastAutosaveTime = Date.now();

  function updateSpeedButton() {
    dom.btnSpeed.textContent = `速度 x${SPEED_LEVELS[speedIndex]}`;
  }
  function updatePauseButton() {
    dom.btnPause.textContent = paused ? '再開' : '一時停止';
  }
  function doRender() {
    render(renderer, state, meta);
  }
  function resetLogView() {
    renderer.lastRenderedTotal = 0;
    dom.messageLog.textContent = '';
  }

  function autosaveIfDue(floorChanged) {
    turnsSinceAutosave += 1;
    const timeDue = Date.now() - lastAutosaveTime >= AUTOSAVE_TIME_INTERVAL_MS;
    if (floorChanged || turnsSinceAutosave >= AUTOSAVE_TURN_INTERVAL || timeDue) {
      saveRun(state, 'auto');
      turnsSinceAutosave = 0;
      lastAutosaveTime = Date.now();
    }
  }

  function startInterval() {
    if (intervalId != null) return;
    intervalId = setInterval(tick, TICK_INTERVAL_MS);
  }
  function stopInterval() {
    if (intervalId == null) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  function tick() {
    const turnsThisTick = SPEED_LEVELS[speedIndex];
    const floorBefore = state.floorNumber;
    for (let i = 0; i < turnsThisTick; i++) {
      state.turnCount += 1;
      runTurn(state, log);
      if (state.gameOver) break;
    }
    doRender();
    if (state.gameOver) {
      handleGameOver();
      return;
    }
    autosaveIfDue(state.floorNumber !== floorBefore);
  }

  function handleGameOver() {
    stopInterval();
    const entry = {
      endedAt: new Date().toISOString(),
      floorReached: state.floorNumber,
      level: state.player.level,
      turnCount: state.turnCount,
      result: state.gameOver.result === 'clear' ? 'CLEAR' : 'DEATH',
      cause: state.gameOver.cause || null,
      seed: state.masterSeed,
    };
    recordRunEnd(meta, entry);
    saveMeta(meta);
    clearAutoSave();
    doRender();
    renderHallOfFame(dom, meta);

    const isClear = entry.result === 'CLEAR';
    showOverlay(dom, {
      variant: isClear ? 'clear' : 'death',
      title: isClear ? '迷宮踏破 ―CLEAR―' : '冒険の終わり',
      subtitle: isClear
        ? `第${meta.totalRunsCompleted}の冒険者が、99階を踏破した`
        : `第${meta.totalRunsCompleted}の冒険はここで終わった`,
      lines: buildResultLines(state, entry),
      skipLabel: '今すぐ次の冒険へ',
      onSkip: () => {
        clearTimeout(restartTimeoutId);
        startNewRun();
      },
    });
    restartTimeoutId = setTimeout(startNewRun, isClear ? ENDING_DISPLAY_MS : OBITUARY_DISPLAY_MS);
  }

  function startNewRun() {
    restartTimeoutId = null;
    clearAutoSave();
    state = createFreshState({});
    log = createLogger(state);
    saveRun(state, 'auto');
    resetLogView();
    hideOverlay(dom);
    doRender();
    if (!paused) startInterval();
  }

  dom.btnPause.addEventListener('click', () => {
    paused = !paused;
    if (paused) stopInterval();
    else startInterval();
    updatePauseButton();
  });
  dom.btnSpeed.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEED_LEVELS.length;
    updateSpeedButton();
  });
  dom.btnSave.addEventListener('click', () => {
    saveRun(state, 'manual');
    log('現在の状況を手動セーブした。');
    doRender();
  });
  dom.btnLoad.addEventListener('click', () => {
    const loaded = loadRun('manual');
    if (!loaded) return;
    state = loaded;
    log = createLogger(state);
    saveRun(state, 'auto');
    resetLogView();
    hideOverlay(dom);
    log('手動セーブからロードした。');
    doRender();
  });
  dom.btnReset.addEventListener('click', () => {
    clearTimeout(restartTimeoutId);
    startNewRun();
  });

  window.addEventListener('beforeunload', () => {
    if (!state.gameOver) saveRun(state, 'auto');
  });

  updateSpeedButton();
  updatePauseButton();
  doRender();
  renderHallOfFame(dom, meta);
  startInterval();
}

main();
