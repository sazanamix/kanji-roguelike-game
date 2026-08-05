import { MAP_WIDTH, MAP_HEIGHT, MAX_FLOOR, VISIBILITY, TILE, MESSAGE_LOG_MAX, clamp } from './constants.js';
import { PLAYER_KANJI, WALL_KANJI, STAIRS_KANJI, FLOOR_GLYPH } from './entities.js';
import { effectiveAtk, effectiveDef } from './combat.js';

const RING_LABELS = { atk: '攻撃', def: '防御', regen: '再生', gold: '金運', exp: '経験' };

export function createGridCells(gridElement) {
  const cells = new Array(MAP_WIDTH * MAP_HEIGHT);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < cells.length; i++) {
    const span = document.createElement('span');
    span.className = 'tile';
    fragment.appendChild(span);
    cells[i] = span;
  }
  gridElement.appendChild(fragment);
  return cells;
}

export function createRenderer(dom) {
  return {
    dom,
    cells: createGridCells(dom.grid),
    lastGlyphs: new Array(MAP_WIDTH * MAP_HEIGHT).fill(null),
    lastClasses: new Array(MAP_WIDTH * MAP_HEIGHT).fill(null),
    lastRenderedTotal: 0,
  };
}

function tileGlyphAndClass(state, x, y) {
  const { dungeon, visibility, monsters, items, player } = state;
  const idx = y * dungeon.width + x;
  const vis = visibility[idx];
  if (vis === VISIBILITY.UNSEEN) return ['', 'tile-unseen'];

  if (player.pos.x === x && player.pos.y === y) return [PLAYER_KANJI, 'tile-player'];

  if (vis === VISIBILITY.VISIBLE) {
    const monster = monsters.find((m) => m.pos.x === x && m.pos.y === y);
    if (monster) return [monster.kanji, `tile-monster ${monster.colorClass}`];
    const item = items.find((it) => it.pos.x === x && it.pos.y === y);
    if (item) return [item.kanji, `tile-item ${item.colorClass}`];
  }

  const tile = dungeon.tiles[idx];
  const dim = vis === VISIBILITY.REMEMBERED ? ' tile-dim' : '';
  if (tile === TILE.WALL) return [WALL_KANJI, `tile-wall${dim}`];
  if (tile === TILE.STAIRS) return [STAIRS_KANJI, `tile-stairs${dim}`];
  return [FLOOR_GLYPH, `tile-floor${dim}`];
}

function followCamera(dom) {
  const viewport = dom.viewport;
  const playerCell = dom.grid.querySelector('.tile-player');
  if (!playerCell) return;
  const targetLeft = playerCell.offsetLeft - viewport.clientWidth / 2 + playerCell.offsetWidth / 2;
  const targetTop = playerCell.offsetTop - viewport.clientHeight / 2 + playerCell.offsetHeight / 2;
  viewport.scrollLeft = Math.max(0, targetLeft);
  viewport.scrollTop = Math.max(0, targetTop);
}

export function renderGrid(renderer, state) {
  const { width, height } = state.dungeon;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const [glyph, cls] = tileGlyphAndClass(state, x, y);
      if (renderer.lastGlyphs[idx] !== glyph) {
        renderer.cells[idx].textContent = glyph;
        renderer.lastGlyphs[idx] = glyph;
      }
      const fullClass = `tile ${cls}`;
      if (renderer.lastClasses[idx] !== fullClass) {
        renderer.cells[idx].className = fullClass;
        renderer.lastClasses[idx] = fullClass;
      }
    }
  }
  followCamera(renderer.dom);
}

export function renderMessageLog(renderer, state) {
  const container = renderer.dom.messageLog;
  const newCount = state.totalMessageCount - renderer.lastRenderedTotal;
  if (newCount <= 0) return;
  const newMessages = state.messageLog.slice(-newCount);
  const fragment = document.createDocumentFragment();
  for (const msg of newMessages) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = msg;
    fragment.appendChild(entry);
  }
  container.appendChild(fragment);
  renderer.lastRenderedTotal = state.totalMessageCount;
  while (container.children.length > MESSAGE_LOG_MAX) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;
}

export function renderHud(dom, state, meta) {
  const p = state.player;
  dom.floor.textContent = `${state.floorNumber} / ${MAX_FLOOR}`;
  dom.turn.textContent = String(state.turnCount);
  dom.hpText.textContent = `${p.hp} / ${p.maxHp}`;
  dom.hpBar.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`;
  dom.level.textContent = String(p.level);
  dom.expText.textContent = `${p.exp} / ${p.expToNext}`;
  dom.expBar.style.width = `${clamp((p.exp / p.expToNext) * 100, 0, 100)}%`;
  dom.atk.textContent = String(effectiveAtk(p));
  dom.def.textContent = String(effectiveDef(p));
  dom.hungerText.textContent = `${Math.ceil(p.hunger)} / ${p.maxHunger}`;
  dom.hungerBar.style.width = `${clamp((p.hunger / p.maxHunger) * 100, 0, 100)}%`;
  dom.gold.textContent = String(p.gold);
  dom.kills.textContent = String(p.kills);

  dom.bestFloor.textContent = String(meta.bestFloorReached);
  dom.totalRuns.textContent = String(meta.totalRunsCompleted);
  dom.totalClears.textContent = String(meta.totalClears);
}

export function renderEquipment(dom, state) {
  const p = state.player;
  dom.equipWeaponValue.textContent = p.weapon ? `剣 +${p.weapon.atkBonus}` : 'なし';
  dom.equipArmorValue.textContent = p.armor ? `盾 +${p.armor.defBonus}` : 'なし';
  dom.equipRingValue.textContent = p.ring ? `輪(${RING_LABELS[p.ring.ringEffect] || p.ring.ringEffect})` : 'なし';
  dom.equipInventory.textContent = `薬×${p.inventory.potion}  巻×${p.inventory.scroll}  飯×${p.inventory.food}`;
}

// entry.endedAt は new Date().toISOString() で保存されているため、
// 表示用にローカル日時ベースの YYYY/MM/DD へ整形する。
function formatEntryDate(isoString) {
  if (!isoString) return '----/--/--';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '----/--/--';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function renderHallOfFame(dom, meta) {
  const container = dom.hallOfFameList;
  container.textContent = '';
  const entries = meta.hallOfFame || [];
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hall-of-fame-empty';
    empty.textContent = 'まだ記録がありません。';
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = entry.result === 'CLEAR' ? 'hall-of-fame-entry is-clear' : 'hall-of-fame-entry';

    const main = document.createElement('div');
    main.className = 'hof-row-main';
    const rank = document.createElement('span');
    rank.className = 'hof-rank';
    rank.textContent = String(i + 1);
    const desc = document.createElement('span');
    desc.className = 'hof-desc';
    desc.textContent = `${entry.floorReached}階 Lv${entry.level}`;
    const result = document.createElement('span');
    result.className = 'hof-result';
    result.textContent = entry.result === 'CLEAR' ? '制覇' : entry.cause || '敗北';
    main.appendChild(rank);
    main.appendChild(desc);
    main.appendChild(result);

    const metaRow = document.createElement('div');
    metaRow.className = 'hof-row-meta';
    const date = document.createElement('span');
    date.className = 'hof-date';
    date.textContent = formatEntryDate(entry.endedAt);
    const turns = document.createElement('span');
    turns.className = 'hof-turns';
    turns.textContent = `${(entry.turnCount || 0).toLocaleString('ja-JP')}ターン`;
    metaRow.appendChild(date);
    metaRow.appendChild(turns);

    row.appendChild(main);
    row.appendChild(metaRow);
    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

export function render(renderer, state, meta) {
  renderGrid(renderer, state);
  renderMessageLog(renderer, state);
  renderHud(renderer.dom, state, meta);
  renderEquipment(renderer.dom, state);
}

export function showOverlay(dom, { variant, title, subtitle, lines, skipLabel, onSkip }) {
  dom.overlay.classList.remove('hidden');
  dom.overlay.dataset.variant = variant;
  dom.overlayTitle.textContent = title;
  dom.overlaySubtitle.textContent = subtitle || '';
  dom.overlayBody.textContent = '';
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    dom.overlayBody.appendChild(p);
  }
  dom.overlaySkip.textContent = skipLabel || 'スキップ';
  dom.overlaySkip.onclick = onSkip;
}

export function hideOverlay(dom) {
  dom.overlay.classList.add('hidden');
  dom.overlay.removeAttribute('data-variant');
}
