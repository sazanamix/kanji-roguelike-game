import { clamp } from './constants.js';

export function expThreshold(level) {
  return Math.round(20 + level * 15 + Math.pow(level, 1.6));
}

// weapon/armor/ring/一時バフを反映した実効値。命中/被弾の計算にはこちらを使う。
export function effectiveAtk(player) {
  let atk = player.atk + (player.weapon ? player.weapon.atkBonus : 0);
  if (player.ring && player.ring.ringEffect === 'atk') atk += player.ring.bonus;
  for (const buff of player.buffs) if (buff.stat === 'atk') atk += buff.amount;
  return atk;
}

export function effectiveDef(player) {
  let def = player.def + (player.armor ? player.armor.defBonus : 0);
  if (player.ring && player.ring.ringEffect === 'def') def += player.ring.bonus;
  for (const buff of player.buffs) if (buff.stat === 'def') def += buff.amount;
  return def;
}

// 純粋関数: HPの変更は呼び出し側が行う(状態変更をここに閉じ込めない)
export function resolveAttack(atk, def, rng) {
  const hitChance = clamp(0.75 + (atk - def) * 0.02, 0.5, 0.95);
  if (!rng.chance(hitChance)) return { hit: false, damage: 0 };
  const damage = Math.max(1, atk - def + rng.nextInt(-1, 2));
  return { hit: true, damage };
}

// player.exp/level を直接書き換える。上がったレベル一覧を返す。
export function grantExp(player, exp) {
  const mult = player.ring && player.ring.ringEffect === 'exp' ? 1 + player.ring.bonus / 10 : 1;
  player.exp += Math.round(exp * mult);
  const levelsGained = [];
  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.maxHp += 6 + Math.floor(player.level / 3);
    player.atk += 2;
    player.def += 1;
    player.hp = player.maxHp;
    player.expToNext = expThreshold(player.level);
    levelsGained.push(player.level);
  }
  return levelsGained;
}
