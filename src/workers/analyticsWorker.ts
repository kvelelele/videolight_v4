/// <reference lib="webworker" />

import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { DetectionFrame } from '../lib/detections';
import { SortTracker, type RawDetection } from '../lib/tracker';

type InMsg =
  | { type: 'init' }
  | { type: 'reset' }
  | {
      type: 'frame';
      bitmap: ImageBitmap;
      width: number;
      height: number;
      timestampMs: number;
      generation: number;
    };

type OutMsg =
  | { type: 'ready' }
  | { type: 'result'; frame: DetectionFrame; generation: number }
  | { type: 'error'; message: string; generation?: number };

const CLASS_MAP: Record<string, string> = {
  person: 'person',
  car: 'car',
  bus: 'car',
  truck: 'car',
};

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const CATEGORY_ALLOWLIST = ['person', 'car', 'bus', 'truck'];

let detector: ObjectDetector | null = null;
let busy = false;
const tracker = new SortTracker({ iouThreshold: 0.3, maxAgeMs: 750, minHits: 2 });

function post(message: OutMsg): void {
  self.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapDetections(
  result: ReturnType<ObjectDetector['detectForVideo']>,
): RawDetection[] {
  const detections: RawDetection[] = [];

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

async function createDetector(delegate: 'GPU' | 'CPU'): Promise<ObjectDetector> {
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

async function init(): Promise<void> {
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

self.onmessage = async (event: MessageEvent<InMsg>): Promise<void> => {
  const data = event.data;

  if (data.type === 'init') {
    await init();
    return;
  }

  if (data.type === 'reset') {
    tracker.reset();
    return;
  }

  const { bitmap, width, height, timestampMs, generation } = data;
  if (!detector || busy) {
    bitmap.close();
    return;
  }

  busy = true;
  try {
    const result = detector.detectForVideo(bitmap, timestampMs);
    const tracked = tracker.update(mapDetections(result), timestampMs);
    const frame: DetectionFrame = {
      ts: timestampMs / 1000,
      frameWidth: width,
      frameHeight: height,
      tracks: tracked.map((track) => ({
        trackId: track.trackId,
        class: track.className,
        bbox: track.bbox,
        confidence: track.confidence,
      })),
    };
    post({ type: 'result', frame, generation });
  } catch (error) {
    post({ type: 'error', message: errorMessage(error), generation });
  } finally {
    bitmap.close();
    busy = false;
  }
};
