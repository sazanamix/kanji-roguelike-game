import {
  MAX_FLOOR,
  TILE,
  HUNGER_DRAIN_PER_TURN,
  HUNGER_STARVE_DAMAGE,
  MONSTER_DETECTION_RADIUS,
  VISIBILITY,
} from './constants.js';
import { generateFloor, isWalkableTile } from './dungeon.js';
import { createDungeonRng } from './rng.js';
import { createVisibility, updateVisibility, revealAllTerrain } from './fov.js';
import {
  createMonster,
  createFinalBoss,
  createItem,
  monsterCountForFloor,
  itemCountForFloor,
} from './entities.js';
import { runPlayerTurn } from './ai_player.js';
import { resolveAttack, effectiveDef } from './combat.js';
import { floodFillDistances } from './pathfinding.js';

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function findBossPosition(dungeon, rng) {
  const walkable = (x, y) => isWalkableTile(dungeon, x, y);
  const dist = floodFillDistances(dungeon.width, dungeon.height, walkable, dungeon.stairsPos);
  const candidates = [];
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const d = dist[y * dungeon.width + x];
      if (d >= 3 && d <= 6) candidates.push({ x, y });
    }
  }
  return candidates.length ? rng.pick(candidates) : null;
}

const SCROLL_EFFECTS = ['reveal', 'buffAtk', 'buffDef', 'heal', 'teleport'];

function useScrollOnArrival(state, log) {
  const { player, dungeon, visibility } = state;
  if (player.inventory.scroll <= 0) return;
  player.inventory.scroll -= 1;
  const effect = state.gameplayRng.pick(SCROLL_EFFECTS);
  if (effect === 'reveal') {
    revealAllTerrain(visibility);
    log('巻物の効果で、この階の地形が明らかになった。');
  } else if (effect === 'buffAtk') {
    player.buffs.push({ stat: 'atk', amount: 5, turnsLeft: 80 });
    log('巻物の効果で、しばらく攻撃力が上がった。');
  } else if (effect === 'buffDef') {
    player.buffs.push({ stat: 'def', amount: 5, turnsLeft: 80 });
    log('巻物の効果で、しばらく防御力が上がった。');
  } else if (effect === 'heal') {
    player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.5));
    log('巻物の効果で、HPが回復した。');
  } else if (effect === 'teleport') {
    const candidates = [];
    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        const idx = y * dungeon.width + x;
        if (visibility[idx] === VISIBILITY.UNSEEN) continue;
        if (!isWalkableTile(dungeon, x, y)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length > 0) {
      player.pos = state.gameplayRng.pick(candidates);
      log('巻物の効果で、既知の場所へ転移した。');
    }
  }
}

export function enterFloor(state, floorNumber, log) {
  const dungeonRng = createDungeonRng(state.masterSeed, floorNumber);
  const dungeon = generateFloor(floorNumber, dungeonRng);

  state.dungeon = dungeon;
  state.floorNumber = floorNumber;
  state.floorTurnCount = 0;
  state.aiGoal = null;
  state.visibility = createVisibility(dungeon.width, dungeon.height);
  state.player.pos = { ...dungeon.startPos };

  const monsterCount = monsterCountForFloor(floorNumber, state.gameplayRng);
  const itemCount = itemCountForFloor(state.gameplayRng);
  const eligible = [];
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (dungeon.tiles[y * dungeon.width + x] !== TILE.FLOOR) continue;
      const dx = x - dungeon.startPos.x;
      const dy = y - dungeon.startPos.y;
      if (dx * dx + dy * dy < 9) continue;
      eligible.push({ x, y });
    }
  }
  shuffleInPlace(eligible, state.gameplayRng);

  state.monsters = [];
  state.items = [];
  let cursor = 0;
  let nextId = 1;
  for (let i = 0; i < monsterCount && cursor < eligible.length; i++, cursor++) {
    const monster = createMonster(floorNumber, state.gameplayRng, `m${nextId++}`);
    monster.pos = eligible[cursor];
    state.monsters.push(monster);
  }
  for (let i = 0; i < itemCount && cursor < eligible.length; i++, cursor++) {
    const item = createItem(floorNumber, state.gameplayRng, `i${nextId++}`);
    item.pos = eligible[cursor];
    state.items.push(item);
  }

  if (floorNumber === MAX_FLOOR) {
    const boss = createFinalBoss(`m${nextId++}`);
    boss.pos = findBossPosition(dungeon, state.gameplayRng) || { ...dungeon.stairsPos };
    state.monsters.push(boss);
  }

  updateVisibility(state.visibility, dungeon, state.player.pos);
  useScrollOnArrival(state, log);
}

function monsterAt(state, x, y) {
  return state.monsters.find((m) => m.hp > 0 && m.pos.x === x && m.pos.y === y);
}

function monsterTurn(state, monster, log) {
  const { player, dungeon } = state;
  const dx = player.pos.x - monster.pos.x;
  const dy = player.pos.y - monster.pos.y;
  const manhattan = Math.abs(dx) + Math.abs(dy);

  if (manhattan === 1) {
    const result = resolveAttack(monster.atk, effectiveDef(player), state.gameplayRng);
    if (result.hit) {
      player.hp = Math.max(0, player.hp - result.damage);
      log(`${monster.kanji}から${result.damage}のダメージを受けた。`);
    } else {
      log(`${monster.kanji}の攻撃をかわした。`);
    }
    return;
  }

  if (manhattan <= MONSTER_DETECTION_RADIUS) {
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const order = Math.abs(dx) >= Math.abs(dy) ? [[stepX, 0], [0, stepY]] : [[0, stepY], [stepX, 0]];
    for (const [ddx, ddy] of order) {
      if (ddx === 0 && ddy === 0) continue;
      const nx = monster.pos.x + ddx;
      const ny = monster.pos.y + ddy;
      if (!isWalkableTile(dungeon, nx, ny)) continue;
      if (nx === player.pos.x && ny === player.pos.y) continue;
      if (monsterAt(state, nx, ny)) continue;
      monster.pos = { x: nx, y: ny };
      return;
    }
    return;
  }

  if (state.gameplayRng.chance(0.2)) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [ddx, ddy] = state.gameplayRng.pick(dirs);
    const nx = monster.pos.x + ddx;
    const ny = monster.pos.y + ddy;
    if (isWalkableTile(dungeon, nx, ny) && !(nx === player.pos.x && ny === player.pos.y) && !monsterAt(state, nx, ny)) {
      monster.pos = { x: nx, y: ny };
    }
  }
}

// 1ターンの統括: プレイヤーAI → 満腹度/バフ処理 → モンスター(安定順) → 死亡判定
// → 階段到達判定(即降下/クリア)。state.gameOver が立ったら以後の処理は行わない。
export function runTurn(state, log) {
  runPlayerTurn(state, log);

  state.player.hunger = Math.max(0, state.player.hunger - HUNGER_DRAIN_PER_TURN);
  if (state.player.hunger <= 0) {
    state.player.hp = Math.max(0, state.player.hp - HUNGER_STARVE_DAMAGE);
  }
  if (state.player.ring && state.player.ring.ringEffect === 'regen' && state.player.hp > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.ring.bonus);
  }
  if (state.player.buffs.length > 0) {
    state.player.buffs = state.player.buffs
      .map((b) => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
      .filter((b) => b.turnsLeft > 0);
  }

  if (state.player.hp <= 0) {
    log('空腹のあまり、力尽きた。');
    state.gameOver = { result: 'death', cause: '飢え' };
    return;
  }

  const activeMonsters = state.monsters
    .filter((m) => m.hp > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const monster of activeMonsters) {
    if (monster.hp <= 0) continue;
    monsterTurn(state, monster, log);
    if (state.player.hp <= 0) {
      state.gameOver = { result: 'death', cause: `${monster.kanji}に倒された` };
      break;
    }
  }
  state.monsters = state.monsters.filter((m) => m.hp > 0);

  if (state.gameOver) return;

  updateVisibility(state.visibility, state.dungeon, state.player.pos);

  const onTile = state.dungeon.tiles[state.player.pos.y * state.dungeon.width + state.player.pos.x];
  if (onTile === TILE.STAIRS) {
    if (state.floorNumber >= MAX_FLOOR) {
      state.gameOver = { result: 'clear' };
    } else {
      log(`${state.floorNumber}階を突破した!`);
      enterFloor(state, state.floorNumber + 1, log);
    }
  }
}
