import assert from 'node:assert/strict';

class Heap {
  values = [];
  push(value) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].f <= value.f) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }
  pop() {
    const root = this.values[0] ?? null;
    const tail = this.values.pop();
    if (!root || !tail || this.values.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      let smallest = left;
      if (right < this.values.length && this.values[right].f < this.values[left].f) smallest = right;
      if (this.values[smallest].f >= tail.f) break;
      this.values[index] = this.values[smallest];
      index = smallest;
    }
    this.values[index] = tail;
    return root;
  }
  get length() { return this.values.length; }
}

const W = 42;
const H = 30;
const blocked = new Uint8Array(W * H);
for (let y = 2; y < H - 2; y += 1) {
  for (let x = 2; x < W - 2; x += 1) {
    if ((x * 17 + y * 31) % 19 === 0) blocked[y * W + x] = 1;
  }
}
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => ((y & 0xffff) << 16) | (x & 0xffff);

function heapAstar(sx, sy, gx, gy) {
  const open = new Heap();
  open.push({ x: sx, y: sy, g: 0, f: 0 });
  const best = new Map([[key(sx, sy), 0]]);
  while (open.length) {
    const current = open.pop();
    if (current.x === gx && current.y === gy) return current.g;
    for (const [dx, dy] of neighbors) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H || blocked[y * W + x]) continue;
      const g = current.g + 1;
      const node = key(x, y);
      if ((best.get(node) ?? Infinity) <= g) continue;
      best.set(node, g);
      open.push({ x, y, g, f: g + Math.abs(gx - x) + Math.abs(gy - y) });
    }
  }
  return Infinity;
}

function bfs(sx, sy, gx, gy) {
  const queue = [[sx, sy, 0]];
  const seen = new Set([key(sx, sy)]);
  for (let index = 0; index < queue.length; index += 1) {
    const [cx, cy, distance] = queue[index];
    if (cx === gx && cy === gy) return distance;
    for (const [dx, dy] of neighbors) {
      const x = cx + dx;
      const y = cy + dy;
      const node = key(x, y);
      if (x < 0 || y < 0 || x >= W || y >= H || blocked[y * W + x] || seen.has(node)) continue;
      seen.add(node);
      queue.push([x, y, distance + 1]);
    }
  }
  return Infinity;
}

for (let index = 0; index < 100; index += 1) {
  const sx = 1 + (index * 7) % (W - 2);
  const sy = 1 + (index * 11) % (H - 2);
  const gx = 1 + (index * 13 + 5) % (W - 2);
  const gy = 1 + (index * 17 + 3) % (H - 2);
  blocked[sy * W + sx] = 0;
  blocked[gy * W + gx] = 0;
  assert.equal(heapAstar(sx, sy, gx, gy), bfs(sx, sy, gx, gy), `A* mismatch for pair ${index}`);
}

const chunkSize = 192;
const records = Array.from({ length: 800 }, (_, id) => ({ id, x: (id * 83) % 2048, y: (id * 137) % 2048, radius: 220 + (id % 4) * 24 }));
const chunks = new Map();
for (const record of records) {
  const chunk = `${Math.floor(record.x / chunkSize)}:${Math.floor(record.y / chunkSize)}`;
  const list = chunks.get(chunk) ?? [];
  list.push(record);
  chunks.set(chunk, list);
}
function naive(px, py) {
  return new Set(records.filter((record) => (px - record.x) ** 2 + (py - record.y) ** 2 <= record.radius ** 2).map((record) => record.id));
}
function chunked(px, py) {
  const cx = Math.floor(px / chunkSize);
  const cy = Math.floor(py / chunkSize);
  const candidates = [];
  for (let y = cy - 2; y <= cy + 2; y += 1) for (let x = cx - 2; x <= cx + 2; x += 1) candidates.push(...(chunks.get(`${x}:${y}`) ?? []));
  return new Set(candidates.filter((record) => (px - record.x) ** 2 + (py - record.y) ** 2 <= record.radius ** 2).map((record) => record.id));
}
for (let index = 0; index < 120; index += 1) {
  const px = (index * 47) % 2048;
  const py = (index * 61) % 2048;
  assert.deepEqual([...chunked(px, py)].sort((a, b) => a - b), [...naive(px, py)].sort((a, b) => a - b));
}

console.log('Performance optimization tests passed: heap A* matches BFS and chunk activation matches full-distance scanning.');
