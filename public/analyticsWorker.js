/* global importScripts, Vision */
/**
 * Classic (non-module) analytics worker.
 * MediaPipe Tasks Vision fails with "ModuleFactory not set" inside Vite-bundled
 * ES module workers; importScripts + vision_bundle.js works.
 */

importScripts(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js',
);

const { FilesetResolver, ObjectDetector } = Vision;

const CLASS_MAP = {
  person: 'person',
  car: 'car',
  bus: 'car',
  truck: 'car',
};

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const CATEGORY_ALLOWLIST = ['person', 'car', 'bus', 'truck'];

function iou(a, b) {
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

function centerSize(b) {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
}

function fromCenterSize(cx, cy, w, h) {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

class SortTracker {
  constructor(opts = {}) {
    this.iouThreshold = opts.iouThreshold ?? 0.3;
    this.maxAgeMs = opts.maxAgeMs ?? 750;
    this.minHits = opts.minHits ?? 2;
    this.nextId = 1;
    this.tracks = [];
    this.lastTs = null;
  }

  reset() {
    this.tracks = [];
    this.lastTs = null;
  }

  update(dets, nowMs) {
    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
    this.lastTs = nowMs;

    for (const tr of this.tracks) {
      const { cx, cy, w, h } = centerSize(tr.bbox);
      tr.bbox = fromCenterSize(
        cx + tr.vx * dt,
        cy + tr.vy * dt,
        Math.max(1, w + tr.vw * dt),
        Math.max(1, h + tr.vh * dt),
      );
      tr.ageMs += dt;
      tr.timeSinceUpdateMs += dt;
    }

    const pairs = [];
    for (let t = 0; t < this.tracks.length; t++) {
      for (let d = 0; d < dets.length; d++) {
        const score = iou(this.tracks[t].bbox, dets[d].bbox);
        if (score >= this.iouThreshold) pairs.push({ t, d, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedT = new Set();
    const usedD = new Set();
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
      tr.bbox = det.bbox.slice();
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
        bbox: det.bbox.slice(),
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
      .filter((tr) => tr.hits >= this.minHits)
      .map((tr) => ({
        trackId: tr.id,
        className: tr.className,
        confidence: tr.confidence,
        bbox: tr.bbox.slice(),
      }));
  }
}

let detector = null;
let busy = false;
const tracker = new SortTracker({ iouThreshold: 0.3, maxAgeMs: 750, minHits: 2 });

function post(message) {
  self.postMessage(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function mapDetections(result) {
  const detections = [];
  for (const detection of result.detections ?? []) {
    const category = detection.categories?.[0];
    const className = CLASS_MAP[(category?.categoryName ?? '').toLowerCase()];
    const box = detection.boundingBox;
    if (!className || !box) continue;
    detections.push({
      className,
      confidence: category?.score ?? 0,
      bbox: [
        box.originX,
        box.originY,
        box.originX + box.width,
        box.originY + box.height,
      ],
    });
  }
  return detections;
}

async function createDetector(delegate) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    scoreThreshold: 0.35,
    runningMode: 'VIDEO',
    categoryAllowlist: CATEGORY_ALLOWLIST,
  });
}

async function init() {
  try {
    detector = await createDetector('GPU');
    post({ type: 'ready' });
  } catch {
    try {
      detector = await createDetector('CPU');
      post({ type: 'ready' });
    } catch (error) {
      post({ type: 'error', message: errorMessage(error) });
    }
  }
}

self.onmessage = async (event) => {
  const data = event.data;

  if (data.type === 'init') {
    await init();
    return;
  }

  if (data.type === 'reset') {
    tracker.reset();
    return;
  }

  if (data.type !== 'frame') return;

  const { bitmap, width, height, timestampMs, generation } = data;
  if (!detector || busy) {
    bitmap.close();
    return;
  }

  busy = true;
  try {
    const result = detector.detectForVideo(bitmap, timestampMs);
    const tracked = tracker.update(mapDetections(result), timestampMs);
    post({
      type: 'result',
      generation,
      frame: {
        ts: timestampMs / 1000,
        frameWidth: width,
        frameHeight: height,
        tracks: tracked.map((track) => ({
          trackId: track.trackId,
          class: track.className,
          bbox: track.bbox,
          confidence: track.confidence,
        })),
      },
    });
  } catch (error) {
    post({ type: 'error', message: errorMessage(error), generation });
  } finally {
    bitmap.close();
    busy = false;
  }
};
