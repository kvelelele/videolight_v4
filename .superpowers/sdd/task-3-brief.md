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
