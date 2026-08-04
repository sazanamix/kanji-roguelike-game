import { MAP_WIDTH, MAP_HEIGHT, SECTION_COLS, SECTION_ROWS, SECTION_WIDTH, SECTION_HEIGHT, TILE } from './constants.js';

const SECTION_COUNT = SECTION_COLS * SECTION_ROWS;

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function buildSectionGraphEdges() {
  const edges = [];
  for (let sy = 0; sy < SECTION_ROWS; sy++) {
    for (let sx = 0; sx < SECTION_COLS; sx++) {
      const s = sy * SECTION_COLS + sx;
      if (sx < SECTION_COLS - 1) edges.push([s, s + 1]);
      if (sy < SECTION_ROWS - 1) edges.push([s, s + SECTION_COLS]);
    }
  }
  return edges;
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

// ランダム全域木(到達性を構造的に保証)+ 追加のループ辺
function buildSpanningTreeAndExtras(rng) {
  const allEdges = buildSectionGraphEdges();
  shuffle(allEdges, rng);
  const uf = new UnionFind(SECTION_COUNT);
  const treeEdges = [];
  const remaining = [];
  for (const edge of allEdges) {
    if (uf.union(edge[0], edge[1])) treeEdges.push(edge);
    else remaining.push(edge);
  }
  const extraEdges = remaining.filter(() => rng.chance(0.3));
  return [...treeEdges, ...extraEdges];
}

function computeAllPairsDistances(edges) {
  const adj = Array.from({ length: SECTION_COUNT }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const distMatrix = [];
  for (let start = 0; start < SECTION_COUNT; start++) {
    const dist = new Array(SECTION_COUNT).fill(-1);
    dist[start] = 0;
    const queue = [start];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      for (const next of adj[cur]) {
        if (dist[next] === -1) {
          dist[next] = dist[cur] + 1;
          queue.push(next);
        }
      }
    }
    distMatrix.push(dist);
  }
  return distMatrix;
}

// 区画グラフ上で最も距離が離れたペアを開始地点/階段に選ぶ(隣接しすぎを防ぐ)
function pickStartAndStairsSections(edges, rng) {
  const distMatrix = computeAllPairsDistances(edges);
  let maxDist = -1;
  let pairs = [];
  for (let a = 0; a < SECTION_COUNT; a++) {
    for (let b = a + 1; b < SECTION_COUNT; b++) {
      const d = distMatrix[a][b];
      if (d > maxDist) {
        maxDist = d;
        pairs = [[a, b]];
      } else if (d === maxDist) {
        pairs.push([a, b]);
      }
    }
  }
  const [a, b] = rng.pick(pairs);
  return rng.chance(0.5) ? { start: a, stairs: b } : { start: b, stairs: a };
}

function sectionBounds(s) {
  const sx = s % SECTION_COLS;
  const sy = Math.floor(s / SECTION_COLS);
  const x0 = sx * SECTION_WIDTH;
  const y0 = sy * SECTION_HEIGHT;
  return { x0, y0, x1: x0 + SECTION_WIDTH - 1, y1: y0 + SECTION_HEIGHT - 1 };
}

// 各区画の境界に1マスの余白を残す。この余白は常に空いているため、
// 区画間の通路配線は衝突判定なしで機械的に通せる。
function innerBounds(s) {
  const b = sectionBounds(s);
  return { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
}

function setTile(tiles, width, x, y, value) {
  tiles[y * width + x] = value;
}

function pickSectionType(rng) {
  const r = rng.next();
  if (r < 0.7) return 'room';
  if (r < 0.85) return 'maze';
  return 'passthrough';
}

function carveRoom(tiles, width, inner, rng) {
  const innerW = inner.x1 - inner.x0 + 1;
  const innerH = inner.y1 - inner.y0 + 1;
  const w = rng.nextInt(6, innerW);
  const h = rng.nextInt(3, innerH);
  const x = inner.x0 + rng.nextInt(0, innerW - w);
  const y = inner.y0 + rng.nextInt(0, innerH - h);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setTile(tiles, width, xx, yy, TILE.FLOOR);
  }
  return { x, y, w, h };
}

// 再帰的バックトラック法による迷路。奇数間隔のセルグリッド上で通路を掘る。
function carveMaze(tiles, width, inner, rng) {
  const innerW = inner.x1 - inner.x0 + 1;
  const innerH = inner.y1 - inner.y0 + 1;
  const cellsX = Math.max(1, Math.floor((innerW - 1) / 2) + 1);
  const cellsY = Math.max(1, Math.floor((innerH - 1) / 2) + 1);
  const cellToTile = (cx, cy) => ({ x: inner.x0 + cx * 2, y: inner.y0 + cy * 2 });
  const visited = Array.from({ length: cellsY }, () => new Array(cellsX).fill(false));
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  visited[0][0] = true;
  const floorCells = [[0, 0]];
  const stack = [[0, 0]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = [];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cellsX || ny >= cellsY) continue;
      if (visited[ny][nx]) continue;
      options.push([nx, ny, dx, dy]);
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = rng.pick(options);
    visited[ny][nx] = true;
    const cur = cellToTile(cx, cy);
    const next = cellToTile(nx, ny);
    setTile(tiles, width, cur.x, cur.y, TILE.FLOOR);
    setTile(tiles, width, cur.x + dx, cur.y + dy, TILE.FLOOR);
    setTile(tiles, width, next.x, next.y, TILE.FLOOR);
    floorCells.push([nx, ny]);
    stack.push([nx, ny]);
  }
  const [ac, ay] = rng.pick(floorCells);
  return cellToTile(ac, ay);
}

function passthroughAnchor(inner) {
  return { x: Math.floor((inner.x0 + inner.x1) / 2), y: Math.floor((inner.y0 + inner.y1) / 2) };
}

function carveLine(tiles, width, from, to) {
  if (from.y === to.y) {
    const y = from.y;
    const xs = Math.min(from.x, to.x);
    const xe = Math.max(from.x, to.x);
    for (let x = xs; x <= xe; x++) setTile(tiles, width, x, y, TILE.FLOOR);
  } else {
    const x = from.x;
    const ys = Math.min(from.y, to.y);
    const ye = Math.max(from.y, to.y);
    for (let y = ys; y <= ye; y++) setTile(tiles, width, x, y, TILE.FLOOR);
  }
}

// 水平隣接(diff===1)は自区画の行→相手区画の列の順、垂直隣接(diff===3)は
// 自区画の列→相手区画の行の順で結ぶ。区画は厳密なグリッド分割のため、
// この順序であれば経路は常にA∪B∪余白の中に収まり、無関係な第三の区画を
// 決して侵さない。
function carveCorridor(tiles, width, sectionsMeta, sA, sB) {
  const a = sectionsMeta[sA].anchor;
  const b = sectionsMeta[sB].anchor;
  const horizontalNeighbor = Math.abs(sA - sB) === 1;
  const pivot = horizontalNeighbor ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  carveLine(tiles, width, a, pivot);
  carveLine(tiles, width, pivot, b);
}

function centerOfRoom(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

export function generateFloor(floorNumber, rng) {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles = new Uint8Array(width * height).fill(TILE.WALL);

  const edges = buildSpanningTreeAndExtras(rng);
  const { start: startSection, stairs: stairsSection } = pickStartAndStairsSections(edges, rng);

  const sectionsMeta = [];
  const rooms = [];
  for (let s = 0; s < SECTION_COUNT; s++) {
    const inner = innerBounds(s);
    const type = s === startSection || s === stairsSection ? 'room' : pickSectionType(rng);
    if (type === 'room') {
      const room = carveRoom(tiles, width, inner, rng);
      rooms.push({ ...room, section: s });
      sectionsMeta.push({ type, anchor: centerOfRoom(room), room });
    } else if (type === 'maze') {
      sectionsMeta.push({ type, anchor: carveMaze(tiles, width, inner, rng), room: null });
    } else {
      sectionsMeta.push({ type, anchor: passthroughAnchor(inner), room: null });
    }
  }

  for (const [a, b] of edges) carveCorridor(tiles, width, sectionsMeta, a, b);

  const startPos = centerOfRoom(sectionsMeta[startSection].room);
  const stairsPos = centerOfRoom(sectionsMeta[stairsSection].room);
  setTile(tiles, width, stairsPos.x, stairsPos.y, TILE.STAIRS);

  return { width, height, tiles, rooms, startPos, stairsPos, floorNumber };
}

export function isWalkableTile(dungeon, x, y) {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return false;
  const t = dungeon.tiles[y * dungeon.width + x];
  return t === TILE.FLOOR || t === TILE.STAIRS;
}
