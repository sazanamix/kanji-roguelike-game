const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// start からの到達可能マスまでの距離(4方向BFS)。-1 は到達不可。
export function floodFillDistances(width, height, isWalkable, start) {
  const dist = new Int32Array(width * height).fill(-1);
  const startIdx = start.y * width + start.x;
  dist[startIdx] = 0;
  const queue = [startIdx];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const d = dist[cur];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (dist[nIdx] !== -1) continue;
      if (!isWalkable(nx, ny)) continue;
      dist[nIdx] = d + 1;
      queue.push(nIdx);
    }
  }
  return dist;
}

// start から predicate(x,y) を満たす最寄りマスを探す。同着は (距離, y, x) で決定的にタイブレーク。
export function findNearestReachable(width, height, isWalkable, start, predicate) {
  const dist = floodFillDistances(width, height, isWalkable, start);
  let best = null;
  let bestDist = Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === start.x && y === start.y) continue;
      if (!predicate(x, y)) continue;
      const d = dist[y * width + x];
      if (d === -1) continue;
      if (d < bestDist || (d === bestDist && best && (y < best.y || (y === best.y && x < best.x)))) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

// goal からの距離場を作り、start に隣接するマスの中で goal に最も近づく1歩を返す。
// 経路全体は保持せず、その場で次の1歩だけを求める(=キャッシュ不要で常に最新)。
export function nextStepToward(width, height, isWalkable, start, goal) {
  if (start.x === goal.x && start.y === goal.y) return null;
  const dist = floodFillDistances(width, height, isWalkable, goal);
  const d0 = dist[start.y * width + start.x];
  if (d0 === -1) return null;
  for (const [dx, dy] of DIRS) {
    const nx = start.x + dx;
    const ny = start.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (dist[ny * width + nx] === d0 - 1) return { x: nx, y: ny };
  }
  return null;
}
