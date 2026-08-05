import {
  STARTING_STATS,
  STARTING_POTIONS,
  HUNGER_MAX,
  ELITE_HP_MULT,
  ELITE_ATK_MULT,
  ELITE_DEF_MULT,
  ELITE_EXP_MULT,
  clamp,
} from './constants.js';
import { expThreshold } from './combat.js';

export const PLAYER_KANJI = '勇';
export const STAIRS_KANJI = '段';
export const WALL_KANJI = '壁';
export const FLOOR_GLYPH = '・';

export const MONSTER_TIERS = [
  {
    tier: 1, minFloor: 1, maxFloor: 24, colorClass: 'mon-t1',
    monsters: [
      { key: 'rat', kanji: '鼠', name: '鼠', baseHp: 6, baseAtk: 2, baseDef: 0, exp: 3 },
      { key: 'bat', kanji: '蝠', name: '蝙蝠', baseHp: 5, baseAtk: 3, baseDef: 0, exp: 3 },
      { key: 'snake', kanji: '蛇', name: '蛇', baseHp: 7, baseAtk: 2, baseDef: 1, exp: 4 },
      { key: 'fox', kanji: '狐', name: '狐', baseHp: 8, baseAtk: 3, baseDef: 1, exp: 4 },
    ],
  },
  {
    tier: 2, minFloor: 25, maxFloor: 49, colorClass: 'mon-t2',
    monsters: [
      { key: 'wolf', kanji: '狼', name: '狼', baseHp: 16, baseAtk: 6, baseDef: 2, exp: 10 },
      { key: 'bear', kanji: '熊', name: '熊', baseHp: 22, baseAtk: 7, baseDef: 3, exp: 12 },
      { key: 'skeleton', kanji: '骨', name: '骸骨', baseHp: 18, baseAtk: 6, baseDef: 4, exp: 11 },
      { key: 'spider', kanji: '蜘', name: '蜘蛛', baseHp: 15, baseAtk: 8, baseDef: 1, exp: 11 },
    ],
  },
  {
    tier: 3, minFloor: 50, maxFloor: 74, colorClass: 'mon-t3',
    monsters: [
      { key: 'tiger', kanji: '虎', name: '虎', baseHp: 32, baseAtk: 12, baseDef: 5, exp: 24 },
      { key: 'oni', kanji: '鬼', name: '鬼', baseHp: 40, baseAtk: 14, baseDef: 6, exp: 28 },
      { key: 'specter', kanji: '妖', name: '妖', baseHp: 28, baseAtk: 15, baseDef: 3, exp: 26 },
      { key: 'scorpion', kanji: '蠍', name: '蠍', baseHp: 30, baseAtk: 13, baseDef: 7, exp: 27 },
    ],
  },
  {
    tier: 4, minFloor: 75, maxFloor: 98, colorClass: 'mon-t4',
    monsters: [
      { key: 'dragon', kanji: '竜', name: '竜', baseHp: 60, baseAtk: 22, baseDef: 10, exp: 55 },
      { key: 'demon', kanji: '魔', name: '魔', baseHp: 55, baseAtk: 24, baseDef: 8, exp: 56 },
      { key: 'death', kanji: '死', name: '死神', baseHp: 50, baseAtk: 26, baseDef: 6, exp: 58 },
      { key: 'ghost', kanji: '幽', name: '幽霊', baseHp: 45, baseAtk: 20, baseDef: 5, exp: 50 },
    ],
  },
];

export const FINAL_BOSS = {
  key: 'god', kanji: '神', name: '神', colorClass: 'mon-final',
  baseHp: 220, baseAtk: 40, baseDef: 15, exp: 500,
};

export const ITEM_DEFS = [
  { key: 'gold', kanji: '金', type: 'gold', weight: 35, colorClass: 'item-gold' },
  { key: 'potion', kanji: '薬', type: 'potion', weight: 20, colorClass: 'item-potion' },
  { key: 'food', kanji: '飯', type: 'food', weight: 15, colorClass: 'item-food' },
  { key: 'scroll', kanji: '巻', type: 'scroll', weight: 10, colorClass: 'item-scroll' },
  { key: 'weapon', kanji: '剣', type: 'weapon', weight: 8, colorClass: 'item-weapon' },
  { key: 'armor', kanji: '盾', type: 'armor', weight: 7, colorClass: 'item-armor' },
  { key: 'ring', kanji: '輪', type: 'ring', weight: 3, colorClass: 'item-ring' },
  { key: 'treasure', kanji: '宝', type: 'treasure', weight: 2, colorClass: 'item-treasure' },
];

export function monsterTierForFloor(floorNumber) {
  return (
    MONSTER_TIERS.find((t) => floorNumber >= t.minFloor && floorNumber <= t.maxFloor) ||
    MONSTER_TIERS[MONSTER_TIERS.length - 1]
  );
}

export function monsterCountForFloor(floorNumber, rng) {
  return clamp(2 + Math.floor(floorNumber / 8) + rng.nextInt(0, 3), 2, 12);
}

export function itemCountForFloor(rng) {
  return clamp(3 + rng.nextInt(0, 4), 3, 10);
}

// 階層に応じたモンスターの強さ倍率。ATKは従来通り線形(0.06/階)のみに抑える
// (ATKを加速させるとダメージ計算式 atk-def が一気に振り切れ、対策の余地がない
// 即死ゲーになってしまうため)。HP/DEFは20階を超えた分だけ緩やかに加速させ、
// 「粘り強く長引く」形で後半の緊張感を出す(即死ではなく被弾の積み重ねでの
// 危険度上昇にする)。tier1〜tier2の境目(25階付近)は従来とほぼ同じ強さを保つ。
export function monsterScaleForFloor(floorNumber) {
  const over = Math.max(0, floorNumber - 20);
  const atkScale = 1 + floorNumber * 0.06;
  const tankScale = atkScale + over * over * 0.00015;
  return { atkScale, tankScale };
}

export function createMonster(floorNumber, rng, id) {
  const tier = monsterTierForFloor(floorNumber);
  const def = rng.pick(tier.monsters);
  const { atkScale, tankScale } = monsterScaleForFloor(floorNumber);
  const hp = Math.round(def.baseHp * tankScale);
  return {
    id,
    key: def.key,
    kanji: def.kanji,
    name: def.name,
    colorClass: tier.colorClass,
    hp,
    maxHp: hp,
    atk: Math.round(def.baseAtk * atkScale),
    def: Math.round(def.baseDef * tankScale),
    exp: Math.round(def.exp * tankScale),
    pos: null,
  };
}

// 一定階層ごとに出現する精鋭個体。同tierの通常モンスターをベースに、HP/ATK/DEF/EXPを
// 大きく底上げする。見た目は同じ漢字・tier色のままisEliteフラグとmon-eliteクラス
// (光彩・太字)だけで格上と分かるようにし、「全て漢字1文字」の方針は崩さない。
export function createEliteMonster(floorNumber, rng, id) {
  const monster = createMonster(floorNumber, rng, id);
  monster.hp = Math.round(monster.hp * ELITE_HP_MULT);
  monster.maxHp = monster.hp;
  monster.atk = Math.round(monster.atk * ELITE_ATK_MULT);
  monster.def = Math.round(monster.def * ELITE_DEF_MULT);
  monster.exp = Math.round(monster.exp * ELITE_EXP_MULT);
  monster.isElite = true;
  monster.colorClass = `${monster.colorClass} mon-elite`;
  return monster;
}

export function createFinalBoss(id) {
  return {
    id,
    key: FINAL_BOSS.key,
    kanji: FINAL_BOSS.kanji,
    name: FINAL_BOSS.name,
    colorClass: FINAL_BOSS.colorClass,
    hp: FINAL_BOSS.baseHp,
    maxHp: FINAL_BOSS.baseHp,
    atk: FINAL_BOSS.baseAtk,
    def: FINAL_BOSS.baseDef,
    exp: FINAL_BOSS.exp,
    pos: null,
  };
}

export function pickItemDef(rng) {
  const total = ITEM_DEFS.reduce((sum, d) => sum + d.weight, 0);
  let r = rng.next() * total;
  for (const def of ITEM_DEFS) {
    if (r < def.weight) return def;
    r -= def.weight;
  }
  return ITEM_DEFS[0];
}

export function createItem(floorNumber, rng, id) {
  const def = pickItemDef(rng);
  const item = { id, key: def.key, kanji: def.kanji, type: def.type, colorClass: def.colorClass, pos: null };
  const depthScale = Math.floor(floorNumber / 10);
  switch (def.type) {
    case 'gold':
      item.amount = 5 + depthScale * 5 + rng.nextInt(0, 10 + depthScale * 5);
      break;
    case 'treasure':
      item.amount = 100 + depthScale * 40 + rng.nextInt(0, 100);
      break;
    case 'weapon':
      item.atkBonus = 2 + depthScale + rng.nextInt(0, 2);
      break;
    case 'armor':
      item.defBonus = 2 + depthScale + rng.nextInt(0, 2);
      break;
    case 'ring':
      item.ringEffect = rng.pick(['atk', 'def', 'regen', 'gold', 'exp']);
      item.bonus = 1 + Math.floor(depthScale / 2) + rng.nextInt(0, 2);
      break;
    case 'scroll':
      item.scrollEffect = rng.pick(['reveal', 'buffAtk', 'buffDef', 'heal', 'teleport']);
      break;
    default:
      break;
  }
  return item;
}

export function createPlayer() {
  return {
    kanji: PLAYER_KANJI,
    hp: STARTING_STATS.hp,
    maxHp: STARTING_STATS.maxHp,
    atk: STARTING_STATS.atk,
    def: STARTING_STATS.def,
    level: 1,
    exp: 0,
    expToNext: expThreshold(1),
    gold: STARTING_STATS.gold,
    hunger: STARTING_STATS.hunger,
    maxHunger: HUNGER_MAX,
    weapon: null,
    armor: null,
    ring: null,
    buffs: [],
    inventory: { potion: STARTING_POTIONS, scroll: 0, food: 0 },
    pos: null,
    kills: 0,
  };
}
