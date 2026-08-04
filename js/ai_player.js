import {
  HP_POTION_THRESHOLD_RATIO,
  HUNGER_EAT_THRESHOLD,
  HUNGER_EAT_RESTORE,
  HUNGER_MAX,
  SOFT_TURN_BUDGET,
  HARD_TURN_BUDGET,
  VISIBILITY,
} from './constants.js';
import { isWalkableTile } from './dungeon.js';
import { findNearestReachable, nextStepToward } from './pathfinding.js';
import { effectiveAtk, resolveAttack, grantExp } from './combat.js';

function posKey(x, y) {
  return y * 100000 + x;
}

function isWalkable(dungeon) {
  return (x, y) => isWalkableTile(dungeon, x, y);
}

function getAdjacentMonsters(state) {
  const { player, monsters } = state;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const result = [];
  for (const [dx, dy] of dirs) {
    const m = monsters.find(
      (mm) => mm.hp > 0 && mm.pos.x === player.pos.x + dx && mm.pos.y === player.pos.y + dy
    );
    if (m) result.push(m);
  }
  return result;
}

export function applyItemPickup(player, item, log) {
  switch (item.type) {
    case 'gold': {
      const mult = player.ring && player.ring.ringEffect === 'gold' ? 1 + player.ring.bonus / 10 : 1;
      player.gold += Math.round(item.amount * mult);
      log(`金を${Math.round(item.amount * mult)}手に入れた。`);
      break;
    }
    case 'treasure': {
      const mult = player.ring && player.ring.ringEffect === 'gold' ? 1 + player.ring.bonus / 10 : 1;
      const amount = Math.round(item.amount * mult);
      player.gold += amount;
      log(`★宝を発見!金を${amount}手に入れた!`);
      break;
    }
    case 'potion':
      player.inventory.potion += 1;
      log('薬を手に入れた。');
      break;
    case 'food':
      player.inventory.food += 1;
      log('飯を手に入れた。');
      break;
    case 'scroll':
      player.inventory.scroll += 1;
      log('巻物を手に入れた。');
      break;
    case 'weapon':
      if (!player.weapon || item.atkBonus > player.weapon.atkBonus) {
        player.weapon = item;
        log(`剣を装備した(攻撃+${item.atkBonus})。`);
      } else {
        log('剣を見つけたが、今の装備の方が優れている。');
      }
      break;
    case 'armor':
      if (!player.armor || item.defBonus > player.armor.defBonus) {
        player.armor = item;
        log(`盾を装備した(防御+${item.defBonus})。`);
      } else {
        log('盾を見つけたが、今の装備の方が優れている。');
      }
      break;
    case 'ring':
      if (!player.ring || item.bonus > player.ring.bonus) {
        player.ring = item;
        log('輪を装備した。');
      } else {
        log('輪を見つけたが、今の装備の方が優れている。');
      }
      break;
    default:
      break;
  }
}

function tryPickupItem(state, log) {
  const { player, items } = state;
  const idx = items.findIndex((it) => it.pos.x === player.pos.x && it.pos.y === player.pos.y);
  if (idx === -1) return false;
  applyItemPickup(player, items[idx], log);
  items.splice(idx, 1);
  return true;
}

function tryAttackAdjacent(state, log) {
  const adjacent = getAdjacentMonsters(state);
  if (adjacent.length === 0) return false;
  adjacent.sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id));
  const target = adjacent[0];
  const atk = effectiveAtk(state.player);
  const result = resolveAttack(atk, target.def, state.gameplayRng);
  if (result.hit) {
    target.hp = Math.max(0, target.hp - result.damage);
    log(`${target.kanji}に${result.damage}のダメージを与えた。`);
    if (target.hp <= 0) {
      log(`${target.kanji}を倒した!`);
      state.player.kills += 1;
      const levelsGained = grantExp(state.player, target.exp);
      for (const lv of levelsGained) log(`レベル${lv}に上がった!`);
    }
  } else {
    log(`${target.kanji}への攻撃を外した。`);
  }
  return true;
}

function tryDrinkPotion(state, log) {
  const { player } = state;
  if (player.hp > player.maxHp * HP_POTION_THRESHOLD_RATIO) return false;
  if (player.inventory.potion <= 0) return false;
  player.inventory.potion -= 1;
  const healAmount = Math.round(player.maxHp * 0.4) + 10;
  player.hp = Math.min(player.maxHp, player.hp + healAmount);
  log(`薬を使い、HPが${healAmount}回復した。`);
  return true;
}

function tryEatFood(state, log) {
  const { player } = state;
  if (player.hunger > HUNGER_EAT_THRESHOLD) return false;
  if (player.inventory.food <= 0) return false;
  player.inventory.food -= 1;
  player.hunger = Math.min(HUNGER_MAX, player.hunger + HUNGER_EAT_RESTORE);
  log('飯を食べ、満腹度が回復した。');
  return true;
}

function isFrontierTile(state, x, y) {
  const { dungeon, visibility } = state;
  const idx = y * dungeon.width + x;
  if (visibility[idx] === VISIBILITY.UNSEEN) return false;
  if (!isWalkableTile(dungeon, x, y)) return false;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= dungeon.width || ny >= dungeon.height) continue;
    if (visibility[ny * dungeon.width + nx] === VISIBILITY.UNSEEN && isWalkableTile(dungeon, nx, ny)) {
      return true;
    }
  }
  return false;
}

function isGoalValid(state, goal) {
  if (!goal) return false;
  const { dungeon, visibility, monsters, items } = state;
  if (goal.type === 'monster') {
    const m = monsters.find((mm) => mm.id === goal.targetId && mm.hp > 0);
    if (!m) return false;
    if (visibility[m.pos.y * dungeon.width + m.pos.x] !== VISIBILITY.VISIBLE) return false;
    goal.pos = { ...m.pos };
    return true;
  }
  if (goal.type === 'item') {
    const it = items.find((ii) => ii.id === goal.targetId);
    if (!it) return false;
    if (visibility[it.pos.y * dungeon.width + it.pos.x] !== VISIBILITY.VISIBLE) return false;
    goal.pos = { ...it.pos };
    return true;
  }
  if (goal.type === 'frontier') {
    return isFrontierTile(state, goal.pos.x, goal.pos.y);
  }
  if (goal.type === 'stairs') return true;
  return false;
}

function selectNewGoal(state) {
  const { player, dungeon, visibility, monsters, items } = state;
  const walkable = isWalkable(dungeon);
  const w = dungeon.width;
  const h = dungeon.height;

  const visibleMonsters = new Map();
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    if (visibility[m.pos.y * w + m.pos.x] === VISIBILITY.VISIBLE) visibleMonsters.set(posKey(m.pos.x, m.pos.y), m);
  }
  if (visibleMonsters.size > 0) {
    const target = findNearestReachable(w, h, walkable, player.pos, (x, y) => visibleMonsters.has(posKey(x, y)));
    if (target) {
      const m = visibleMonsters.get(posKey(target.x, target.y));
      return { type: 'monster', targetId: m.id, pos: { ...target } };
    }
  }

  const visibleItems = new Map();
  for (const it of items) {
    if (visibility[it.pos.y * w + it.pos.x] === VISIBILITY.VISIBLE) visibleItems.set(posKey(it.pos.x, it.pos.y), it);
  }
  if (visibleItems.size > 0) {
    const target = findNearestReachable(w, h, walkable, player.pos, (x, y) => visibleItems.has(posKey(x, y)));
    if (target) {
      const it = visibleItems.get(posKey(target.x, target.y));
      return { type: 'item', targetId: it.id, pos: { ...target } };
    }
  }

  const frontier = findNearestReachable(w, h, walkable, player.pos, (x, y) => isFrontierTile(state, x, y));
  if (frontier) return { type: 'frontier', pos: frontier };

  return { type: 'stairs', pos: { ...dungeon.stairsPos } };
}

function moveTowardGoal(state, log) {
  const walkable = isWalkable(state.dungeon);
  let goal = state.aiGoal;
  if (state.floorTurnCount >= SOFT_TURN_BUDGET) {
    goal = { type: 'stairs', pos: { ...state.dungeon.stairsPos } };
  } else if (!isGoalValid(state, goal)) {
    goal = selectNewGoal(state);
  }
  state.aiGoal = goal;

  const step = nextStepToward(state.dungeon.width, state.dungeon.height, walkable, state.player.pos, goal.pos);
  if (step) {
    state.player.pos = step;
  } else {
    state.aiGoal = null;
  }
}

// 1ターン分のプレイヤー行動を決定・実行する。優先順位:
// ハード安全弁 > 拾得 > 隣接攻撃(最もHPが低い敵) > 薬 > 食料 > 移動。
// ハード安全弁のみ他の全ルールより先に評価し、優先度システム自体を迂回して
// 近接デッドロックを解消する。
export function runPlayerTurn(state, log) {
  state.floorTurnCount = (state.floorTurnCount || 0) + 1;

  if (state.floorTurnCount >= HARD_TURN_BUDGET) {
    state.player.pos = { ...state.dungeon.stairsPos };
    state.aiGoal = null;
    log('道に迷い続けたため、強引に階段まで進んだ。');
    return;
  }

  if (tryPickupItem(state, log)) return;
  if (tryAttackAdjacent(state, log)) return;
  if (tryDrinkPotion(state, log)) return;
  if (tryEatFood(state, log)) return;
  moveTowardGoal(state, log);
}
