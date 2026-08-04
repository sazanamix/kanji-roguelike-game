// シード付き擬似乱数(mulberry32)。ゲーム内の非決定的な処理は必ずこれを経由させ、
// 素の Math.random() は新規マスターシードの生成時のみ使用する。

function step(state) {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: state >>> 0 };
}

export function createRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      const { value, nextState } = step(state);
      state = nextState;
      return value;
    },
    // min, max とも含む整数を返す
    nextInt(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    chance(p) {
      return this.next() < p;
    },
    getState() {
      return state;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
}

export function deriveFloorSeed(masterSeed, floorNumber) {
  return (masterSeed ^ Math.imul(floorNumber + 1, 0x9e3779b9)) >>> 0;
}

// フロア地形専用の乱数ストリーム。状態の保存は不要で、(masterSeed, floorNumber) から
// いつでも同一の結果を再生成できる。
export function createDungeonRng(masterSeed, floorNumber) {
  return createRng(deriveFloorSeed(masterSeed, floorNumber));
}

export function createMasterSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
