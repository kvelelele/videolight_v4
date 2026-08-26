# Client MediaPipe Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace server YOLO/ByteTrack analytics with in-browser MediaPipe Object Detector + SORT-like tracking feeding the existing overlay.

**Architecture:** Main thread grabs frames from the playing `<video>`/`<img>`, transfers `ImageBitmap`s to a Vite module worker that runs MediaPipe `detectForVideo` and a SORT-like tracker, then returns `DetectionFrame` payloads. Server analytics package and WebSocket are deleted on branch `ui-tracking`.

**Tech Stack:** React 19, Vite 8, TypeScript, `@mediapipe/tasks-vision`, Vitest (tracker unit tests only)

## Global Constraints

- Branch: `ui-tracking` only; do not merge to main in this plan
- Model: EfficientDet-Lite0 via MediaPipe CDN/Storage (not Lite2)
- Detection API: `runningMode: 'VIDEO'` + `detectForVideo(bitmap, timestampMs)`
- Classes: `person`; map `car`/`bus`/`truck` → `car`
- BBox contract: `[x1,y1,x2,y2]` source pixels for `DetectionOverlay`
- Hook API: `{ frame, ready, loading, error }` (replaces `{ frame, connected, error }`)
- Prefer same-origin/proxy media for frame grab; CORS failures → hook `error`, player stays up
- No server detection fallback
- Tracker: greedy IoU SORT-like, max age 0.75s, min hits 2
- Commits: frequent, one logical change per task

## File structure

| Path | Responsibility |
|------|----------------|
| `src/lib/tracker.ts` | Pure SORT-like tracker |
| `src/lib/tracker.test.ts` | Vitest unit tests for tracker |
| `src/lib/detections.ts` | Shared types + overlay helpers only (no WebSocket) |
| `src/lib/clientAnalytics.ts` | React hook: grab loop + worker lifecycle |
| `src/workers/analyticsWorker.ts` | MediaPipe + tracker in worker |
| `src/components/CameraStreamPlayer.tsx` | Wire new hook / badge |
| `backend/app/analytics/**` | DELETE |
| `backend/app/routers/analytics.py` | DELETE |
| `backend/app/main.py` | Remove analytics wiring |
| `backend/app/config.py` | Remove `analytics_*` |
| `backend/requirements.txt` | Remove ML deps |
| `package.json` | Add `@mediapipe/tasks-vision`, vitest scripts |
| `vite.config.ts` | Vitest `test` config |

---

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

### Task 2: Slim `detections.ts` types (remove WebSocket hook)

**Files:**
- Modify: `src/lib/detections.ts`
- Modify: `src/components/CameraStreamPlayer.tsx` (temporary: comment/stub only if compile breaks — prefer finishing Task 4 same session; if Task 2 alone must compile, leave a thin deprecated stub that returns empty state until Task 4)

**Interfaces:**
- Consumes: none
- Produces: `DetectionTrack`, `DetectionFrame`, `getContentRect`, `CLASS_COLORS`, `CLASS_LABELS` (unchanged shapes)

- [ ] **Step 1: Replace `src/lib/detections.ts` with types + helpers only**

```ts
export interface DetectionTrack {
  trackId: number;
  class: 'person' | 'car' | string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface DetectionFrame {
  ts: number;
  frameWidth: number;
  frameHeight: number;
  tracks: DetectionTrack[];
  error?: string;
}

export function getContentRect(
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
) {
  if (mediaW <= 0 || mediaH <= 0 || containerW <= 0 || containerH <= 0) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }

  const mediaAspect = mediaW / mediaH;
  const containerAspect = containerW / containerH;

  if (mediaAspect > containerAspect) {
    const w = containerW;
    const h = containerW / mediaAspect;
    return { x: 0, y: (containerH - h) / 2, w, h };
  }

  const h = containerH;
  const w = containerH * mediaAspect;
  return { x: (containerW - w) / 2, y: 0, w, h };
}

export const CLASS_COLORS: Record<string, string> = {
  person: '#22c55e',
  car: '#3b82f6',
};

export const CLASS_LABELS: Record<string, string> = {
  person: 'человек',
  car: 'авто',
};
```

- [ ] **Step 2: If `CameraStreamPlayer` still imports `useDetections`, add a one-line temporary stub at bottom of `detections.ts` ONLY if Task 3–4 are not landed in the same working tree commit chain — otherwise skip stub and continue to Task 3 immediately.**

Preferred: do not leave a stub; complete Tasks 3–4 before relying on `npm run build`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/detections.ts
git commit -m "refactor: remove WebSocket detection client from detections.ts"
```

---

### Task 3: Analytics worker (MediaPipe + tracker)

**Files:**
- Create: `src/workers/analyticsWorker.ts`
- Modify: `package.json` (add `@mediapipe/tasks-vision`)

**Interfaces:**
- Consumes: `SortTracker`, `RawDetection` from `../lib/tracker`
- Produces worker protocol:

```ts
// main → worker
type InMsg =
  | { type: 'init' }
  | { type: 'reset' }
  | { type: 'frame'; bitmap: ImageBitmap; width: number; height: number; timestampMs: number };

// worker → main
type OutMsg =
  | { type: 'ready' }
  | { type: 'result'; frame: import('../lib/detections').DetectionFrame }
  | { type: 'error'; message: string };
```

- [ ] **Step 1: Install MediaPipe**

```bash
npm install @mediapipe/tasks-vision
```

- [ ] **Step 2: Implement `src/workers/analyticsWorker.ts`**

```ts
/// <reference lib="webworker" />
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { DetectionFrame } from '../lib/detections';
import { SortTracker, type RawDetection } from '../lib/tracker';

const CLASS_MAP: Record<string, string> = {
  person: 'person',
  car: 'car',
  bus: 'car',
  truck: 'car',
};

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

let detector: ObjectDetector | null = null;
let busy = false;
const tracker = new SortTracker({ iouThreshold: 0.3, maxAgeMs: 750, minHits: 2 });

function post(msg: { type: string; [k: string]: unknown }) {
  self.postMessage(msg);
}

function mapDetections(result: { detections: Array<{
  categories: Array<{ categoryName?: string; score?: number }>;
  boundingBox?: { originX: number; originY: number; width: number; height: number };
}> }): RawDetection[] {
  const out: RawDetection[] = [];
  for (const det of result.detections ?? []) {
    const cat = det.categories?.[0];
    const name = (cat?.categoryName ?? '').toLowerCase();
    const mapped = CLASS_MAP[name];
    if (!mapped) continue;
    const box = det.boundingBox;
    if (!box) continue;
    const score = cat?.score ?? 0;
    out.push({
      className: mapped,
      confidence: score,
      bbox: [
        box.originX,
        box.originY,
        box.originX + box.width,
        box.originY + box.height,
      ],
    });
  }
  return out;
}

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      scoreThreshold: 0.35,
      runningMode: 'VIDEO',
      categoryAllowlist: ['person', 'car', 'bus', 'truck'],
    });
    post({ type: 'ready' });
  } catch (err) {
    // GPU may fail on some devices — retry CPU once
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'CPU',
        },
        scoreThreshold: 0.35,
        runningMode: 'VIDEO',
        categoryAllowlist: ['person', 'car', 'bus', 'truck'],
      });
      post({ type: 'ready' });
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      post({ type: 'error', message });
    }
  }
}

self.onmessage = async (event: MessageEvent) => {
  const data = event.data as
    | { type: 'init' }
    | { type: 'reset' }
    | { type: 'frame'; bitmap: ImageBitmap; width: number; height: number; timestampMs: number };

  if (data.type === 'init') {
    await init();
    return;
  }
  if (data.type === 'reset') {
    tracker.reset();
    return;
  }
  if (data.type !== 'frame') return;

  const { bitmap, width, height, timestampMs } = data;
  if (!detector || busy) {
    bitmap.close();
    return;
  }

  busy = true;
  try {
    const result = detector.detectForVideo(bitmap, timestampMs);
    const raw = mapDetections(result);
    const tracked = tracker.update(raw, timestampMs);
    const frame: DetectionFrame = {
      ts: timestampMs / 1000,
      frameWidth: width,
      frameHeight: height,
      tracks: tracked.map((t) => ({
        trackId: t.trackId,
        class: t.className,
        bbox: t.bbox,
        confidence: t.confidence,
      })),
    };
    post({ type: 'result', frame });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', message });
  } finally {
    bitmap.close();
    busy = false;
  }
};
```

If `categoryAllowlist` causes empty results for this model build, remove it and rely on `CLASS_MAP` only.

If Vite ESM worker fails to load MediaPipe at runtime, switch this file to a classic worker using `importScripts` + `vision_bundle.js` per MediaPipe issue #5479 / samples-web — keep the same message protocol.

- [ ] **Step 3: Smoke-check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors in new worker file (skipLibCheck already on).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/workers/analyticsWorker.ts
git commit -m "feat: add MediaPipe analytics worker with client tracking"
```

---

### Task 4: `useClientAnalytics` hook + wire player

**Files:**
- Create: `src/lib/clientAnalytics.ts`
- Modify: `src/components/CameraStreamPlayer.tsx`

**Interfaces:**
- Consumes: worker protocol from Task 3; `DetectionFrame` from `detections.ts`
- Produces:
  - `useClientAnalytics(mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>, cameraId: string, enabled: boolean): { frame: DetectionFrame | null; ready: boolean; loading: boolean; error: string | null }`

- [ ] **Step 1: Implement `src/lib/clientAnalytics.ts`**

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DetectionFrame } from './detections';

const TARGET_INTERVAL_MS = 1000 / 12;

function mediaSize(media: HTMLVideoElement | HTMLImageElement) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

export function useClientAnalytics(
  mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>,
  cameraId: string,
  enabled: boolean,
) {
  const [frame, setFrame] = useState<DetectionFrame | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const inflightRef = useRef(false);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      setReady(false);
      setLoading(false);
      setError(null);
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }

    setLoading(true);
    setReady(false);
    setError(null);
    setFrame(null);

    let cancelled = false;
    const worker = new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      if (cancelled) return;
      const data = event.data as
        | { type: 'ready' }
        | { type: 'result'; frame: DetectionFrame }
        | { type: 'error'; message: string };

      if (data.type === 'ready') {
        setReady(true);
        setLoading(false);
        setError(null);
        return;
      }
      if (data.type === 'error') {
        setError(data.message || 'Аналитика недоступна');
        setLoading(false);
        setReady(false);
        inflightRef.current = false;
        return;
      }
      if (data.type === 'result') {
        inflightRef.current = false;
        setFrame(data.frame);
      }
    };

    worker.onerror = () => {
      if (cancelled) return;
      setError('Аналитика недоступна');
      setLoading(false);
      setReady(false);
    };

    worker.postMessage({ type: 'init' });

    return () => {
      cancelled = true;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [enabled]);

  // Reset tracker on camera change without full model reload
  useEffect(() => {
    if (!enabled || !workerRef.current) return;
    workerRef.current.postMessage({ type: 'reset' });
    setFrame(null);
  }, [cameraId, enabled]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let cancelled = false;

    const tick = async (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);

      const worker = workerRef.current;
      const media = mediaRef.current;
      if (!worker || !media || !ready || inflightRef.current) return;
      if (now - lastSentRef.current < TARGET_INTERVAL_MS) return;

      const { width, height } = mediaSize(media);
      if (width <= 0 || height <= 0) return;

      try {
        const bitmap = await createImageBitmap(media);
        if (cancelled || inflightRef.current) {
          bitmap.close();
          return;
        }
        inflightRef.current = true;
        lastSentRef.current = now;
        worker.postMessage(
          { type: 'frame', bitmap, width, height, timestampMs: now },
          [bitmap],
        );
      } catch (err) {
        inflightRef.current = false;
        setError(err instanceof Error ? err.message : 'Не удалось захватить кадр');
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [enabled, ready, mediaRef]);

  return { frame, ready, loading, error };
}
```

- [ ] **Step 2: Update `CameraStreamPlayer.tsx` imports and hook usage**

Replace:

```ts
import { useDetections } from '../lib/detections';
```

with:

```ts
import { useClientAnalytics } from '../lib/clientAnalytics';
```

Replace:

```ts
const { frame: detectionFrame, connected: analyticsConnected, error: analyticsError } =
  useDetections(camera.id, analyticsEnabled);
```

with:

```ts
const {
  frame: detectionFrame,
  ready: analyticsReadyFlag,
  loading: analyticsLoading,
  error: analyticsError,
} = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
```

Note: `mediaRef` is defined after the current hook call today — **reorder** so `mediaRef` exists before the hook:

```ts
const mediaRef = showVideo ? videoRef : imgRef;
const {
  frame: detectionFrame,
  ready: analyticsReadyFlag,
  loading: analyticsLoading,
  error: analyticsError,
} = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
```

Update badge:

```tsx
{(analyticsReadyFlag || analyticsLoading || analyticsError) && (
  <div className="absolute top-2 right-2 rounded-md bg-black/50 px-2 py-1">
    <span className={`text-[10px] ${analyticsError ? 'text-red-300' : 'text-emerald-300'}`}>
      {analyticsError
        ? 'Аналитика недоступна'
        : analyticsLoading
          ? 'Загрузка модели…'
          : `Детекция · ${detectionFrame?.tracks?.length ?? 0}`}
    </span>
  </div>
)}
```

- [ ] **Step 3: Build frontend**

```bash
npm run build
```

Expected: success. If worker fails to bundle, fix Vite worker URL import.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clientAnalytics.ts src/components/CameraStreamPlayer.tsx src/lib/detections.ts
git commit -m "feat: run client MediaPipe analytics in CameraStreamPlayer"
```

---

### Task 5: Remove server analytics

**Files:**
- Delete: `backend/app/analytics/__init__.py`
- Delete: `backend/app/analytics/capture.py`
- Delete: `backend/app/analytics/detector.py`
- Delete: `backend/app/analytics/pipeline.py`
- Delete: `backend/app/routers/analytics.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: none
- Produces: FastAPI app without analytics router; health/auth/cameras/streaming unchanged

- [ ] **Step 1: Rewrite `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
from app.routers import auth, cameras
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Vision Control API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cameras.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 2: Remove analytics settings from `backend/app/config.py`**

Keep only:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    jwt_secret: str = "dev-secret-change-me"
    database_url: str = "sqlite:///./data/videolight.db"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_algorithm: str = "HS256"


settings = Settings()
```

- [ ] **Step 3: Trim `backend/requirements.txt`**

```text
fastapi==0.141.1
uvicorn[standard]==0.52.4
sqlalchemy==2.0.52
pydantic==2.13.4
pydantic-settings==2.15.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
python-jose[cryptography]==3.5.0
python-multipart==0.0.32
email-validator==2.3.0
httpx==0.28.1
```

- [ ] **Step 4: Delete analytics files**

```bash
git rm -r backend/app/analytics
git rm backend/app/routers/analytics.py
```

- [ ] **Step 5: Verify API imports**

```bash
cd backend
.venv/Scripts/python -c "from app.main import app; print('ok', app.title)"
```

Expected: `ok Vision Control API`

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/config.py backend/requirements.txt
git commit -m "chore: remove server-side detection analytics pipeline"
```

---

### Task 6: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Start stack**

```bash
npm run dev:api
npm run dev
```

- [ ] **Step 2: Open a proxied/HLS camera, wait for «Загрузка модели…» → «Детекция · N»**

Expected: person/car boxes, stable IDs while moving, UI responsive.

- [ ] **Step 3: Switch cameras**

Expected: boxes clear, no stale trackIds from previous camera.

- [ ] **Step 4: Confirm `/api/cameras/{id}/detections` is gone**

```bash
curl -i -N "http://127.0.0.1:8000/api/health"
```

Expected: health ok. WebSocket detections endpoint should 404 / not exist.

- [ ] **Step 5: Commit only if verification found fixes**

If bugs fixed during verification, commit with messages like `fix: ...`. Otherwise no empty commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| MediaPipe VIDEO + detectForVideo | Task 3 |
| EfficientDet-Lite0 CDN | Task 3 |
| Worker + main grab latest-only | Tasks 3–4 |
| SORT-like greedy IoU, 0.75s, minHits 2 | Task 1 |
| DetectionFrame / overlay unchanged | Tasks 2, 4 |
| Hook `{ frame, ready, loading, error }` | Task 4 |
| cameraId tracker reset | Task 4 |
| Remove server analytics + deps | Task 5 |
| CORS/tainted grab → error | Task 4 |
| Loading badge copy | Task 4 |
| Manual tests | Task 6 |

No placeholders left after self-review. GPU→CPU fallback added in Task 3 (practical, still within spec).
