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
  ├─ video/img (unchanged)
  ├─ useClientAnalytics(mediaRef, enabled)
  │     ├─ main thread: frame grab (rAF, throttle ~10–15 FPS)
  │     ├─ worker: MediaPipe ObjectDetector → raw boxes
  │     ├─ worker: SORT-like tracker → trackId + smoothed bbox
  │     └─ returns DetectionFrame { ts, frameWidth, frameHeight, tracks }
  └─ DetectionOverlay (same contract)
```

- Start analytics after stream reaches `playing` plus a short delay (same UX as today).
- Drop intermediate frames while inference is in flight (latest-only).
- Load MediaPipe model once; reuse across cameras in the session when practical; reset tracker state on camera change.

## Data flow

1. **Grab (main):** When enabled and media is drawable, paint into a canvas (or equivalent), `createImageBitmap`, `postMessage` to worker with transferable ownership.
2. **Detect (worker):** `@mediapipe/tasks-vision` `ObjectDetector.detect(image)`.
   - Confidence threshold ≈ 0.35
   - Keep COCO-like classes used today: `person`; map `car` / `bus` / `truck` → `car`
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

5. **Draw:** Existing `DetectionOverlay` + `CLASS_COLORS` / `CLASS_LABELS` unchanged.

## Client modules

| Module | Role |
|--------|------|
| `src/lib/clientAnalytics.ts` | Hook replacing `useDetections`; owns worker lifecycle, enabled flag, frame/error state |
| `src/workers/analyticsWorker.ts` | MediaPipe init, detect, track, reply with `DetectionFrame` |
| `src/lib/tracker.ts` (in worker bundle or shared) | SORT-like tracker pure logic |
| `src/components/CameraStreamPlayer.tsx` | Wire `useClientAnalytics` instead of WebSocket hook |
| `src/lib/detections.ts` | Keep types + overlay helpers; remove WebSocket URL / `useDetections` |

Model assets: load EfficientDet-Lite2 (MediaPipe Object Detector) from the official Google Storage CDN used by Tasks Vision docs. No local vendoring in v1.

Dependencies to add: `@mediapipe/tasks-vision`. Use Vite’s native `new Worker(new URL(...), { type: 'module' })` for the analytics worker.

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
| Model still loading | Loading status; empty overlay |
| MediaPipe / worker failure | Hook `error`; UI message like current «аналитика недоступна»; player keeps working |
| Tainted canvas / grab failure | Surface error; do not crash player (`AnalyticsErrorBoundary`) |
| Stream paused / not playing | Stop grab; reset tracker on camera change |
| No objects | Empty `tracks[]`, no error |
| Unsupported / no drawable media | Analytics disabled |

## Testing (manual)

1. HLS/proxy camera: person/car boxes appear, IDs stable while objects move
2. UI stays responsive during inference (no freezes)
3. Switch cameras: tracks reset, no stale boxes
4. Backend starts without ML packages
5. Overlay still letterboxes correctly with `object-contain`

## Success criteria

- No server detection WebSocket or YOLO pipeline on `ui-tracking`
- Client detection + tracking drives the existing overlay
- Smooth realtime feel on a typical desktop browser
- Track IDs persist across brief detection gaps
