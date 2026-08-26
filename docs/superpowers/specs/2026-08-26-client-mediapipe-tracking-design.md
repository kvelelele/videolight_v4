# Client-side MediaPipe detection + tracking

**Branch:** `ui-tracking`  
**Date:** 2026-08-26  
**Status:** Approved

## Goal

Move object detection and multi-object tracking from the FastAPI/YOLO/ByteTrack server pipeline to the browser. Server analytics is removed in this branch (it remains on other branches such as `main`).

Priorities: stable FPS, smooth overlay, reliable track IDs. Prefer MediaPipe Object Detector over ONNX YOLO for browser realtime stability.

## Non-goals

- Replacing video streaming / proxy / HLS behavior
- Changing overlay visual design beyond keeping current labels/colors
- Keeping a server fallback for detections
- Training or fine-tuning models

## Architecture

```
CameraStreamPlayer
  ├─ video/img (unchanged; prefer same-origin / proxy URL for grab)
  ├─ useClientAnalytics(mediaRef, cameraId, enabled)
  │     ├─ main thread: frame grab (rAF, throttle ~10–15 FPS)
  │     ├─ worker: MediaPipe ObjectDetector (VIDEO mode) → raw boxes
  │     ├─ worker: SORT-like tracker → trackId + smoothed bbox
  │     └─ returns { frame, ready, loading, error }
  └─ DetectionOverlay (same DetectionFrame contract)
```

- Start analytics after stream reaches `playing` plus a short delay (same UX as today).
- Drop intermediate frames while inference is in flight (latest-only).
- Load MediaPipe model once per worker lifetime; reset **tracker** state when `cameraId` changes (keep detector warm).
- For frame grab reliability, prefer the same-origin proxied stream already used for HLS/proxy playback. Direct cross-origin URLs without CORS may taint the media element and block `createImageBitmap` — treat as analytics error, do not crash the player.

## Data flow

1. **Grab (main):** When enabled and media is drawable, create an `ImageBitmap` from the video/img (directly when possible, else via canvas). `postMessage` to the worker with transferable ownership. Close/drop bitmaps that are superseded.
2. **Detect (worker):** `@mediapipe/tasks-vision` `ObjectDetector` with:
   - `runningMode: 'VIDEO'`
   - `detectForVideo(bitmap, timestampMs)` (not IMAGE `detect()`)
   - `scoreThreshold` ≈ 0.35
   - Optional `categoryAllowlist` for person/car/bus/truck when supported; otherwise filter in JS
   - Map classes: `person` → `person`; `car` / `bus` / `truck` → `car`
   - Convert MediaPipe `boundingBox { originX, originY, width, height }` → `[x1, y1, x2, y2]` in input-image pixels
3. **Track (worker):** SORT-like tracker
   - Kalman filter on center + size
   - Association by IoU with greedy matching (sufficient at low object counts)
   - Max age: 0.75s without a matched detection
   - Min hits: 2 before a track is emitted
4. **Emit:** Same payload shape as the former WebSocket API:

```ts
interface DetectionTrack {
  trackId: number;
  class: 'person' | 'car' | string;
  bbox: [number, number, number, number]; // x1,y1,x2,y2 in source pixels
  confidence: number;
}

interface DetectionFrame {
  ts: number;
  frameWidth: number;
  frameHeight: number;
  tracks: DetectionTrack[];
  error?: string;
}
```

5. **Hook → UI:** Replace `useDetections`’s `{ frame, connected, error }` with:
   - `frame` — latest `DetectionFrame | null`
   - `loading` — model/worker still initializing
   - `ready` — detector ready (replaces `connected` for the status badge)
   - `error` — string | null  
   Badge copy stays: error → «Аналитика недоступна»; else → `Детекция · N` when `ready`.

6. **Draw:** Existing `DetectionOverlay` + `CLASS_COLORS` / `CLASS_LABELS` unchanged.

## Client modules

| Module | Role |
|--------|------|
| `src/lib/clientAnalytics.ts` | Hook replacing `useDetections`; owns worker lifecycle, `cameraId` reset, enabled flag, `{ frame, ready, loading, error }` |
| `src/workers/analyticsWorker.ts` | MediaPipe init, `detectForVideo`, track, reply with `DetectionFrame` |
| `src/lib/tracker.ts` | SORT-like tracker pure logic (imported into worker) |
| `src/components/CameraStreamPlayer.tsx` | Wire `useClientAnalytics`; map `ready` where `connected` was used |
| `src/lib/detections.ts` | Keep types + overlay helpers; remove WebSocket URL / `useDetections` |

**Model:** EfficientDet-**Lite0** (official MediaPipe default for browser balance). Load from Google Storage / jsDelivr WASM paths used in Tasks Vision docs. Lite2 is out of scope for v1 (heavier).

**Worker packaging:** Prefer Vite `new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), { type: 'module' })` with a recent `@mediapipe/tasks-vision` (follow [mediapipe-samples-web](https://github.com/google-ai-edge/mediapipe-samples-web) object-detector worker pattern). If ESM + MediaPipe fails in practice, fall back to a classic worker that loads `vision_bundle.js` via `importScripts` — do not block the feature on ESM purity.

Dependencies to add: `@mediapipe/tasks-vision`.

## Backend removals (this branch only)

Delete / unwire:

- `backend/app/analytics/` (entire package: capture, detector, pipeline)
- `backend/app/routers/analytics.py`
- `main.py` analytics router + `pipeline_manager.shutdown_all`
- `config.py` `analytics_*` settings
- `requirements.txt`: `ultralytics`, `supervision`, `opencv-python-headless`, `numpy` (analytics-only)

Streaming, auth, cameras, and proxy remain unchanged.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Model still loading | `loading=true`; empty overlay; no false “unavailable” badge |
| MediaPipe / worker failure | `error` set; «Аналитика недоступна»; player keeps working |
| Tainted canvas / CORS grab failure (often direct external URL) | `error` set; do not crash player (`AnalyticsErrorBoundary`) |
| Stream paused / not playing | Stop grab; on `cameraId` change reset tracker (message to worker) |
| No objects | Empty `tracks[]`, no error |
| Unsupported / no drawable media | Analytics disabled (`enabled=false`) |

## Testing (manual)

1. Same-origin / proxy camera: person/car boxes appear, IDs stable while objects move
2. UI stays responsive during inference (no freezes)
3. Switch cameras: tracks reset, no stale boxes; model does not fully reload if worker stays alive
4. Backend starts without ML packages
5. Overlay still letterboxes correctly with `object-contain`
6. (Optional) Direct cross-origin stream: analytics fails gracefully without blanking video

## Success criteria

- No server detection WebSocket or YOLO pipeline on `ui-tracking`
- Client detection + tracking drives the existing overlay
- Smooth realtime feel on a typical desktop browser
- Track IDs persist across brief detection gaps
- VIDEO-mode MediaPipe path (`detectForVideo`) is used for the live player
