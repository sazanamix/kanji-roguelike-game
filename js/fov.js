import { VISIBILITY, CORRIDOR_VIEW_RADIUS } from './constants.js';

export function createVisibility(width, height) {
  return new Uint8Array(width * height).fill(VISIBILITY.UNSEEN);
}

function findRoomAt(dungeon, pos) {
  return dungeon.rooms.find(
    (r) => pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h
  );
}

// 視認中(VISIBLE)は毎tick一旦「記憶」に格下げしてから、現在地に応じて再点灯する。
// 記憶状態が UNSEEN に戻ることは無い(=見た地形を忘れることはない)。
export function updateVisibility(visibility, dungeon, playerPos) {
  const { width, height } = dungeon;
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] === VISIBILITY.VISIBLE) visibility[i] = VISIBILITY.REMEMBERED;
  }

  const room = findRoomAt(dungeon, playerPos);
  if (room) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        visibility[y * width + x] = VISIBILITY.VISIBLE;
      }
    }
  } else {
    const r = CORRIDOR_VIEW_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = playerPos.x + dx;
        const ny = playerPos.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        visibility[ny * width + nx] = VISIBILITY.VISIBLE;
      }
    }
  }
  return visibility;
}

// 「魔法の地図」巻物用: 未探索の地形をすべて記憶状態にする(モンスター/アイテムは
// 視認中でなければ見えないルールは変えない)。
export function revealAllTerrain(visibility) {
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] === VISIBILITY.UNSEEN) visibility[i] = VISIBILITY.REMEMBERED;
  }
}
