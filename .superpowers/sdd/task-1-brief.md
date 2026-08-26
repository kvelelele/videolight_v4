### Task 1: Vitest + SORT-like tracker

**Files:**
- Create: `src/lib/tracker.ts`
- Create: `src/lib/tracker.test.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json` (include vitest types if needed)

**Interfaces:**
- Consumes: none
- Produces:
  - `export type TrackBBox = [number, number, number, number]`
  - `export interface RawDetection { className: string; confidence: number; bbox: TrackBBox }`
  - `export interface TrackedObject { trackId: number; className: string; confidence: number; bbox: TrackBBox }`
  - `export class SortTracker { constructor(opts?: { iouThreshold?: number; maxAgeMs?: number; minHits?: number }); update(dets: RawDetection[], nowMs: number): TrackedObject[]; reset(): void }`

- [ ] **Step 1: Add Vitest dependency and scripts**

```bash
npm install -D vitest
```

Update `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Update `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Add to `tsconfig.json` compilerOptions:

```json
"types": ["vitest/globals"]
```

Or keep imports from `vitest` without globals (prefer explicit `import { describe, it, expect } from 'vitest'` — then skip `types`).

- [ ] **Step 2: Write failing tracker tests**

Create `src/lib/tracker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SortTracker } from './tracker';

describe('SortTracker', () => {
  it('assigns stable ids across frames for overlapping boxes', () => {
    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
    const t0 = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      0,
    );
    expect(t0).toHaveLength(1);
    const id = t0[0].trackId;

    const t1 = tracker.update(
      [{ className: 'person', confidence: 0.88, bbox: [12, 12, 52, 82] }],
      100,
    );
    expect(t1).toHaveLength(1);
    expect(t1[0].trackId).toBe(id);
  });

  it('hides tracks until minHits', () => {
    const tracker = new SortTracker({ minHits: 2, maxAgeMs: 750, iouThreshold: 0.3 });
    const t0 = tracker.update(
      [{ className: 'car', confidence: 0.8, bbox: [100, 100, 200, 180] }],
      0,
    );
    expect(t0).toHaveLength(0);
    const t1 = tracker.update(
      [{ className: 'car', confidence: 0.8, bbox: [102, 100, 202, 180] }],
      50,
    );
    expect(t1).toHaveLength(1);
  });

  it('drops tracks after maxAgeMs without matches', () => {
    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
    tracker.update([{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }], 0);
    const still = tracker.update([], 700);
    expect(still).toHaveLength(1);
    const gone = tracker.update([], 800);
    expect(gone).toHaveLength(0);
  });

  it('reset clears ids', () => {
    const tracker = new SortTracker({ minHits: 1 });
    const a = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      0,
    );
    tracker.reset();
    const b = tracker.update(
      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
      10,
    );
    expect(b[0].trackId).not.toBe(a[0].trackId);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npm test
```

Expected: fail resolving `./tracker` or missing `SortTracker`.

- [ ] **Step 4: Implement `src/lib/tracker.ts`**

```ts
export type TrackBBox = [number, number, number, number];

export interface RawDetection {
  className: string;
  confidence: number;
  bbox: TrackBBox;
}

export interface TrackedObject {
  trackId: number;
  className: string;
  confidence: number;
  bbox: TrackBBox;
}

interface TrackerOptions {
  iouThreshold?: number;
  maxAgeMs?: number;
  minHits?: number;
}

interface InternalTrack {
  id: number;
  className: string;
  confidence: number;
  bbox: TrackBBox;
  hits: number;
  ageMs: number;
  timeSinceUpdateMs: number;
  // simple constant-velocity on center + size
  vx: number;
  vy: number;
  vw: number;
  vh: number;
}

function iou(a: TrackBBox, b: TrackBBox): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const denom = areaA + areaB - inter;
  return denom > 0 ? inter / denom : 0;
}

function centerSize(b: TrackBBox) {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
}

function fromCenterSize(cx: number, cy: number, w: number, h: number): TrackBBox {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

export class SortTracker {
  private iouThreshold: number;
  private maxAgeMs: number;
  private minHits: number;
  private nextId = 1;
  private tracks: InternalTrack[] = [];
  private lastTs: number | null = null;

  constructor(opts: TrackerOptions = {}) {
    this.iouThreshold = opts.iouThreshold ?? 0.3;
    this.maxAgeMs = opts.maxAgeMs ?? 750;
    this.minHits = opts.minHits ?? 2;
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
    this.lastTs = null;
  }

  update(dets: RawDetection[], nowMs: number): TrackedObject[] {
    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
    this.lastTs = nowMs;

    for (const tr of this.tracks) {
      const { cx, cy, w, h } = centerSize(tr.bbox);
      const ncx = cx + tr.vx * dt;
      const ncy = cy + tr.vy * dt;
      const nw = Math.max(1, w + tr.vw * dt);
      const nh = Math.max(1, h + tr.vh * dt);
      tr.bbox = fromCenterSize(ncx, ncy, nw, nh);
      tr.ageMs += dt;
      tr.timeSinceUpdateMs += dt;
    }

    const trackIdx = this.tracks.map((_, i) => i);
    const detIdx = dets.map((_, i) => i);
    const pairs: { t: number; d: number; score: number }[] = [];
    for (const t of trackIdx) {
      for (const d of detIdx) {
        const score = iou(this.tracks[t].bbox, dets[d].bbox);
        if (score >= this.iouThreshold) pairs.push({ t, d, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedT = new Set<number>();
    const usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.t) || usedD.has(p.d)) continue;
      usedT.add(p.t);
      usedD.add(p.d);
      const tr = this.tracks[p.t];
      const det = dets[p.d];
      const prev = centerSize(tr.bbox);
      const next = centerSize(det.bbox);
      const invDt = dt > 0 ? 1 / dt : 0;
      tr.vx = (next.cx - prev.cx) * invDt;
      tr.vy = (next.cy - prev.cy) * invDt;
      tr.vw = (next.w - prev.w) * invDt;
      tr.vh = (next.h - prev.h) * invDt;
      tr.bbox = det.bbox;
      tr.className = det.className;
      tr.confidence = det.confidence;
      tr.hits += 1;
      tr.timeSinceUpdateMs = 0;
    }

    for (let d = 0; d < dets.length; d++) {
      if (usedD.has(d)) continue;
      const det = dets[d];
      this.tracks.push({
        id: this.nextId++,
        className: det.className,
        confidence: det.confidence,
        bbox: det.bbox,
        hits: 1,
        ageMs: 0,
        timeSinceUpdateMs: 0,
        vx: 0,
        vy: 0,
        vw: 0,
        vh: 0,
      });
    }

    this.tracks = this.tracks.filter((tr) => tr.timeSinceUpdateMs <= this.maxAgeMs);

    return this.tracks
      .filter((tr) => tr.hits >= this.minHits || tr.timeSinceUpdateMs === 0 && tr.hits >= this.minHits)
      .filter((tr) => tr.hits >= this.minHits)
      .map((tr) => ({
        trackId: tr.id,
        className: tr.className,
        confidence: tr.confidence,
        bbox: tr.bbox,
      }));
  }
}
```

Simplify the redundant filter in the return to a single `tr.hits >= this.minHits` check when implementing — do not leave the double-filter as written above.

Correct return:

```ts
return this.tracks
  .filter((tr) => tr.hits >= this.minHits)
  .map((tr) => ({
    trackId: tr.id,
    className: tr.className,
    confidence: tr.confidence,
    bbox: [...tr.bbox] as TrackBBox,
  }));
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json src/lib/tracker.ts src/lib/tracker.test.ts
git commit -m "feat: add SORT-like client tracker with vitest"
```

---
