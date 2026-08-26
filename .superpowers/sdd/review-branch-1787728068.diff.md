# Whole-branch review package
MERGE_BASE: 75cc8355149a3f3ea17a4cc4e1319d882370ac15
HEAD: b9653516c98d07cf53ebd10293e5b59f67e4b630

## Commits
`
b965351 chore: remove server-side detection analytics pipeline
ced25eb fix: keep client analytics worker warm
bcd263a feat: run client MediaPipe analytics in CameraStreamPlayer
738b232 feat: add MediaPipe analytics worker with client tracking
572a92f refactor: remove WebSocket detection client from detections.ts
e75033e fix(tracker): document reset monotonic IDs and copy input bboxes
31aac19 feat: add SORT-like client tracker with vitest
a28db6d docs: add client MediaPipe tracking implementation plan
5f07e8e docs: fix MediaPipe client tracking design gaps
93542ac docs: client MediaPipe tracking design for ui-tracking
`

## Stat
`
 .superpowers/sdd/task-1-report.md                  |   98 ++
 .superpowers/sdd/task-4-report.md                  |   52 +
 backend/app/analytics/__init__.py                  |    3 -
 backend/app/analytics/capture.py                   |  214 ----
 backend/app/analytics/detector.py                  |  105 --
 backend/app/analytics/pipeline.py                  |  208 ----
 backend/app/config.py                              |    5 -
 backend/app/main.py                                |    5 +-
 backend/app/routers/analytics.py                   |   66 --
 backend/requirements.txt                           |    4 -
 .../plans/2026-08-26-client-mediapipe-tracking.md  | 1042 ++++++++++++++++++++
 .../2026-08-26-client-mediapipe-tracking-design.md |  135 +++
 package-lock.json                                  |  385 +++++++-
 package.json                                       |    8 +-
 src/components/CameraStreamPlayer.tsx              |   16 +-
 src/lib/clientAnalytics.ts                         |  162 +++
 src/lib/detections.ts                              |  119 ---
 src/lib/tracker.test.ts                            |   58 ++
 src/lib/tracker.ts                                 |  157 +++
 src/workers/analyticsWorker.ts                     |  142 +++
 vite.config.ts                                     |    4 +
 21 files changed, 2252 insertions(+), 736 deletions(-)
`

## Diff
`diff
diff --git a/.superpowers/sdd/task-1-report.md b/.superpowers/sdd/task-1-report.md
new file mode 100644
index 0000000..1db2f9d
--- /dev/null
+++ b/.superpowers/sdd/task-1-report.md
@@ -0,0 +1,98 @@
+# Task 1 Report: Vitest + SORT-like tracker
+
+## What was implemented
+
+- Added **Vitest** (`vitest@^4.1.11`) as a dev dependency with `test` and `test:watch` npm scripts.
+- Configured Vitest in `vite.config.ts` (node environment, `src/**/*.test.ts` include pattern).
+- Created **`SortTracker`** вЂ” a pure TypeScript SORT-like multi-object tracker in `src/lib/tracker.ts`:
+  - IoU-based greedy assignment
+  - Constant-velocity prediction on bbox center + size
+  - Configurable `iouThreshold`, `maxAgeMs`, `minHits`
+  - `reset()` clears active tracks and timestamp state
+- Added 4 unit tests in `src/lib/tracker.test.ts` covering stable IDs, minHits gating, maxAge expiry, and reset behavior.
+
+**Not changed:** `tsconfig.json` вЂ” per resolution, explicit `import { describe, it, expect } from 'vitest'` used instead of `types: ["vitest/globals"]`.
+
+## TDD evidence
+
+### RED (Step 3)
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ FAIL  src/lib/tracker.test.ts [ src/lib/tracker.test.ts ]
+Error: Cannot find module './tracker' imported from C:/DevPrj/videolight_v4/src/lib/tracker.test.ts
+ вќЇ src/lib/tracker.test.ts:2:1
+      1| import { describe, expect, it } from 'vitest';
+      2| import { SortTracker } from './tracker';
+       | ^
+
+ Test Files  1 failed (1)
+      Tests  no tests
+```
+
+Tests could not run because `tracker.ts` did not exist yet вЂ” expected RED.
+
+### GREEN (Step 5)
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ Test Files  1 passed (1)
+      Tests  4 passed (4)
+   Duration  294ms
+```
+
+All 4 tracker tests pass.
+
+## Files changed
+
+| File | Action |
+|------|--------|
+| `package.json` | Modified вЂ” added vitest dep + test scripts |
+| `package-lock.json` | Modified вЂ” lockfile update |
+| `vite.config.ts` | Modified вЂ” vitest config block |
+| `src/lib/tracker.ts` | Created вЂ” SortTracker implementation |
+| `src/lib/tracker.test.ts` | Created вЂ” 4 unit tests |
+
+## Self-review
+
+1. **Single filter applied** вЂ” return uses one `tr.hits >= this.minHits` filter (not the redundant double-filter from the plan snippet).
+2. **BBox copies** вЂ” returned bboxes use `[...tr.bbox] as TrackBBox` to avoid aliasing internal state.
+3. **reset() deviation** вЂ” plan snippet resets `nextId = 1`, but the verbatim test `reset clears ids` requires the post-reset track ID to differ from the pre-reset ID. Implemented reset clears `tracks` and `lastTs` only, leaving `nextId` monotonic. This matches test intent ("clears ids" = fresh assignment, not counter rewind).
+4. **No globals** вЂ” tests import explicitly from `vitest`; no tsconfig types pollution.
+5. **Scope** вЂ” no MediaPipe worker, React hook, or UI integration (deferred to later tasks as specified).
+
+## Concerns
+
+1. **Plan vs test inconsistency on `reset()`** вЂ” brief implementation sets `nextId = 1` on reset, but the acceptance test fails with that behavior. Current implementation follows the test; downstream consumers should not assume IDs restart at 1 after reset.
+2. **Greedy IoU matching** вЂ” not optimal assignment (Hungarian); acceptable for MVP but may swap IDs when tracks cross closely.
+3. **No class-aware matching** вЂ” tracks match purely on IoU; different-class overlap could cause ID handoff (unlikely in typical person/car scenes with non-overlapping classes).
+
+## Review fix (Important findings)
+
+**Changes:**
+1. Added one-line JSDoc on `SortTracker.reset()` documenting that track IDs stay monotonic (`nextId` is not reset to 1).
+2. Defensive-copy detection bboxes when storing into internal tracks on IoU match and on new track spawn (`[...det.bbox] as TrackBBox`), so caller mutations to `det.bbox` cannot corrupt tracker state. Return path already copied bboxes.
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ Test Files  1 passed (1)
+      Tests  4 passed (4)
+   Duration  360ms
+```
+
+All 4 tracker tests pass after review fixes.
diff --git a/.superpowers/sdd/task-4-report.md b/.superpowers/sdd/task-4-report.md
new file mode 100644
index 0000000..faac31f
--- /dev/null
+++ b/.superpowers/sdd/task-4-report.md
@@ -0,0 +1,52 @@
+# Task 4 Report: Client analytics hook and player wiring
+
+## Status
+
+Implemented and committed as
+`bcd263a feat: run client MediaPipe analytics in CameraStreamPlayer`.
+
+## Changes
+
+- Added `useClientAnalytics(mediaRef, cameraId, enabled)` with worker lifecycle,
+  model readiness state, camera resets, one-frame backpressure, and 12 FPS
+  capture throttling.
+- Added safe frame capture with transferable `ImageBitmap` messages. Capture
+  failures surface through `error` and stop analytics without affecting stream
+  playback.
+- Wired `CameraStreamPlayer` to the client hook after selecting its media ref.
+- Added loading, error, and ready detection-count badge states.
+- Removed the temporary `useDetections` stub from `detections.ts`.
+
+## Verification evidence
+
+- `npm run build`: passed; Vite bundled
+  `dist/assets/analyticsWorker-DqExiPie.js`.
+- `npm test`: passed, 1 test file and 4 tests.
+- `npx tsc --noEmit`: passed.
+- IDE diagnostics for all three changed source files: no errors.
+
+## Concerns
+
+- Vite retains the existing warning that the main JavaScript chunk exceeds
+  500 kB after minification.
+- Live model/WASM download, camera CORS behavior, and detection output require
+  browser testing against an available camera stream.
+
+## Review fixes
+
+- Decoupled the worker lifecycle from `enabled`: the worker initializes once,
+  remains warm while capture is disabled, and terminates only on unmount.
+- Camera changes now reset tracker state without reloading the model. Generation
+  tags prevent results and detection errors from older capture epochs from
+  updating the current overlay.
+- Capture backpressure is reserved before `createImageBitmap`; capture failures
+  release it and clear the overlay. Worker and detector errors also clear the
+  overlay.
+
+## Review fix verification
+
+- `npm test`: passed, 1 test file and 4 tests.
+- `npm run build`: passed; Vite bundled
+  `dist/assets/analyticsWorker-DU3tBzMS.js`.
+- IDE diagnostics for `clientAnalytics.ts` and `analyticsWorker.ts`: no errors.
+- Vite retained the existing main-chunk size warning.
diff --git a/backend/app/analytics/__init__.py b/backend/app/analytics/__init__.py
deleted file mode 100644
index 13cbbee..0000000
--- a/backend/app/analytics/__init__.py
+++ /dev/null
@@ -1,3 +0,0 @@
-from app.analytics.pipeline import pipeline_manager
-
-__all__ = ["pipeline_manager"]
diff --git a/backend/app/analytics/capture.py b/backend/app/analytics/capture.py
deleted file mode 100644
index 4316363..0000000
--- a/backend/app/analytics/capture.py
+++ /dev/null
@@ -1,214 +0,0 @@
-from __future__ import annotations
-
-import asyncio
-import logging
-import subprocess
-import threading
-from collections.abc import AsyncIterator
-
-import cv2
-import numpy as np
-
-from app.streaming import (
-    FFMPEG_BIN,
-    FFPROBE_BIN,
-    _ffmpeg_input_args,
-    ffmpeg_available,
-    ffprobe_available,
-    is_hls_url,
-)
-
-logger = logging.getLogger(__name__)
-
-INFERENCE_WIDTH = 640
-PROBE_TIMEOUT_SEC = 15
-# Fallback when ffprobe cannot read live HLS metadata (common for Skyline).
-DEFAULT_SIZE = (1280, 720)
-
-
-def _even(value: int) -> int:
-    return value if value % 2 == 0 else value - 1
-
-
-def scaled_size(orig_w: int, orig_h: int, target_w: int = INFERENCE_WIDTH) -> tuple[int, int]:
-    inf_h = _even(int(orig_h * target_w / orig_w))
-    return target_w, max(inf_h, 2)
-
-
-def _probe_video_size_sync(source_url: str) -> tuple[int, int]:
-    """Sync ffprobe вЂ” asyncio subprocess is NotImplemented on some Windows loops."""
-    if not ffprobe_available():
-        raise RuntimeError("ffprobe РЅРµ РЅР°Р№РґРµРЅ вЂ” СѓСЃС‚Р°РЅРѕРІРёС‚Рµ FFmpeg Рё РґРѕР±Р°РІСЊС‚Рµ РІ PATH")
-
-    cmd = [
-        FFPROBE_BIN,
-        "-v",
-        "error",
-        "-analyzeduration",
-        "10M",
-        "-probesize",
-        "10M",
-        "-select_streams",
-        "v:0",
-        "-show_entries",
-        "stream=width,height",
-        "-of",
-        "csv=p=0:s=x",
-        *_ffmpeg_input_args(source_url),
-    ]
-    try:
-        completed = subprocess.run(
-            cmd,
-            capture_output=True,
-            timeout=PROBE_TIMEOUT_SEC,
-            check=False,
-        )
-    except subprocess.TimeoutExpired as exc:
-        raise RuntimeError("РўР°Р№РјР°СѓС‚ РїСЂРё РѕРїСЂРµРґРµР»РµРЅРёРё СЂР°Р·РјРµСЂР° РІРёРґРµРѕ") from exc
-
-    if completed.returncode != 0:
-        detail = completed.stderr.decode("utf-8", errors="replace").strip() or "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїРѕС‚РѕРє"
-        raise RuntimeError(detail)
-
-    text = completed.stdout.decode("utf-8", errors="replace").strip()
-    line = next((ln.strip() for ln in text.splitlines() if "x" in ln), "")
-    parts = line.split("x")
-    if len(parts) != 2:
-        raise RuntimeError(f"РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ СЂР°Р·РјРµСЂ РєР°РґСЂР°: {text!r}")
-
-    try:
-        w, h = int(parts[0]), int(parts[1])
-    except ValueError as exc:
-        raise RuntimeError(f"РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ СЂР°Р·РјРµСЂ РєР°РґСЂР°: {line!r}") from exc
-    if w <= 0 or h <= 0:
-        raise RuntimeError(f"РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ СЂР°Р·РјРµСЂ РєР°РґСЂР°: {line!r}")
-    return w, h
-
-
-def _resolve_size(source_url: str) -> tuple[int, int]:
-    try:
-        return _probe_video_size_sync(source_url)
-    except Exception as exc:
-        logger.warning(
-            "ffprobe size failed for %s (%s); using fallback %sx%s",
-            source_url,
-            exc,
-            DEFAULT_SIZE[0],
-            DEFAULT_SIZE[1],
-        )
-        return DEFAULT_SIZE
-
-
-def _read_exact_sync(stream, size: int) -> bytes:
-    chunks: list[bytes] = []
-    remaining = size
-    while remaining > 0:
-        chunk = stream.read(remaining)
-        if not chunk:
-            raise EOFError("unexpected end of ffmpeg stdout")
-        chunks.append(chunk)
-        remaining -= len(chunk)
-    return b"".join(chunks)
-
-
-def _read_jpeg_frame_sync(stream, leftover: bytearray) -> np.ndarray:
-    """Read one MJPEG frame from a pipe (size unknown ahead of time)."""
-    while True:
-        start = leftover.find(b"\xff\xd8")
-        if start < 0:
-            chunk = stream.read(65536)
-            if not chunk:
-                raise EOFError("unexpected end of ffmpeg stdout")
-            leftover.extend(chunk)
-            if len(leftover) > 8_000_000:
-                leftover.clear()
-            continue
-        if start > 0:
-            del leftover[:start]
-
-        end = leftover.find(b"\xff\xd9", 2)
-        while end < 0:
-            chunk = stream.read(65536)
-            if not chunk:
-                raise EOFError("unexpected end of ffmpeg stdout")
-            leftover.extend(chunk)
-            end = leftover.find(b"\xff\xd9", 2)
-            if len(leftover) > 8_000_000:
-                raise RuntimeError("MJPEG frame too large")
-
-        jpeg = bytes(leftover[: end + 2])
-        del leftover[: end + 2]
-        frame = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
-        if frame is None:
-            continue
-        return frame
-
-
-async def iter_frames(source_url: str) -> AsyncIterator[tuple[np.ndarray, int, int, int, int]]:
-    """Yield BGR frames scaled for inference plus original/scaled dimensions."""
-    if not ffmpeg_available():
-        raise RuntimeError("ffmpeg РЅРµ РЅР°Р№РґРµРЅ вЂ” СѓСЃС‚Р°РЅРѕРІРёС‚Рµ FFmpeg Рё РґРѕР±Р°РІСЊС‚Рµ РІ PATH")
-
-    orig_w, orig_h = await asyncio.to_thread(_resolve_size, source_url)
-    inf_w, inf_h = scaled_size(orig_w, orig_h)
-    use_mjpeg = is_hls_url(source_url)
-    frame_bytes = inf_w * inf_h * 3
-
-    low_latency = [
-        "-fflags",
-        "nobuffer",
-        "-flags",
-        "low_delay",
-    ]
-
-    if use_mjpeg:
-        # MJPEG pipe: no hard dependency on exact raw frame byte size.
-        vf = f"scale={inf_w}:{inf_h}"
-        out_args = ["-an", "-vf", vf, "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "5", "-"]
-    else:
-        vf = f"scale={inf_w}:{inf_h}"
-        out_args = ["-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
-
-    cmd = [
-        FFMPEG_BIN,
-        "-hide_banner",
-        "-loglevel",
-        "error",
-        *low_latency,
-        *_ffmpeg_input_args(source_url),
-        *out_args,
-    ]
-
-    # IMPORTANT: never use stderr=PIPE without a drain thread вЂ” full stderr deadlocks ffmpeg.
-    proc = await asyncio.to_thread(
-        lambda: subprocess.Popen(
-            cmd,
-            stdout=subprocess.PIPE,
-            stderr=subprocess.DEVNULL,
-            bufsize=0,
-        )
-    )
-    assert proc.stdout is not None
-    leftover = bytearray()
-    stop_reader = threading.Event()
-
-    try:
-        while not stop_reader.is_set():
-            try:
-                if use_mjpeg:
-                    frame = await asyncio.to_thread(_read_jpeg_frame_sync, proc.stdout, leftover)
-                    # Prefer actual decoded size if scale drifted.
-                    h, w = frame.shape[:2]
-                    if (w, h) != (inf_w, inf_h):
-                        frame = cv2.resize(frame, (inf_w, inf_h), interpolation=cv2.INTER_AREA)
-                else:
-                    data = await asyncio.to_thread(_read_exact_sync, proc.stdout, frame_bytes)
-                    frame = np.frombuffer(data, dtype=np.uint8).reshape((inf_h, inf_w, 3)).copy()
-            except EOFError:
-                break
-            yield frame, orig_w, orig_h, inf_w, inf_h
-    finally:
-        stop_reader.set()
-        if proc.poll() is None:
-            proc.kill()
-            await asyncio.to_thread(proc.wait)
diff --git a/backend/app/analytics/detector.py b/backend/app/analytics/detector.py
deleted file mode 100644
index ba6608c..0000000
--- a/backend/app/analytics/detector.py
+++ /dev/null
@@ -1,105 +0,0 @@
-from __future__ import annotations
-
-import logging
-from dataclasses import dataclass
-
-import supervision as sv
-
-from app.config import settings
-
-logger = logging.getLogger(__name__)
-
-COCO_CLASSES: dict[int, str] = {
-    0: "person",
-    2: "car",
-    5: "car",  # bus
-    7: "car",  # truck
-}
-TARGET_CLASS_IDS = list(COCO_CLASSES.keys())
-
-_shared_model = None
-
-
-def _resolve_device() -> str:
-    if settings.analytics_device != "auto":
-        return settings.analytics_device
-    try:
-        import torch
-
-        return "cuda" if torch.cuda.is_available() else "cpu"
-    except ImportError:
-        return "cpu"
-
-
-def get_shared_model():
-    global _shared_model
-    if _shared_model is None:
-        from ultralytics import YOLO
-
-        device = _resolve_device()
-        logger.info("Loading YOLO model %s on %s", settings.analytics_model, device)
-        _shared_model = YOLO(settings.analytics_model)
-        _shared_model.overrides["device"] = device
-    return _shared_model
-
-
-@dataclass
-class TrackDetection:
-    track_id: int
-    class_name: str
-    bbox: list[float]
-    confidence: float
-
-
-class CameraTracker:
-    """Per-camera ByteTrack instance backed by a shared YOLO detector."""
-
-    def __init__(self) -> None:
-        self._byte_tracker = sv.ByteTrack()
-
-    def detect_and_track(
-        self,
-        frame,
-        scale_x: float,
-        scale_y: float,
-    ) -> list[TrackDetection]:
-        model = get_shared_model()
-        device = _resolve_device()
-        results = model.predict(
-            frame,
-            classes=TARGET_CLASS_IDS,
-            conf=settings.analytics_confidence,
-            device=device,
-            verbose=False,
-        )
-        if not results:
-            return []
-
-        detections = sv.Detections.from_ultralytics(results[0])
-        detections = self._byte_tracker.update_with_detections(detections)
-        if len(detections) == 0:
-            return []
-
-        output: list[TrackDetection] = []
-        for i in range(len(detections)):
-            if detections.class_id is None or detections.confidence is None:
-                continue
-            class_id = int(detections.class_id[i])
-            if class_id not in COCO_CLASSES:
-                continue
-            track_id = (
-                int(detections.tracker_id[i])
-                if detections.tracker_id is not None
-                else i
-            )
-            confidence = float(detections.confidence[i])
-            x1, y1, x2, y2 = detections.xyxy[i].tolist()
-            output.append(
-                TrackDetection(
-                    track_id=track_id,
-                    class_name=COCO_CLASSES[class_id],
-                    bbox=[x1 * scale_x, y1 * scale_y, x2 * scale_x, y2 * scale_y],
-                    confidence=confidence,
-                )
-            )
-        return output
diff --git a/backend/app/analytics/pipeline.py b/backend/app/analytics/pipeline.py
deleted file mode 100644
index 8af8254..0000000
--- a/backend/app/analytics/pipeline.py
+++ /dev/null
@@ -1,208 +0,0 @@
-from __future__ import annotations
-
-import asyncio
-import json
-import logging
-import time
-from typing import Any
-
-from fastapi import WebSocket
-
-from app.analytics.capture import iter_frames
-from app.analytics.detector import CameraTracker, get_shared_model
-from app.config import settings
-
-logger = logging.getLogger(__name__)
-
-IDLE_STOP_SEC = 5
-
-
-class AnalyticsPipeline:
-    def __init__(self, camera_id: str, source_url: str) -> None:
-        self.camera_id = camera_id
-        self.source_url = source_url
-        self._subscribers: set[WebSocket] = set()
-        self._task: asyncio.Task[None] | None = None
-        self._stop_timer: asyncio.Task[None] | None = None
-        self._tracker = CameraTracker()
-        self._min_interval = 1.0 / max(settings.analytics_target_fps, 0.1)
-        self._last_inference = 0.0
-        self._frame_width = 0
-        self._frame_height = 0
-        self._error: str | None = None
-
-    @property
-    def subscriber_count(self) -> int:
-        return len(self._subscribers)
-
-    async def subscribe(self, websocket: WebSocket) -> None:
-        if self._stop_timer is not None:
-            self._stop_timer.cancel()
-            self._stop_timer = None
-        self._subscribers.add(websocket)
-        if self._error:
-            await self._send(websocket, {"error": self._error})
-        await self._ensure_running()
-
-    async def unsubscribe(self, websocket: WebSocket) -> None:
-        self._subscribers.discard(websocket)
-        if not self._subscribers:
-            self._schedule_idle_stop()
-
-    def _schedule_idle_stop(self) -> None:
-        if self._stop_timer is not None:
-            self._stop_timer.cancel()
-
-        async def _stop_after_delay() -> None:
-            try:
-                await asyncio.sleep(IDLE_STOP_SEC)
-                if not self._subscribers:
-                    await self.stop()
-            except asyncio.CancelledError:
-                pass
-
-        self._stop_timer = asyncio.create_task(_stop_after_delay())
-
-    async def _ensure_running(self) -> None:
-        if self._task is not None and not self._task.done():
-            return
-        self._error = None
-        # Warm model in background so first detection isn't a multi-second download stall.
-        asyncio.create_task(asyncio.to_thread(get_shared_model))
-        self._task = asyncio.create_task(self._run_loop())
-
-    async def stop(self) -> None:
-        if self._task is not None:
-            self._task.cancel()
-            try:
-                await self._task
-            except asyncio.CancelledError:
-                pass
-            self._task = None
-        self._tracker = CameraTracker()
-
-    async def _run_loop(self) -> None:
-        backoff = 1.0
-        while self._subscribers:
-            try:
-                # Keep newest frame; drop intermediates while inference runs.
-                latest: tuple[Any, int, int, int, int] | None = None
-                inference_task: asyncio.Task[list] | None = None
-
-                async for frame, orig_w, orig_h, inf_w, inf_h in iter_frames(self.source_url):
-                    if not self._subscribers:
-                        break
-
-                    latest = (frame, orig_w, orig_h, inf_w, inf_h)
-
-                    if inference_task is not None and inference_task.done():
-                        try:
-                            tracks = inference_task.result()
-                            await self._broadcast(self._build_payload(tracks))
-                            self._error = None
-                            backoff = 1.0
-                        except Exception:
-                            logger.exception("Inference failed for camera %s", self.camera_id)
-                        inference_task = None
-
-                    if inference_task is not None:
-                        continue
-
-                    now = time.monotonic()
-                    if now - self._last_inference < self._min_interval:
-                        continue
-                    if latest is None:
-                        continue
-
-                    frame_s, ow, oh, iw, ih = latest
-                    latest = None
-                    self._last_inference = now
-                    self._frame_width = ow
-                    self._frame_height = oh
-
-                    inference_task = asyncio.create_task(
-                        asyncio.to_thread(
-                            self._tracker.detect_and_track,
-                            frame_s,
-                            ow / iw,
-                            oh / ih,
-                        )
-                    )
-
-                if inference_task is not None:
-                    try:
-                        tracks = await inference_task
-                        if self._subscribers:
-                            await self._broadcast(self._build_payload(tracks))
-                    except Exception:
-                        logger.exception("Final inference failed for camera %s", self.camera_id)
-
-                if self._subscribers:
-                    raise RuntimeError("РџРѕС‚РѕРє РєР°РґСЂРѕРІ Р·Р°РІРµСЂС€РёР»СЃСЏ")
-            except asyncio.CancelledError:
-                raise
-            except Exception as exc:
-                logger.exception("Analytics pipeline error for camera %s", self.camera_id)
-                self._error = str(exc)
-                await self._broadcast({"error": self._error})
-                await asyncio.sleep(backoff)
-                backoff = min(backoff * 2, 30.0)
-            else:
-                backoff = 1.0
-
-    def _build_payload(self, tracks) -> dict[str, Any]:
-        return {
-            "ts": time.time(),
-            "frameWidth": self._frame_width,
-            "frameHeight": self._frame_height,
-            "tracks": [
-                {
-                    "trackId": t.track_id,
-                    "class": t.class_name,
-                    "bbox": [round(v, 1) for v in t.bbox],
-                    "confidence": round(t.confidence, 3),
-                }
-                for t in tracks
-            ],
-        }
-
-    async def _send(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
-        try:
-            await websocket.send_text(json.dumps(payload))
-        except Exception:
-            self._subscribers.discard(websocket)
-
-    async def _broadcast(self, payload: dict[str, Any]) -> None:
-        if not self._subscribers:
-            return
-        dead: list[WebSocket] = []
-        message = json.dumps(payload)
-        for ws in self._subscribers:
-            try:
-                await ws.send_text(message)
-            except Exception:
-                dead.append(ws)
-        for ws in dead:
-            self._subscribers.discard(ws)
-
-
-class PipelineManager:
-    def __init__(self) -> None:
-        self._pipelines: dict[str, AnalyticsPipeline] = {}
-
-    def get_or_create(self, camera_id: str, source_url: str) -> AnalyticsPipeline:
-        pipeline = self._pipelines.get(camera_id)
-        if pipeline is None or pipeline.source_url != source_url:
-            if pipeline is not None:
-                asyncio.create_task(pipeline.stop())
-            pipeline = AnalyticsPipeline(camera_id, source_url)
-            self._pipelines[camera_id] = pipeline
-        return pipeline
-
-    async def shutdown_all(self) -> None:
-        for pipeline in list(self._pipelines.values()):
-            await pipeline.stop()
-        self._pipelines.clear()
-
-
-pipeline_manager = PipelineManager()
diff --git a/backend/app/config.py b/backend/app/config.py
index 6a699da..09300d7 100644
--- a/backend/app/config.py
+++ b/backend/app/config.py
@@ -7,12 +7,7 @@ class Settings(BaseSettings):
     jwt_secret: str = "dev-secret-change-me"
     database_url: str = "sqlite:///./data/videolight.db"
     access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
     jwt_algorithm: str = "HS256"
 
-    analytics_model: str = "yolov8n.pt"
-    analytics_confidence: float = 0.35
-    analytics_target_fps: float = 10.0
-    analytics_device: str = "auto"  # auto | cpu | cuda | 0
-
 
 settings = Settings()
diff --git a/backend/app/main.py b/backend/app/main.py
index debe7f9..d261600 100644
--- a/backend/app/main.py
+++ b/backend/app/main.py
@@ -1,13 +1,12 @@
 from contextlib import asynccontextmanager
 
 from fastapi import FastAPI
 from fastapi.middleware.cors import CORSMiddleware
 
-from app.analytics.pipeline import pipeline_manager
 from app.database import Base, SessionLocal, engine
-from app.routers import analytics, auth, cameras
+from app.routers import auth, cameras
 from app.seed import seed_if_empty
 
 
 @asynccontextmanager
 async def lifespan(_: FastAPI):
@@ -16,11 +15,10 @@ async def lifespan(_: FastAPI):
     try:
         seed_if_empty(db)
     finally:
         db.close()
     yield
-    await pipeline_manager.shutdown_all()
 
 
 app = FastAPI(title="Vision Control API", lifespan=lifespan)
 
 app.add_middleware(
@@ -31,11 +29,10 @@ app.add_middleware(
     allow_headers=["*"],
 )
 
 app.include_router(auth.router)
 app.include_router(cameras.router)
-app.include_router(analytics.router)
 
 
 @app.get("/api/health")
 def health() -> dict[str, str]:
     return {"status": "ok"}
diff --git a/backend/app/routers/analytics.py b/backend/app/routers/analytics.py
deleted file mode 100644
index c7f634d..0000000
--- a/backend/app/routers/analytics.py
+++ /dev/null
@@ -1,66 +0,0 @@
-import logging
-
-from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
-from sqlalchemy.orm import Session
-
-from app.analytics.pipeline import pipeline_manager
-from app.auth import _user_from_token
-from app.database import get_db
-from app.models import Camera
-from app.streaming import ffmpeg_available
-
-logger = logging.getLogger(__name__)
-
-router = APIRouter(prefix="/api/cameras", tags=["analytics"])
-
-UNSUPPORTED_SOURCE_TYPES = {"USB Camera", "Web Camera"}
-
-
-@router.websocket("/{camera_id}/detections")
-async def detections_websocket(
-    websocket: WebSocket,
-    camera_id: str,
-    db: Session = Depends(get_db),
-) -> None:
-    token = websocket.query_params.get("token")
-    if not token:
-        await websocket.close(code=4401, reason="Not authenticated")
-        return
-
-    try:
-        _user_from_token(token, db)
-    except HTTPException:
-        await websocket.close(code=4401, reason="Not authenticated")
-        return
-
-    camera = db.get(Camera, camera_id)
-    if camera is None:
-        await websocket.close(code=4404, reason="Camera not found")
-        return
-
-    if camera.source_type in UNSUPPORTED_SOURCE_TYPES:
-        await websocket.close(code=4400, reason="Unsupported camera type")
-        return
-
-    if not camera.source_url.strip():
-        await websocket.close(code=4400, reason="Empty source URL")
-        return
-
-    if not ffmpeg_available():
-        await websocket.close(code=4503, reason="ffmpeg not available")
-        return
-
-    await websocket.accept()
-
-    pipeline = pipeline_manager.get_or_create(camera_id, camera.source_url)
-    await pipeline.subscribe(websocket)
-
-    try:
-        while True:
-            await websocket.receive_text()
-    except WebSocketDisconnect:
-        pass
-    except Exception:
-        logger.debug("Detections websocket closed for camera %s", camera_id)
-    finally:
-        await pipeline.unsubscribe(websocket)
diff --git a/backend/requirements.txt b/backend/requirements.txt
index d17f96f..04fb4be 100644
--- a/backend/requirements.txt
+++ b/backend/requirements.txt
@@ -7,9 +7,5 @@ passlib[bcrypt]==1.7.4
 bcrypt==4.0.1
 python-jose[cryptography]==3.5.0
 python-multipart==0.0.32
 email-validator==2.3.0
 httpx==0.28.1
-opencv-python-headless>=4.9.0
-ultralytics>=8.3.0
-numpy>=1.26.0
-supervision>=0.25.0
diff --git a/docs/superpowers/plans/2026-08-26-client-mediapipe-tracking.md b/docs/superpowers/plans/2026-08-26-client-mediapipe-tracking.md
new file mode 100644
index 0000000..ffea24a
--- /dev/null
+++ b/docs/superpowers/plans/2026-08-26-client-mediapipe-tracking.md
@@ -0,0 +1,1042 @@
+# Client MediaPipe Tracking Implementation Plan
+
+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
+
+**Goal:** Replace server YOLO/ByteTrack analytics with in-browser MediaPipe Object Detector + SORT-like tracking feeding the existing overlay.
+
+**Architecture:** Main thread grabs frames from the playing `<video>`/`<img>`, transfers `ImageBitmap`s to a Vite module worker that runs MediaPipe `detectForVideo` and a SORT-like tracker, then returns `DetectionFrame` payloads. Server analytics package and WebSocket are deleted on branch `ui-tracking`.
+
+**Tech Stack:** React 19, Vite 8, TypeScript, `@mediapipe/tasks-vision`, Vitest (tracker unit tests only)
+
+## Global Constraints
+
+- Branch: `ui-tracking` only; do not merge to main in this plan
+- Model: EfficientDet-Lite0 via MediaPipe CDN/Storage (not Lite2)
+- Detection API: `runningMode: 'VIDEO'` + `detectForVideo(bitmap, timestampMs)`
+- Classes: `person`; map `car`/`bus`/`truck` в†’ `car`
+- BBox contract: `[x1,y1,x2,y2]` source pixels for `DetectionOverlay`
+- Hook API: `{ frame, ready, loading, error }` (replaces `{ frame, connected, error }`)
+- Prefer same-origin/proxy media for frame grab; CORS failures в†’ hook `error`, player stays up
+- No server detection fallback
+- Tracker: greedy IoU SORT-like, max age 0.75s, min hits 2
+- Commits: frequent, one logical change per task
+
+## File structure
+
+| Path | Responsibility |
+|------|----------------|
+| `src/lib/tracker.ts` | Pure SORT-like tracker |
+| `src/lib/tracker.test.ts` | Vitest unit tests for tracker |
+| `src/lib/detections.ts` | Shared types + overlay helpers only (no WebSocket) |
+| `src/lib/clientAnalytics.ts` | React hook: grab loop + worker lifecycle |
+| `src/workers/analyticsWorker.ts` | MediaPipe + tracker in worker |
+| `src/components/CameraStreamPlayer.tsx` | Wire new hook / badge |
+| `backend/app/analytics/**` | DELETE |
+| `backend/app/routers/analytics.py` | DELETE |
+| `backend/app/main.py` | Remove analytics wiring |
+| `backend/app/config.py` | Remove `analytics_*` |
+| `backend/requirements.txt` | Remove ML deps |
+| `package.json` | Add `@mediapipe/tasks-vision`, vitest scripts |
+| `vite.config.ts` | Vitest `test` config |
+
+---
+
+### Task 1: Vitest + SORT-like tracker
+
+**Files:**
+- Create: `src/lib/tracker.ts`
+- Create: `src/lib/tracker.test.ts`
+- Modify: `package.json`
+- Modify: `vite.config.ts`
+- Modify: `tsconfig.json` (include vitest types if needed)
+
+**Interfaces:**
+- Consumes: none
+- Produces:
+  - `export type TrackBBox = [number, number, number, number]`
+  - `export interface RawDetection { className: string; confidence: number; bbox: TrackBBox }`
+  - `export interface TrackedObject { trackId: number; className: string; confidence: number; bbox: TrackBBox }`
+  - `export class SortTracker { constructor(opts?: { iouThreshold?: number; maxAgeMs?: number; minHits?: number }); update(dets: RawDetection[], nowMs: number): TrackedObject[]; reset(): void }`
+
+- [ ] **Step 1: Add Vitest dependency and scripts**
+
+```bash
+npm install -D vitest
+```
+
+Update `package.json` scripts:
+
+```json
+"test": "vitest run",
+"test:watch": "vitest"
+```
+
+Update `vite.config.ts`:
+
+```ts
+import react from '@vitejs/plugin-react'
+import tailwindcss from '@tailwindcss/vite'
+import { defineConfig } from 'vite'
+
+export default defineConfig({
+  plugins: [react(), tailwindcss()],
+  server: {
+    proxy: {
+      '/api': {
+        target: 'http://127.0.0.1:8000',
+        changeOrigin: true,
+        ws: true,
+      },
+    },
+  },
+  test: {
+    environment: 'node',
+    include: ['src/**/*.test.ts'],
+  },
+})
+```
+
+Add to `tsconfig.json` compilerOptions:
+
+```json
+"types": ["vitest/globals"]
+```
+
+Or keep imports from `vitest` without globals (prefer explicit `import { describe, it, expect } from 'vitest'` вЂ” then skip `types`).
+
+- [ ] **Step 2: Write failing tracker tests**
+
+Create `src/lib/tracker.test.ts`:
+
+```ts
+import { describe, expect, it } from 'vitest';
+import { SortTracker } from './tracker';
+
+describe('SortTracker', () => {
+  it('assigns stable ids across frames for overlapping boxes', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    expect(t0).toHaveLength(1);
+    const id = t0[0].trackId;
+
+    const t1 = tracker.update(
+      [{ className: 'person', confidence: 0.88, bbox: [12, 12, 52, 82] }],
+      100,
+    );
+    expect(t1).toHaveLength(1);
+    expect(t1[0].trackId).toBe(id);
+  });
+
+  it('hides tracks until minHits', () => {
+    const tracker = new SortTracker({ minHits: 2, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [100, 100, 200, 180] }],
+      0,
+    );
+    expect(t0).toHaveLength(0);
+    const t1 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [102, 100, 202, 180] }],
+      50,
+    );
+    expect(t1).toHaveLength(1);
+  });
+
+  it('drops tracks after maxAgeMs without matches', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    tracker.update([{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }], 0);
+    const still = tracker.update([], 700);
+    expect(still).toHaveLength(1);
+    const gone = tracker.update([], 800);
+    expect(gone).toHaveLength(0);
+  });
+
+  it('reset clears ids', () => {
+    const tracker = new SortTracker({ minHits: 1 });
+    const a = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    tracker.reset();
+    const b = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      10,
+    );
+    expect(b[0].trackId).not.toBe(a[0].trackId);
+  });
+});
+```
+
+- [ ] **Step 3: Run tests вЂ” expect FAIL**
+
+```bash
+npm test
+```
+
+Expected: fail resolving `./tracker` or missing `SortTracker`.
+
+- [ ] **Step 4: Implement `src/lib/tracker.ts`**
+
+```ts
+export type TrackBBox = [number, number, number, number];
+
+export interface RawDetection {
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+export interface TrackedObject {
+  trackId: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+interface TrackerOptions {
+  iouThreshold?: number;
+  maxAgeMs?: number;
+  minHits?: number;
+}
+
+interface InternalTrack {
+  id: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+  hits: number;
+  ageMs: number;
+  timeSinceUpdateMs: number;
+  // simple constant-velocity on center + size
+  vx: number;
+  vy: number;
+  vw: number;
+  vh: number;
+}
+
+function iou(a: TrackBBox, b: TrackBBox): number {
+  const x1 = Math.max(a[0], b[0]);
+  const y1 = Math.max(a[1], b[1]);
+  const x2 = Math.min(a[2], b[2]);
+  const y2 = Math.min(a[3], b[3]);
+  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
+  if (inter <= 0) return 0;
+  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
+  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
+  const denom = areaA + areaB - inter;
+  return denom > 0 ? inter / denom : 0;
+}
+
+function centerSize(b: TrackBBox) {
+  const w = b[2] - b[0];
+  const h = b[3] - b[1];
+  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
+}
+
+function fromCenterSize(cx: number, cy: number, w: number, h: number): TrackBBox {
+  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
+}
+
+export class SortTracker {
+  private iouThreshold: number;
+  private maxAgeMs: number;
+  private minHits: number;
+  private nextId = 1;
+  private tracks: InternalTrack[] = [];
+  private lastTs: number | null = null;
+
+  constructor(opts: TrackerOptions = {}) {
+    this.iouThreshold = opts.iouThreshold ?? 0.3;
+    this.maxAgeMs = opts.maxAgeMs ?? 750;
+    this.minHits = opts.minHits ?? 2;
+  }
+
+  reset(): void {
+    this.tracks = [];
+    this.nextId = 1;
+    this.lastTs = null;
+  }
+
+  update(dets: RawDetection[], nowMs: number): TrackedObject[] {
+    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
+    this.lastTs = nowMs;
+
+    for (const tr of this.tracks) {
+      const { cx, cy, w, h } = centerSize(tr.bbox);
+      const ncx = cx + tr.vx * dt;
+      const ncy = cy + tr.vy * dt;
+      const nw = Math.max(1, w + tr.vw * dt);
+      const nh = Math.max(1, h + tr.vh * dt);
+      tr.bbox = fromCenterSize(ncx, ncy, nw, nh);
+      tr.ageMs += dt;
+      tr.timeSinceUpdateMs += dt;
+    }
+
+    const trackIdx = this.tracks.map((_, i) => i);
+    const detIdx = dets.map((_, i) => i);
+    const pairs: { t: number; d: number; score: number }[] = [];
+    for (const t of trackIdx) {
+      for (const d of detIdx) {
+        const score = iou(this.tracks[t].bbox, dets[d].bbox);
+        if (score >= this.iouThreshold) pairs.push({ t, d, score });
+      }
+    }
+    pairs.sort((a, b) => b.score - a.score);
+
+    const usedT = new Set<number>();
+    const usedD = new Set<number>();
+    for (const p of pairs) {
+      if (usedT.has(p.t) || usedD.has(p.d)) continue;
+      usedT.add(p.t);
+      usedD.add(p.d);
+      const tr = this.tracks[p.t];
+      const det = dets[p.d];
+      const prev = centerSize(tr.bbox);
+      const next = centerSize(det.bbox);
+      const invDt = dt > 0 ? 1 / dt : 0;
+      tr.vx = (next.cx - prev.cx) * invDt;
+      tr.vy = (next.cy - prev.cy) * invDt;
+      tr.vw = (next.w - prev.w) * invDt;
+      tr.vh = (next.h - prev.h) * invDt;
+      tr.bbox = det.bbox;
+      tr.className = det.className;
+      tr.confidence = det.confidence;
+      tr.hits += 1;
+      tr.timeSinceUpdateMs = 0;
+    }
+
+    for (let d = 0; d < dets.length; d++) {
+      if (usedD.has(d)) continue;
+      const det = dets[d];
+      this.tracks.push({
+        id: this.nextId++,
+        className: det.className,
+        confidence: det.confidence,
+        bbox: det.bbox,
+        hits: 1,
+        ageMs: 0,
+        timeSinceUpdateMs: 0,
+        vx: 0,
+        vy: 0,
+        vw: 0,
+        vh: 0,
+      });
+    }
+
+    this.tracks = this.tracks.filter((tr) => tr.timeSinceUpdateMs <= this.maxAgeMs);
+
+    return this.tracks
+      .filter((tr) => tr.hits >= this.minHits || tr.timeSinceUpdateMs === 0 && tr.hits >= this.minHits)
+      .filter((tr) => tr.hits >= this.minHits)
+      .map((tr) => ({
+        trackId: tr.id,
+        className: tr.className,
+        confidence: tr.confidence,
+        bbox: tr.bbox,
+      }));
+  }
+}
+```
+
+Simplify the redundant filter in the return to a single `tr.hits >= this.minHits` check when implementing вЂ” do not leave the double-filter as written above.
+
+Correct return:
+
+```ts
+return this.tracks
+  .filter((tr) => tr.hits >= this.minHits)
+  .map((tr) => ({
+    trackId: tr.id,
+    className: tr.className,
+    confidence: tr.confidence,
+    bbox: [...tr.bbox] as TrackBBox,
+  }));
+```
+
+- [ ] **Step 5: Run tests вЂ” expect PASS**
+
+```bash
+npm test
+```
+
+Expected: all 4 tests pass.
+
+- [ ] **Step 6: Commit**
+
+```bash
+git add package.json package-lock.json vite.config.ts tsconfig.json src/lib/tracker.ts src/lib/tracker.test.ts
+git commit -m "feat: add SORT-like client tracker with vitest"
+```
+
+---
+
+### Task 2: Slim `detections.ts` types (remove WebSocket hook)
+
+**Files:**
+- Modify: `src/lib/detections.ts`
+- Modify: `src/components/CameraStreamPlayer.tsx` (temporary: comment/stub only if compile breaks вЂ” prefer finishing Task 4 same session; if Task 2 alone must compile, leave a thin deprecated stub that returns empty state until Task 4)
+
+**Interfaces:**
+- Consumes: none
+- Produces: `DetectionTrack`, `DetectionFrame`, `getContentRect`, `CLASS_COLORS`, `CLASS_LABELS` (unchanged shapes)
+
+- [ ] **Step 1: Replace `src/lib/detections.ts` with types + helpers only**
+
+```ts
+export interface DetectionTrack {
+  trackId: number;
+  class: 'person' | 'car' | string;
+  bbox: [number, number, number, number];
+  confidence: number;
+}
+
+export interface DetectionFrame {
+  ts: number;
+  frameWidth: number;
+  frameHeight: number;
+  tracks: DetectionTrack[];
+  error?: string;
+}
+
+export function getContentRect(
+  containerW: number,
+  containerH: number,
+  mediaW: number,
+  mediaH: number,
+) {
+  if (mediaW <= 0 || mediaH <= 0 || containerW <= 0 || containerH <= 0) {
+    return { x: 0, y: 0, w: containerW, h: containerH };
+  }
+
+  const mediaAspect = mediaW / mediaH;
+  const containerAspect = containerW / containerH;
+
+  if (mediaAspect > containerAspect) {
+    const w = containerW;
+    const h = containerW / mediaAspect;
+    return { x: 0, y: (containerH - h) / 2, w, h };
+  }
+
+  const h = containerH;
+  const w = containerH * mediaAspect;
+  return { x: (containerW - w) / 2, y: 0, w, h };
+}
+
+export const CLASS_COLORS: Record<string, string> = {
+  person: '#22c55e',
+  car: '#3b82f6',
+};
+
+export const CLASS_LABELS: Record<string, string> = {
+  person: 'С‡РµР»РѕРІРµРє',
+  car: 'Р°РІС‚Рѕ',
+};
+```
+
+- [ ] **Step 2: If `CameraStreamPlayer` still imports `useDetections`, add a one-line temporary stub at bottom of `detections.ts` ONLY if Task 3вЂ“4 are not landed in the same working tree commit chain вЂ” otherwise skip stub and continue to Task 3 immediately.**
+
+Preferred: do not leave a stub; complete Tasks 3вЂ“4 before relying on `npm run build`.
+
+- [ ] **Step 3: Commit**
+
+```bash
+git add src/lib/detections.ts
+git commit -m "refactor: remove WebSocket detection client from detections.ts"
+```
+
+---
+
+### Task 3: Analytics worker (MediaPipe + tracker)
+
+**Files:**
+- Create: `src/workers/analyticsWorker.ts`
+- Modify: `package.json` (add `@mediapipe/tasks-vision`)
+
+**Interfaces:**
+- Consumes: `SortTracker`, `RawDetection` from `../lib/tracker`
+- Produces worker protocol:
+
+```ts
+// main в†’ worker
+type InMsg =
+  | { type: 'init' }
+  | { type: 'reset' }
+  | { type: 'frame'; bitmap: ImageBitmap; width: number; height: number; timestampMs: number };
+
+// worker в†’ main
+type OutMsg =
+  | { type: 'ready' }
+  | { type: 'result'; frame: import('../lib/detections').DetectionFrame }
+  | { type: 'error'; message: string };
+```
+
+- [ ] **Step 1: Install MediaPipe**
+
+```bash
+npm install @mediapipe/tasks-vision
+```
+
+- [ ] **Step 2: Implement `src/workers/analyticsWorker.ts`**
+
+```ts
+/// <reference lib="webworker" />
+import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
+import type { DetectionFrame } from '../lib/detections';
+import { SortTracker, type RawDetection } from '../lib/tracker';
+
+const CLASS_MAP: Record<string, string> = {
+  person: 'person',
+  car: 'car',
+  bus: 'car',
+  truck: 'car',
+};
+
+const MODEL_URL =
+  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
+const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
+
+let detector: ObjectDetector | null = null;
+let busy = false;
+const tracker = new SortTracker({ iouThreshold: 0.3, maxAgeMs: 750, minHits: 2 });
+
+function post(msg: { type: string; [k: string]: unknown }) {
+  self.postMessage(msg);
+}
+
+function mapDetections(result: { detections: Array<{
+  categories: Array<{ categoryName?: string; score?: number }>;
+  boundingBox?: { originX: number; originY: number; width: number; height: number };
+}> }): RawDetection[] {
+  const out: RawDetection[] = [];
+  for (const det of result.detections ?? []) {
+    const cat = det.categories?.[0];
+    const name = (cat?.categoryName ?? '').toLowerCase();
+    const mapped = CLASS_MAP[name];
+    if (!mapped) continue;
+    const box = det.boundingBox;
+    if (!box) continue;
+    const score = cat?.score ?? 0;
+    out.push({
+      className: mapped,
+      confidence: score,
+      bbox: [
+        box.originX,
+        box.originY,
+        box.originX + box.width,
+        box.originY + box.height,
+      ],
+    });
+  }
+  return out;
+}
+
+async function init() {
+  try {
+    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
+    detector = await ObjectDetector.createFromOptions(vision, {
+      baseOptions: {
+        modelAssetPath: MODEL_URL,
+        delegate: 'GPU',
+      },
+      scoreThreshold: 0.35,
+      runningMode: 'VIDEO',
+      categoryAllowlist: ['person', 'car', 'bus', 'truck'],
+    });
+    post({ type: 'ready' });
+  } catch (err) {
+    // GPU may fail on some devices вЂ” retry CPU once
+    try {
+      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
+      detector = await ObjectDetector.createFromOptions(vision, {
+        baseOptions: {
+          modelAssetPath: MODEL_URL,
+          delegate: 'CPU',
+        },
+        scoreThreshold: 0.35,
+        runningMode: 'VIDEO',
+        categoryAllowlist: ['person', 'car', 'bus', 'truck'],
+      });
+      post({ type: 'ready' });
+    } catch (err2) {
+      const message = err2 instanceof Error ? err2.message : String(err2);
+      post({ type: 'error', message });
+    }
+  }
+}
+
+self.onmessage = async (event: MessageEvent) => {
+  const data = event.data as
+    | { type: 'init' }
+    | { type: 'reset' }
+    | { type: 'frame'; bitmap: ImageBitmap; width: number; height: number; timestampMs: number };
+
+  if (data.type === 'init') {
+    await init();
+    return;
+  }
+  if (data.type === 'reset') {
+    tracker.reset();
+    return;
+  }
+  if (data.type !== 'frame') return;
+
+  const { bitmap, width, height, timestampMs } = data;
+  if (!detector || busy) {
+    bitmap.close();
+    return;
+  }
+
+  busy = true;
+  try {
+    const result = detector.detectForVideo(bitmap, timestampMs);
+    const raw = mapDetections(result);
+    const tracked = tracker.update(raw, timestampMs);
+    const frame: DetectionFrame = {
+      ts: timestampMs / 1000,
+      frameWidth: width,
+      frameHeight: height,
+      tracks: tracked.map((t) => ({
+        trackId: t.trackId,
+        class: t.className,
+        bbox: t.bbox,
+        confidence: t.confidence,
+      })),
+    };
+    post({ type: 'result', frame });
+  } catch (err) {
+    const message = err instanceof Error ? err.message : String(err);
+    post({ type: 'error', message });
+  } finally {
+    bitmap.close();
+    busy = false;
+  }
+};
+```
+
+If `categoryAllowlist` causes empty results for this model build, remove it and rely on `CLASS_MAP` only.
+
+If Vite ESM worker fails to load MediaPipe at runtime, switch this file to a classic worker using `importScripts` + `vision_bundle.js` per MediaPipe issue #5479 / samples-web вЂ” keep the same message protocol.
+
+- [ ] **Step 3: Smoke-check TypeScript**
+
+```bash
+npx tsc --noEmit
+```
+
+Expected: no errors in new worker file (skipLibCheck already on).
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add package.json package-lock.json src/workers/analyticsWorker.ts
+git commit -m "feat: add MediaPipe analytics worker with client tracking"
+```
+
+---
+
+### Task 4: `useClientAnalytics` hook + wire player
+
+**Files:**
+- Create: `src/lib/clientAnalytics.ts`
+- Modify: `src/components/CameraStreamPlayer.tsx`
+
+**Interfaces:**
+- Consumes: worker protocol from Task 3; `DetectionFrame` from `detections.ts`
+- Produces:
+  - `useClientAnalytics(mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>, cameraId: string, enabled: boolean): { frame: DetectionFrame | null; ready: boolean; loading: boolean; error: string | null }`
+
+- [ ] **Step 1: Implement `src/lib/clientAnalytics.ts`**
+
+```ts
+import { useEffect, useRef, useState, type RefObject } from 'react';
+import type { DetectionFrame } from './detections';
+
+const TARGET_INTERVAL_MS = 1000 / 12;
+
+function mediaSize(media: HTMLVideoElement | HTMLImageElement) {
+  if (media instanceof HTMLVideoElement) {
+    return { width: media.videoWidth, height: media.videoHeight };
+  }
+  return { width: media.naturalWidth, height: media.naturalHeight };
+}
+
+export function useClientAnalytics(
+  mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>,
+  cameraId: string,
+  enabled: boolean,
+) {
+  const [frame, setFrame] = useState<DetectionFrame | null>(null);
+  const [ready, setReady] = useState(false);
+  const [loading, setLoading] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const workerRef = useRef<Worker | null>(null);
+  const inflightRef = useRef(false);
+  const lastSentRef = useRef(0);
+
+  useEffect(() => {
+    if (!enabled) {
+      setFrame(null);
+      setReady(false);
+      setLoading(false);
+      setError(null);
+      workerRef.current?.terminate();
+      workerRef.current = null;
+      return;
+    }
+
+    setLoading(true);
+    setReady(false);
+    setError(null);
+    setFrame(null);
+
+    let cancelled = false;
+    const worker = new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), {
+      type: 'module',
+    });
+    workerRef.current = worker;
+
+    worker.onmessage = (event: MessageEvent) => {
+      if (cancelled) return;
+      const data = event.data as
+        | { type: 'ready' }
+        | { type: 'result'; frame: DetectionFrame }
+        | { type: 'error'; message: string };
+
+      if (data.type === 'ready') {
+        setReady(true);
+        setLoading(false);
+        setError(null);
+        return;
+      }
+      if (data.type === 'error') {
+        setError(data.message || 'РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
+        setLoading(false);
+        setReady(false);
+        inflightRef.current = false;
+        return;
+      }
+      if (data.type === 'result') {
+        inflightRef.current = false;
+        setFrame(data.frame);
+      }
+    };
+
+    worker.onerror = () => {
+      if (cancelled) return;
+      setError('РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
+      setLoading(false);
+      setReady(false);
+    };
+
+    worker.postMessage({ type: 'init' });
+
+    return () => {
+      cancelled = true;
+      worker.terminate();
+      if (workerRef.current === worker) workerRef.current = null;
+    };
+  }, [enabled]);
+
+  // Reset tracker on camera change without full model reload
+  useEffect(() => {
+    if (!enabled || !workerRef.current) return;
+    workerRef.current.postMessage({ type: 'reset' });
+    setFrame(null);
+  }, [cameraId, enabled]);
+
+  useEffect(() => {
+    if (!enabled) return;
+
+    let raf = 0;
+    let cancelled = false;
+
+    const tick = async (now: number) => {
+      if (cancelled) return;
+      raf = requestAnimationFrame(tick);
+
+      const worker = workerRef.current;
+      const media = mediaRef.current;
+      if (!worker || !media || !ready || inflightRef.current) return;
+      if (now - lastSentRef.current < TARGET_INTERVAL_MS) return;
+
+      const { width, height } = mediaSize(media);
+      if (width <= 0 || height <= 0) return;
+
+      try {
+        const bitmap = await createImageBitmap(media);
+        if (cancelled || inflightRef.current) {
+          bitmap.close();
+          return;
+        }
+        inflightRef.current = true;
+        lastSentRef.current = now;
+        worker.postMessage(
+          { type: 'frame', bitmap, width, height, timestampMs: now },
+          [bitmap],
+        );
+      } catch (err) {
+        inflightRef.current = false;
+        setError(err instanceof Error ? err.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°С…РІР°С‚РёС‚СЊ РєР°РґСЂ');
+      }
+    };
+
+    raf = requestAnimationFrame(tick);
+    return () => {
+      cancelled = true;
+      cancelAnimationFrame(raf);
+    };
+  }, [enabled, ready, mediaRef]);
+
+  return { frame, ready, loading, error };
+}
+```
+
+- [ ] **Step 2: Update `CameraStreamPlayer.tsx` imports and hook usage**
+
+Replace:
+
+```ts
+import { useDetections } from '../lib/detections';
+```
+
+with:
+
+```ts
+import { useClientAnalytics } from '../lib/clientAnalytics';
+```
+
+Replace:
+
+```ts
+const { frame: detectionFrame, connected: analyticsConnected, error: analyticsError } =
+  useDetections(camera.id, analyticsEnabled);
+```
+
+with:
+
+```ts
+const {
+  frame: detectionFrame,
+  ready: analyticsReadyFlag,
+  loading: analyticsLoading,
+  error: analyticsError,
+} = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
+```
+
+Note: `mediaRef` is defined after the current hook call today вЂ” **reorder** so `mediaRef` exists before the hook:
+
+```ts
+const mediaRef = showVideo ? videoRef : imgRef;
+const {
+  frame: detectionFrame,
+  ready: analyticsReadyFlag,
+  loading: analyticsLoading,
+  error: analyticsError,
+} = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
+```
+
+Update badge:
+
+```tsx
+{(analyticsReadyFlag || analyticsLoading || analyticsError) && (
+  <div className="absolute top-2 right-2 rounded-md bg-black/50 px-2 py-1">
+    <span className={`text-[10px] ${analyticsError ? 'text-red-300' : 'text-emerald-300'}`}>
+      {analyticsError
+        ? 'РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°'
+        : analyticsLoading
+          ? 'Р—Р°РіСЂСѓР·РєР° РјРѕРґРµР»РёвЂ¦'
+          : `Р”РµС‚РµРєС†РёСЏ В· ${detectionFrame?.tracks?.length ?? 0}`}
+    </span>
+  </div>
+)}
+```
+
+- [ ] **Step 3: Build frontend**
+
+```bash
+npm run build
+```
+
+Expected: success. If worker fails to bundle, fix Vite worker URL import.
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add src/lib/clientAnalytics.ts src/components/CameraStreamPlayer.tsx src/lib/detections.ts
+git commit -m "feat: run client MediaPipe analytics in CameraStreamPlayer"
+```
+
+---
+
+### Task 5: Remove server analytics
+
+**Files:**
+- Delete: `backend/app/analytics/__init__.py`
+- Delete: `backend/app/analytics/capture.py`
+- Delete: `backend/app/analytics/detector.py`
+- Delete: `backend/app/analytics/pipeline.py`
+- Delete: `backend/app/routers/analytics.py`
+- Modify: `backend/app/main.py`
+- Modify: `backend/app/config.py`
+- Modify: `backend/requirements.txt`
+
+**Interfaces:**
+- Consumes: none
+- Produces: FastAPI app without analytics router; health/auth/cameras/streaming unchanged
+
+- [ ] **Step 1: Rewrite `backend/app/main.py`**
+
+```python
+from contextlib import asynccontextmanager
+
+from fastapi import FastAPI
+from fastapi.middleware.cors import CORSMiddleware
+
+from app.database import Base, SessionLocal, engine
+from app.routers import auth, cameras
+from app.seed import seed_if_empty
+
+
+@asynccontextmanager
+async def lifespan(_: FastAPI):
+    Base.metadata.create_all(bind=engine)
+    db = SessionLocal()
+    try:
+        seed_if_empty(db)
+    finally:
+        db.close()
+    yield
+
+
+app = FastAPI(title="Vision Control API", lifespan=lifespan)
+
+app.add_middleware(
+    CORSMiddleware,
+    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
+    allow_credentials=True,
+    allow_methods=["*"],
+    allow_headers=["*"],
+)
+
+app.include_router(auth.router)
+app.include_router(cameras.router)
+
+
+@app.get("/api/health")
+def health() -> dict[str, str]:
+    return {"status": "ok"}
+```
+
+- [ ] **Step 2: Remove analytics settings from `backend/app/config.py`**
+
+Keep only:
+
+```python
+from pydantic_settings import BaseSettings, SettingsConfigDict
+
+
+class Settings(BaseSettings):
+    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
+
+    jwt_secret: str = "dev-secret-change-me"
+    database_url: str = "sqlite:///./data/videolight.db"
+    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
+    jwt_algorithm: str = "HS256"
+
+
+settings = Settings()
+```
+
+- [ ] **Step 3: Trim `backend/requirements.txt`**
+
+```text
+fastapi==0.141.1
+uvicorn[standard]==0.52.4
+sqlalchemy==2.0.52
+pydantic==2.13.4
+pydantic-settings==2.15.0
+passlib[bcrypt]==1.7.4
+bcrypt==4.0.1
+python-jose[cryptography]==3.5.0
+python-multipart==0.0.32
+email-validator==2.3.0
+httpx==0.28.1
+```
+
+- [ ] **Step 4: Delete analytics files**
+
+```bash
+git rm -r backend/app/analytics
+git rm backend/app/routers/analytics.py
+```
+
+- [ ] **Step 5: Verify API imports**
+
+```bash
+cd backend
+.venv/Scripts/python -c "from app.main import app; print('ok', app.title)"
+```
+
+Expected: `ok Vision Control API`
+
+- [ ] **Step 6: Commit**
+
+```bash
+git add backend/app/main.py backend/app/config.py backend/requirements.txt
+git commit -m "chore: remove server-side detection analytics pipeline"
+```
+
+---
+
+### Task 6: Manual verification checklist
+
+**Files:** none (verification only)
+
+- [ ] **Step 1: Start stack**
+
+```bash
+npm run dev:api
+npm run dev
+```
+
+- [ ] **Step 2: Open a proxied/HLS camera, wait for В«Р—Р°РіСЂСѓР·РєР° РјРѕРґРµР»РёвЂ¦В» в†’ В«Р”РµС‚РµРєС†РёСЏ В· NВ»**
+
+Expected: person/car boxes, stable IDs while moving, UI responsive.
+
+- [ ] **Step 3: Switch cameras**
+
+Expected: boxes clear, no stale trackIds from previous camera.
+
+- [ ] **Step 4: Confirm `/api/cameras/{id}/detections` is gone**
+
+```bash
+curl -i -N "http://127.0.0.1:8000/api/health"
+```
+
+Expected: health ok. WebSocket detections endpoint should 404 / not exist.
+
+- [ ] **Step 5: Commit only if verification found fixes**
+
+If bugs fixed during verification, commit with messages like `fix: ...`. Otherwise no empty commit.
+
+---
+
+## Spec coverage (self-review)
+
+| Spec requirement | Task |
+|------------------|------|
+| MediaPipe VIDEO + detectForVideo | Task 3 |
+| EfficientDet-Lite0 CDN | Task 3 |
+| Worker + main grab latest-only | Tasks 3вЂ“4 |
+| SORT-like greedy IoU, 0.75s, minHits 2 | Task 1 |
+| DetectionFrame / overlay unchanged | Tasks 2, 4 |
+| Hook `{ frame, ready, loading, error }` | Task 4 |
+| cameraId tracker reset | Task 4 |
+| Remove server analytics + deps | Task 5 |
+| CORS/tainted grab в†’ error | Task 4 |
+| Loading badge copy | Task 4 |
+| Manual tests | Task 6 |
+
+No placeholders left after self-review. GPUв†’CPU fallback added in Task 3 (practical, still within spec).
diff --git a/docs/superpowers/specs/2026-08-26-client-mediapipe-tracking-design.md b/docs/superpowers/specs/2026-08-26-client-mediapipe-tracking-design.md
new file mode 100644
index 0000000..bbf9d75
--- /dev/null
+++ b/docs/superpowers/specs/2026-08-26-client-mediapipe-tracking-design.md
@@ -0,0 +1,135 @@
+# Client-side MediaPipe detection + tracking
+
+**Branch:** `ui-tracking`  
+**Date:** 2026-08-26  
+**Status:** Approved
+
+## Goal
+
+Move object detection and multi-object tracking from the FastAPI/YOLO/ByteTrack server pipeline to the browser. Server analytics is removed in this branch (it remains on other branches such as `main`).
+
+Priorities: stable FPS, smooth overlay, reliable track IDs. Prefer MediaPipe Object Detector over ONNX YOLO for browser realtime stability.
+
+## Non-goals
+
+- Replacing video streaming / proxy / HLS behavior
+- Changing overlay visual design beyond keeping current labels/colors
+- Keeping a server fallback for detections
+- Training or fine-tuning models
+
+## Architecture
+
+```
+CameraStreamPlayer
+  в”њв”Ђ video/img (unchanged; prefer same-origin / proxy URL for grab)
+  в”њв”Ђ useClientAnalytics(mediaRef, cameraId, enabled)
+  в”‚     в”њв”Ђ main thread: frame grab (rAF, throttle ~10вЂ“15 FPS)
+  в”‚     в”њв”Ђ worker: MediaPipe ObjectDetector (VIDEO mode) в†’ raw boxes
+  в”‚     в”њв”Ђ worker: SORT-like tracker в†’ trackId + smoothed bbox
+  в”‚     в””в”Ђ returns { frame, ready, loading, error }
+  в””в”Ђ DetectionOverlay (same DetectionFrame contract)
+```
+
+- Start analytics after stream reaches `playing` plus a short delay (same UX as today).
+- Drop intermediate frames while inference is in flight (latest-only).
+- Load MediaPipe model once per worker lifetime; reset **tracker** state when `cameraId` changes (keep detector warm).
+- For frame grab reliability, prefer the same-origin proxied stream already used for HLS/proxy playback. Direct cross-origin URLs without CORS may taint the media element and block `createImageBitmap` вЂ” treat as analytics error, do not crash the player.
+
+## Data flow
+
+1. **Grab (main):** When enabled and media is drawable, create an `ImageBitmap` from the video/img (directly when possible, else via canvas). `postMessage` to the worker with transferable ownership. Close/drop bitmaps that are superseded.
+2. **Detect (worker):** `@mediapipe/tasks-vision` `ObjectDetector` with:
+   - `runningMode: 'VIDEO'`
+   - `detectForVideo(bitmap, timestampMs)` (not IMAGE `detect()`)
+   - `scoreThreshold` в‰€ 0.35
+   - Optional `categoryAllowlist` for person/car/bus/truck when supported; otherwise filter in JS
+   - Map classes: `person` в†’ `person`; `car` / `bus` / `truck` в†’ `car`
+   - Convert MediaPipe `boundingBox { originX, originY, width, height }` в†’ `[x1, y1, x2, y2]` in input-image pixels
+3. **Track (worker):** SORT-like tracker
+   - Kalman filter on center + size
+   - Association by IoU with greedy matching (sufficient at low object counts)
+   - Max age: 0.75s without a matched detection
+   - Min hits: 2 before a track is emitted
+4. **Emit:** Same payload shape as the former WebSocket API:
+
+```ts
+interface DetectionTrack {
+  trackId: number;
+  class: 'person' | 'car' | string;
+  bbox: [number, number, number, number]; // x1,y1,x2,y2 in source pixels
+  confidence: number;
+}
+
+interface DetectionFrame {
+  ts: number;
+  frameWidth: number;
+  frameHeight: number;
+  tracks: DetectionTrack[];
+  error?: string;
+}
+```
+
+5. **Hook в†’ UI:** Replace `useDetections`вЂ™s `{ frame, connected, error }` with:
+   - `frame` вЂ” latest `DetectionFrame | null`
+   - `loading` вЂ” model/worker still initializing
+   - `ready` вЂ” detector ready (replaces `connected` for the status badge)
+   - `error` вЂ” string | null  
+   Badge copy stays: error в†’ В«РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°В»; else в†’ `Р”РµС‚РµРєС†РёСЏ В· N` when `ready`.
+
+6. **Draw:** Existing `DetectionOverlay` + `CLASS_COLORS` / `CLASS_LABELS` unchanged.
+
+## Client modules
+
+| Module | Role |
+|--------|------|
+| `src/lib/clientAnalytics.ts` | Hook replacing `useDetections`; owns worker lifecycle, `cameraId` reset, enabled flag, `{ frame, ready, loading, error }` |
+| `src/workers/analyticsWorker.ts` | MediaPipe init, `detectForVideo`, track, reply with `DetectionFrame` |
+| `src/lib/tracker.ts` | SORT-like tracker pure logic (imported into worker) |
+| `src/components/CameraStreamPlayer.tsx` | Wire `useClientAnalytics`; map `ready` where `connected` was used |
+| `src/lib/detections.ts` | Keep types + overlay helpers; remove WebSocket URL / `useDetections` |
+
+**Model:** EfficientDet-**Lite0** (official MediaPipe default for browser balance). Load from Google Storage / jsDelivr WASM paths used in Tasks Vision docs. Lite2 is out of scope for v1 (heavier).
+
+**Worker packaging:** Prefer Vite `new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), { type: 'module' })` with a recent `@mediapipe/tasks-vision` (follow [mediapipe-samples-web](https://github.com/google-ai-edge/mediapipe-samples-web) object-detector worker pattern). If ESM + MediaPipe fails in practice, fall back to a classic worker that loads `vision_bundle.js` via `importScripts` вЂ” do not block the feature on ESM purity.
+
+Dependencies to add: `@mediapipe/tasks-vision`.
+
+## Backend removals (this branch only)
+
+Delete / unwire:
+
+- `backend/app/analytics/` (entire package: capture, detector, pipeline)
+- `backend/app/routers/analytics.py`
+- `main.py` analytics router + `pipeline_manager.shutdown_all`
+- `config.py` `analytics_*` settings
+- `requirements.txt`: `ultralytics`, `supervision`, `opencv-python-headless`, `numpy` (analytics-only)
+
+Streaming, auth, cameras, and proxy remain unchanged.
+
+## Error handling
+
+| Situation | Behavior |
+|-----------|----------|
+| Model still loading | `loading=true`; empty overlay; no false вЂњunavailableвЂќ badge |
+| MediaPipe / worker failure | `error` set; В«РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°В»; player keeps working |
+| Tainted canvas / CORS grab failure (often direct external URL) | `error` set; do not crash player (`AnalyticsErrorBoundary`) |
+| Stream paused / not playing | Stop grab; on `cameraId` change reset tracker (message to worker) |
+| No objects | Empty `tracks[]`, no error |
+| Unsupported / no drawable media | Analytics disabled (`enabled=false`) |
+
+## Testing (manual)
+
+1. Same-origin / proxy camera: person/car boxes appear, IDs stable while objects move
+2. UI stays responsive during inference (no freezes)
+3. Switch cameras: tracks reset, no stale boxes; model does not fully reload if worker stays alive
+4. Backend starts without ML packages
+5. Overlay still letterboxes correctly with `object-contain`
+6. (Optional) Direct cross-origin stream: analytics fails gracefully without blanking video
+
+## Success criteria
+
+- No server detection WebSocket or YOLO pipeline on `ui-tracking`
+- Client detection + tracking drives the existing overlay
+- Smooth realtime feel on a typical desktop browser
+- Track IDs persist across brief detection gaps
+- VIDEO-mode MediaPipe path (`detectForVideo`) is used for the live player
diff --git a/package-lock.json b/package-lock.json
index 970938a..136b451 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -4,10 +4,11 @@
   "requires": true,
   "packages": {
     "": {
       "name": "lovarus-app",
       "dependencies": {
+        "@mediapipe/tasks-vision": "^1.0.1",
         "hls.js": "^1.7.1",
         "react": "19.2.8",
         "react-dom": "19.2.8"
       },
       "devDependencies": {
@@ -15,11 +16,12 @@
         "@types/react": "^19.2.17",
         "@types/react-dom": "^19.2.3",
         "@vitejs/plugin-react": "^6.0.4",
         "tailwindcss": "^4.3.3",
         "typescript": "~5.6.3",
-        "vite": "^8.1.5"
+        "vite": "^8.1.5",
+        "vitest": "^4.1.11"
       }
     },
     "node_modules/@jridgewell/gen-mapping": {
       "version": "0.3.13",
       "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
@@ -68,10 +70,16 @@
       "dependencies": {
         "@jridgewell/resolve-uri": "^3.1.0",
         "@jridgewell/sourcemap-codec": "^1.4.14"
       }
     },
+    "node_modules/@mediapipe/tasks-vision": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz",
+      "integrity": "sha512-rvRE2FmAZ6ZxKSw7wq+e+jQDpN3t1B/tD2mJz9SmAzb1msoDkd4dMoE4wAh8Z30Um0PQwLiHr9QtomhmXk3aUQ==",
+      "license": "Apache-2.0"
+    },
     "node_modules/@oxc-project/types": {
       "version": "0.146.0",
       "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.146.0.tgz",
       "integrity": "sha512-XC0QsnnhVe7sLIWmYmdPw7x5P0h4W8vUU3Nv1ySgWXtvCz8NizoAEpGXA0sOYoJQV2Rl13LgURAHQ5cI5ILCSA==",
       "dev": true,
@@ -340,10 +348,17 @@
       "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz",
       "integrity": "sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@standard-schema/spec": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "integrity": "sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@tailwindcss/node": {
       "version": "4.3.3",
       "resolved": "https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.3.tgz",
       "integrity": "sha512-/T8IKEsf9VTU6tLjgC7+sv2mOPtQxzE2jMw7u4Tt40Tx+QSZxpzh95/H6cMKoja9XuW7iMdLJYBB0o9G1CaAgg==",
       "dev": true,
@@ -612,10 +627,35 @@
       },
       "peerDependencies": {
         "vite": "^5.2.0 || ^6 || ^7 || ^8"
       }
     },
+    "node_modules/@types/chai": {
+      "version": "5.2.3",
+      "resolved": "https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz",
+      "integrity": "sha512-Mw558oeA9fFbv65/y4mHtXDs9bPnFMZAL/jxdPFUpOHHIXX91mcgEHbS5Lahr+pwZFR8A7GQleRWeI6cGFC2UA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/deep-eql": "*",
+        "assertion-error": "^2.0.1"
+      }
+    },
+    "node_modules/@types/deep-eql": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz",
+      "integrity": "sha512-c9h9dVVMigMPc4bwTvC5dxqtqJZwQPePsWjPlpSOnojbor6pGqdk541lfA7AqFQr5pB1BRdq0juY9db81BwyFw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@types/estree": {
+      "version": "1.0.9",
+      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
+      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@types/react": {
       "version": "19.2.18",
       "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.18.tgz",
       "integrity": "sha512-AnzbBERsrLKtk2XSfTbYRLjQPdy116Sty4q+T+Bp3IC4l6jNBvreVPAHmpq9qhXQM7CXZPjLVmGMw9sy+hxQ3w==",
       "dev": true,
@@ -662,10 +702,150 @@
         "oxc-transform-react": {
           "optional": true
         }
       }
     },
+    "node_modules/@vitest/expect": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/expect/-/expect-4.1.11.tgz",
+      "integrity": "sha512-VX2x5vNJXET47KAFzwERI+KRMtTTCSWTfSMKsW7JsUsXV4psq++e3DvZpuTDOpHcxytiDs6p2nhVb2tVDiiUYw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@standard-schema/spec": "^1.1.0",
+        "@types/chai": "^5.2.2",
+        "@vitest/spy": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "chai": "^6.2.2",
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/mocker": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/mocker/-/mocker-4.1.11.tgz",
+      "integrity": "sha512-2XJVD55d1o5AZous5CCGKS74g/riOj9odEt2bQpCVZeblHyHdnMeFl4jl0XjU21stf4mbjUkew2eXQZt65g5CQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/spy": "4.1.11",
+        "estree-walker": "^3.0.3",
+        "magic-string": "^0.30.21"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      },
+      "peerDependencies": {
+        "msw": "^2.4.9",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
+      },
+      "peerDependenciesMeta": {
+        "msw": {
+          "optional": true
+        },
+        "vite": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/@vitest/pretty-format": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/pretty-format/-/pretty-format-4.1.11.tgz",
+      "integrity": "sha512-yiZzPbGTS9Sr/JpFl8zHrcIkAofNbFV6k21vIgQN/cY/oxZeXhJv5sc/MBJ5jFKWmWs+oJHw0UXLZjmf931+Vw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/runner": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/runner/-/runner-4.1.11.tgz",
+      "integrity": "sha512-LztvUgdwMNJMIkj3hQnnxiC2Xy1zNxq928W/xhjCLaNCzqTZOudjwbQf6v9IntZGPw132i2Lq2rgTRZHD3JHNw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/utils": "4.1.11",
+        "pathe": "^2.0.3"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/snapshot": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/snapshot/-/snapshot-4.1.11.tgz",
+      "integrity": "sha512-pN7ikn1ON7h8ee4gIAp4AzyK+zBtJPzVbqOgu5LCEh4VaJVbPQcgYQYJIMGQPXVeJJq1fnfazis7a5pFNPahog==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/pretty-format": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "magic-string": "^0.30.21",
+        "pathe": "^2.0.3"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/spy": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-4.1.11.tgz",
+      "integrity": "sha512-apNa/prQy2qCeywhnixOHPRCgGNhvg7T4Dapfl1GahLp/R+uhBm5cPyFoNVyqsNd2h1nJxL6BqqdIjiABL60YA==",
+      "dev": true,
+      "license": "MIT",
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/utils": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/utils/-/utils-4.1.11.tgz",
+      "integrity": "sha512-zTCVGpyFsGWBhllOyKlTw/vnr6D9qxsfSDyfbyZmTyjHw5N/VuvzHpHoQjm2ZJzn4RJgx5w4r7V0er69CmLgPQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/pretty-format": "4.1.11",
+        "convert-source-map": "^2.0.0",
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/assertion-error": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz",
+      "integrity": "sha512-Izi8RQcffqCeNVgFigKli1ssklIbpHnCYc6AknXGYoB6grJqyeby7jv12JUQgmTAnIDnbck1uxksT4dzN3PWBA==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/chai": {
+      "version": "6.2.2",
+      "resolved": "https://registry.npmjs.org/chai/-/chai-6.2.2.tgz",
+      "integrity": "sha512-NUPRluOfOiTKBKvWPtSD4PhFvWCqOi0BGStNWs57X9js7XGTprSmFoz5F0tWhR4WPjNeR9jXqdC7/UpSJTnlRg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/convert-source-map": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
+      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/csstype": {
       "version": "3.2.3",
       "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
       "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
       "dev": true,
@@ -693,10 +873,37 @@
       },
       "engines": {
         "node": ">=10.13.0"
       }
     },
+    "node_modules/es-module-lexer": {
+      "version": "2.3.2",
+      "resolved": "https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.2.tgz",
+      "integrity": "sha512-poHGpORABojJJucnV9KbOavETW8lBVnphkW77ER5/BQ5Fz7oXSoCNek7IH3vR5nRjdsEz926ibFYX8KtLQmdyw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/estree-walker": {
+      "version": "3.0.3",
+      "resolved": "https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz",
+      "integrity": "sha512-7RUKfXgSMMkzt6ZuXmqapOurLGPPfgj6l9uRZ7lRGolvk0y2yocc35LdcxKC5PQZdn2DMqioAQ2NoWcrTKmm6g==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/estree": "^1.0.0"
+      }
+    },
+    "node_modules/expect-type": {
+      "version": "1.4.0",
+      "resolved": "https://registry.npmjs.org/expect-type/-/expect-type-1.4.0.tgz",
+      "integrity": "sha512-KfYbmpRm0VbLjEvVa9yGwCi9GI34xvi7A/HXYWQO65CSD2u3MczUJSuwXKFIxlGsgBQizV9q5J9NHj4VG0n+pA==",
+      "dev": true,
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=12.0.0"
+      }
+    },
     "node_modules/fdir": {
       "version": "6.5.0",
       "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
       "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
       "dev": true,
@@ -1039,10 +1246,31 @@
       },
       "engines": {
         "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
       }
     },
+    "node_modules/obug": {
+      "version": "2.1.4",
+      "resolved": "https://registry.npmjs.org/obug/-/obug-2.1.4.tgz",
+      "integrity": "sha512-4a+OsYv9UktOJKE+l1A4OufDgdRF9PifWj+tJnHURo/P+WOxpG4GzUFL9qCalmWauao6ogiG+QvnCovwPoyAWA==",
+      "dev": true,
+      "funding": [
+        "https://github.com/sponsors/sxzz",
+        "https://opencollective.com/debug"
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=12.20.0"
+      }
+    },
+    "node_modules/pathe": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
+      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/picocolors": {
       "version": "1.1.1",
       "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
       "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
       "dev": true,
@@ -1149,20 +1377,41 @@
       "version": "0.27.0",
       "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
       "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
       "license": "MIT"
     },
+    "node_modules/siginfo": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
+      "integrity": "sha512-ybx0WO1/8bSBLEWXZvEd7gMW3Sn3JFlW3TvX1nREbDLRNQNaeNN8WK0meBwPdAaOI7TtRRRJn/Es1zhrrCHu7g==",
+      "dev": true,
+      "license": "ISC"
+    },
     "node_modules/source-map-js": {
       "version": "1.2.1",
       "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
       "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
       "dev": true,
       "license": "BSD-3-Clause",
       "engines": {
         "node": ">=0.10.0"
       }
     },
+    "node_modules/stackback": {
+      "version": "0.0.2",
+      "resolved": "https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz",
+      "integrity": "sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/std-env": {
+      "version": "4.2.0",
+      "resolved": "https://registry.npmjs.org/std-env/-/std-env-4.2.0.tgz",
+      "integrity": "sha512-oCUKSupKTHX53EyjDtuZQ64pjLJ6yYCtpmEw0goYxtjG9KpbRe8KAsl2tBUGU9DyMcJ0RwJ8GqJAFzMXcXW1Rw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/tailwindcss": {
       "version": "4.3.3",
       "resolved": "https://registry.npmjs.org/tailwindcss/-/tailwindcss-4.3.3.tgz",
       "integrity": "sha512-gOhV3P7ufE62QDGg1zVaTgCR+EtPv92k2nIhVcVKcLmxT1sUBsQGhnZj175j+MqRt4zLF7ic+sCYjfhxMxj7YQ==",
       "dev": true,
@@ -1180,10 +1429,27 @@
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/webpack"
       }
     },
+    "node_modules/tinybench": {
+      "version": "2.9.0",
+      "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
+      "integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/tinyexec": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/tinyexec/-/tinyexec-1.3.0.tgz",
+      "integrity": "sha512-QKAl9m8gWWGHV8jZcPeym6j+XULi6tOf1mT83WYJ4Lk2ytW/uwAWkrP0uFsdoYMdueVJ0qs26wZ+23xeB4ibNQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/tinyglobby": {
       "version": "0.2.17",
       "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
       "integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
       "dev": true,
@@ -1197,10 +1463,20 @@
       },
       "funding": {
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/tinyrainbow": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-3.1.1.tgz",
+      "integrity": "sha512-yau8yJdTt989Mm0Bd/236QnzEiPf2xLLTqUZRUJOo/3CB078LSwzei343DgtJVmfJKJE3TMINY1u42SQsP6mXw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=14.0.0"
+      }
+    },
     "node_modules/typescript": {
       "version": "5.6.3",
       "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.6.3.tgz",
       "integrity": "sha512-hjcS1mhfuyi4WW8IWtjP7brDrG2cuDZukyrYrSauoXGNgx0S7zceP07adYkJycEr56BOUTNPzbInooiN3fn1qw==",
       "dev": true,
@@ -1549,8 +1825,115 @@
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/parcel"
       }
+    },
+    "node_modules/vitest": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/vitest/-/vitest-4.1.11.tgz",
+      "integrity": "sha512-fhACrNXUidIbGSBr5FlbuBkO7VWC1ZyLl0DO4CU2DrQoAPxX84Ysxs+HeGQpii5lZWV1Q4gBZTTu49mF+A6Edw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/expect": "4.1.11",
+        "@vitest/mocker": "4.1.11",
+        "@vitest/pretty-format": "4.1.11",
+        "@vitest/runner": "4.1.11",
+        "@vitest/snapshot": "4.1.11",
+        "@vitest/spy": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "es-module-lexer": "^2.0.0",
+        "expect-type": "^1.3.0",
+        "magic-string": "^0.30.21",
+        "obug": "^2.1.1",
+        "pathe": "^2.0.3",
+        "picomatch": "^4.0.3",
+        "std-env": "^4.0.0-rc.1",
+        "tinybench": "^2.9.0",
+        "tinyexec": "^1.0.2",
+        "tinyglobby": "^0.2.15",
+        "tinyrainbow": "^3.1.0",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
+        "why-is-node-running": "^2.3.0"
+      },
+      "bin": {
+        "vitest": "vitest.mjs"
+      },
+      "engines": {
+        "node": "^20.0.0 || ^22.0.0 || >=24.0.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      },
+      "peerDependencies": {
+        "@edge-runtime/vm": "*",
+        "@opentelemetry/api": "^1.9.0",
+        "@types/node": "^20.0.0 || ^22.0.0 || >=24.0.0",
+        "@vitest/browser-playwright": "4.1.11",
+        "@vitest/browser-preview": "4.1.11",
+        "@vitest/browser-webdriverio": "4.1.11",
+        "@vitest/coverage-istanbul": "4.1.11",
+        "@vitest/coverage-v8": "4.1.11",
+        "@vitest/ui": "4.1.11",
+        "happy-dom": "*",
+        "jsdom": "*",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
+      },
+      "peerDependenciesMeta": {
+        "@edge-runtime/vm": {
+          "optional": true
+        },
+        "@opentelemetry/api": {
+          "optional": true
+        },
+        "@types/node": {
+          "optional": true
+        },
+        "@vitest/browser-playwright": {
+          "optional": true
+        },
+        "@vitest/browser-preview": {
+          "optional": true
+        },
+        "@vitest/browser-webdriverio": {
+          "optional": true
+        },
+        "@vitest/coverage-istanbul": {
+          "optional": true
+        },
+        "@vitest/coverage-v8": {
+          "optional": true
+        },
+        "@vitest/ui": {
+          "optional": true
+        },
+        "happy-dom": {
+          "optional": true
+        },
+        "jsdom": {
+          "optional": true
+        },
+        "vite": {
+          "optional": false
+        }
+      }
+    },
+    "node_modules/why-is-node-running": {
+      "version": "2.3.0",
+      "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
+      "integrity": "sha512-hUrmaWBdVDcxvYqnyh09zunKzROWjbZTiNy8dBEjkS7ehEDQibXJ7XvlmtbwuTclUiIyN+CyXQD4Vmko8fNm8w==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "siginfo": "^2.0.0",
+        "stackback": "0.0.2"
+      },
+      "bin": {
+        "why-is-node-running": "cli.js"
+      },
+      "engines": {
+        "node": ">=8"
+      }
     }
   }
 }
diff --git a/package.json b/package.json
index af22f30..c552b9a 100644
--- a/package.json
+++ b/package.json
@@ -4,13 +4,16 @@
   "type": "module",
   "scripts": {
     "dev": "vite",
     "dev:api": "cd backend && .venv/Scripts/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000",
     "build": "vite build",
-    "preview": "vite preview"
+    "preview": "vite preview",
+    "test": "vitest run",
+    "test:watch": "vitest"
   },
   "dependencies": {
+    "@mediapipe/tasks-vision": "^1.0.1",
     "hls.js": "^1.7.1",
     "react": "19.2.8",
     "react-dom": "19.2.8"
   },
   "devDependencies": {
@@ -18,8 +21,9 @@
     "@types/react": "^19.2.17",
     "@types/react-dom": "^19.2.3",
     "@vitejs/plugin-react": "^6.0.4",
     "tailwindcss": "^4.3.3",
     "typescript": "~5.6.3",
-    "vite": "^8.1.5"
+    "vite": "^8.1.5",
+    "vitest": "^4.1.11"
   }
 }
diff --git a/src/components/CameraStreamPlayer.tsx b/src/components/CameraStreamPlayer.tsx
index b8f270f..65d826e 100644
--- a/src/components/CameraStreamPlayer.tsx
+++ b/src/components/CameraStreamPlayer.tsx
@@ -1,9 +1,9 @@
 import { useEffect, useMemo, useRef, useState } from 'react';
 import Hls from 'hls.js';
 import type { Camera } from '../lib/mockData';
-import { useDetections } from '../lib/detections';
+import { useClientAnalytics } from '../lib/clientAnalytics';
 import {
   getProxiedStreamUrl,
   isHlsUrl,
   isStreamSupported,
   isVideoFileUrl,
@@ -42,13 +42,17 @@ export default function CameraStreamPlayer({ camera, onStateChange }: CameraStre
     const timer = window.setTimeout(() => setAnalyticsReady(true), 750);
     return () => window.clearTimeout(timer);
   }, [streamState]);
 
   const analyticsEnabled = analyticsReady;
-  const { frame: detectionFrame, connected: analyticsConnected, error: analyticsError } =
-    useDetections(camera.id, analyticsEnabled);
   const mediaRef = showVideo ? videoRef : imgRef;
+  const {
+    frame: detectionFrame,
+    ready: analyticsReadyFlag,
+    loading: analyticsLoading,
+    error: analyticsError,
+  } = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
   // HLS must use backend proxy so Referer/UA are applied server-side.
   const hlsSourceUrl = isHls ? proxiedUrl : directUrl;
 
   useEffect(() => {
     setStreamState('loading');
@@ -204,16 +208,18 @@ export default function CameraStreamPlayer({ camera, onStateChange }: CameraStre
           frame={detectionFrame}
           mediaRef={mediaRef}
           visible={analyticsEnabled}
         />
 
-        {(analyticsConnected || analyticsError) && (
+        {(analyticsReadyFlag || analyticsLoading || analyticsError) && (
           <div className="absolute top-2 right-2 rounded-md bg-black/50 px-2 py-1">
             <span className={`text-[10px] ${analyticsError ? 'text-red-300' : 'text-emerald-300'}`}>
               {analyticsError
                 ? 'РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°'
-                : `Р”РµС‚РµРєС†РёСЏ В· ${detectionFrame?.tracks?.length ?? 0}`}
+                : analyticsLoading
+                  ? 'Р—Р°РіСЂСѓР·РєР° РјРѕРґРµР»РёвЂ¦'
+                  : `Р”РµС‚РµРєС†РёСЏ В· ${detectionFrame?.tracks?.length ?? 0}`}
             </span>
           </div>
         )}
       </AnalyticsErrorBoundary>
       <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1">
diff --git a/src/lib/clientAnalytics.ts b/src/lib/clientAnalytics.ts
new file mode 100644
index 0000000..de852ea
--- /dev/null
+++ b/src/lib/clientAnalytics.ts
@@ -0,0 +1,162 @@
+import { useEffect, useRef, useState, type RefObject } from 'react';
+import type { DetectionFrame } from './detections';
+
+const TARGET_INTERVAL_MS = 1000 / 12;
+
+function mediaSize(media: HTMLVideoElement | HTMLImageElement) {
+  if (media instanceof HTMLVideoElement) {
+    return { width: media.videoWidth, height: media.videoHeight };
+  }
+  return { width: media.naturalWidth, height: media.naturalHeight };
+}
+
+export function useClientAnalytics(
+  mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>,
+  cameraId: string,
+  enabled: boolean,
+) {
+  const [frame, setFrame] = useState<DetectionFrame | null>(null);
+  const [ready, setReady] = useState(false);
+  const [loading, setLoading] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const workerRef = useRef<Worker | null>(null);
+  const inflightRef = useRef(false);
+  const lastSentRef = useRef(0);
+  const generationRef = useRef(0);
+  const enabledRef = useRef(enabled);
+  enabledRef.current = enabled;
+
+  useEffect(() => {
+    setLoading(true);
+    setReady(false);
+    setError(null);
+    setFrame(null);
+    inflightRef.current = false;
+    lastSentRef.current = 0;
+
+    let cancelled = false;
+    const worker = new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), {
+      type: 'module',
+    });
+    workerRef.current = worker;
+
+    worker.onmessage = (event: MessageEvent) => {
+      if (cancelled) return;
+      const data = event.data as
+        | { type: 'ready' }
+        | { type: 'result'; frame: DetectionFrame; generation: number }
+        | { type: 'error'; message: string; generation?: number };
+
+      if (data.type === 'ready') {
+        setReady(true);
+        setLoading(false);
+        setError(null);
+        return;
+      }
+      if (data.type === 'error') {
+        if (data.generation !== undefined && data.generation !== generationRef.current) return;
+        setError(data.message || 'РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
+        setLoading(false);
+        setReady(false);
+        inflightRef.current = false;
+        setFrame(null);
+        return;
+      }
+      if (data.type === 'result') {
+        if (data.generation !== generationRef.current) return;
+        inflightRef.current = false;
+        if (enabledRef.current) setFrame(data.frame);
+      }
+    };
+
+    worker.onerror = () => {
+      if (cancelled) return;
+      setError('РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
+      setLoading(false);
+      setReady(false);
+      inflightRef.current = false;
+      setFrame(null);
+    };
+
+    worker.postMessage({ type: 'init' });
+
+    return () => {
+      cancelled = true;
+      inflightRef.current = false;
+      worker.terminate();
+      if (workerRef.current === worker) workerRef.current = null;
+    };
+  }, []);
+
+  useEffect(() => {
+    generationRef.current += 1;
+    inflightRef.current = false;
+    lastSentRef.current = 0;
+    workerRef.current?.postMessage({ type: 'reset' });
+    setFrame(null);
+  }, [cameraId]);
+
+  useEffect(() => {
+    if (enabled) return;
+    generationRef.current += 1;
+    inflightRef.current = false;
+    lastSentRef.current = 0;
+    setFrame(null);
+  }, [enabled]);
+
+  useEffect(() => {
+    if (!enabled) return;
+
+    let raf = 0;
+    let cancelled = false;
+
+    const tick = async (now: number) => {
+      if (cancelled) return;
+      raf = requestAnimationFrame(tick);
+
+      const worker = workerRef.current;
+      const media = mediaRef.current;
+      if (!worker || !media || !ready || inflightRef.current) return;
+      if (now - lastSentRef.current < TARGET_INTERVAL_MS) return;
+
+      const { width, height } = mediaSize(media);
+      if (width <= 0 || height <= 0) return;
+
+      const generation = generationRef.current;
+      inflightRef.current = true;
+      try {
+        const bitmap = await createImageBitmap(media);
+        if (
+          cancelled ||
+          !enabledRef.current ||
+          generation !== generationRef.current ||
+          workerRef.current !== worker
+        ) {
+          bitmap.close();
+          return;
+        }
+        lastSentRef.current = now;
+        worker.postMessage(
+          { type: 'frame', bitmap, width, height, timestampMs: now, generation },
+          [bitmap],
+        );
+      } catch (err) {
+        if (generation === generationRef.current) {
+          inflightRef.current = false;
+          setFrame(null);
+          setReady(false);
+          setError(err instanceof Error ? err.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°С…РІР°С‚РёС‚СЊ РєР°РґСЂ');
+        }
+      }
+    };
+
+    raf = requestAnimationFrame(tick);
+    return () => {
+      cancelled = true;
+      inflightRef.current = false;
+      cancelAnimationFrame(raf);
+    };
+  }, [enabled, ready, mediaRef]);
+
+  return { frame, ready, loading, error };
+}
diff --git a/src/lib/detections.ts b/src/lib/detections.ts
index 0f1320f..307c95f 100644
--- a/src/lib/detections.ts
+++ b/src/lib/detections.ts
@@ -1,8 +1,5 @@
-import { useEffect, useRef, useState } from 'react';
-import { getToken } from './api';
-
 export interface DetectionTrack {
   trackId: number;
   class: 'person' | 'car' | string;
   bbox: [number, number, number, number];
   confidence: number;
@@ -14,126 +11,10 @@ export interface DetectionFrame {
   frameHeight: number;
   tracks: DetectionTrack[];
   error?: string;
 }
 
-export function getDetectionsWebSocketUrl(cameraId: string): string {
-  const token = getToken();
-  const params = new URLSearchParams();
-  if (token) {
-    params.set('token', token);
-  }
-  const query = params.toString();
-  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
-  return `${protocol}//${window.location.host}/api/cameras/${cameraId}/detections${query ? `?${query}` : ''}`;
-}
-
-export function useDetections(cameraId: string, enabled: boolean) {
-  const [frame, setFrame] = useState<DetectionFrame | null>(null);
-  const [connected, setConnected] = useState(false);
-  const [error, setError] = useState<string | null>(null);
-  const reconnectTimer = useRef<number | null>(null);
-
-  useEffect(() => {
-    if (!enabled) {
-      setFrame(null);
-      setConnected(false);
-      setError(null);
-      return;
-    }
-
-    let ws: WebSocket | null = null;
-    let cancelled = false;
-    let retryDelay = 1000;
-    let attempts = 0;
-    const maxAttempts = 8;
-
-    const clearReconnect = () => {
-      if (reconnectTimer.current !== null) {
-        window.clearTimeout(reconnectTimer.current);
-        reconnectTimer.current = null;
-      }
-    };
-
-    const connect = () => {
-      if (cancelled) return;
-      if (attempts >= maxAttempts) {
-        setError('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊ Р°РЅР°Р»РёС‚РёРєСѓ');
-        setConnected(false);
-        return;
-      }
-      clearReconnect();
-      attempts += 1;
-
-      try {
-        ws = new WebSocket(getDetectionsWebSocketUrl(cameraId));
-      } catch (err) {
-        setError(err instanceof Error ? err.message : 'WebSocket failed');
-        setConnected(false);
-        return;
-      }
-
-      ws.onopen = () => {
-        if (cancelled) return;
-        setConnected(true);
-        setError(null);
-        retryDelay = 1000;
-        attempts = 0;
-      };
-
-      ws.onmessage = (event) => {
-        if (cancelled) return;
-        try {
-          const payload = JSON.parse(event.data) as DetectionFrame;
-          if (payload.error) {
-            setError(payload.error);
-            setFrame(null);
-            return;
-          }
-          setError(null);
-          setFrame({
-            ts: payload.ts,
-            frameWidth: payload.frameWidth,
-            frameHeight: payload.frameHeight,
-            tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
-          });
-        } catch {
-          // ignore malformed payloads
-        }
-      };
-
-      ws.onclose = (event) => {
-        if (cancelled) return;
-        setConnected(false);
-        // Auth / not found вЂ” do not retry forever.
-        if (event.code === 4401 || event.code === 4404 || event.code === 4400) {
-          setError('РђРЅР°Р»РёС‚РёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
-          return;
-        }
-        reconnectTimer.current = window.setTimeout(() => {
-          retryDelay = Math.min(retryDelay * 2, 10000);
-          connect();
-        }, retryDelay);
-      };
-
-      ws.onerror = () => {
-        ws?.close();
-      };
-    };
-
-    connect();
-
-    return () => {
-      cancelled = true;
-      clearReconnect();
-      ws?.close();
-    };
-  }, [cameraId, enabled]);
-
-  return { frame, connected, error };
-}
-
 export function getContentRect(
   containerW: number,
   containerH: number,
   mediaW: number,
   mediaH: number,
diff --git a/src/lib/tracker.test.ts b/src/lib/tracker.test.ts
new file mode 100644
index 0000000..32a2408
--- /dev/null
+++ b/src/lib/tracker.test.ts
@@ -0,0 +1,58 @@
+import { describe, expect, it } from 'vitest';
+import { SortTracker } from './tracker';
+
+describe('SortTracker', () => {
+  it('assigns stable ids across frames for overlapping boxes', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    expect(t0).toHaveLength(1);
+    const id = t0[0].trackId;
+
+    const t1 = tracker.update(
+      [{ className: 'person', confidence: 0.88, bbox: [12, 12, 52, 82] }],
+      100,
+    );
+    expect(t1).toHaveLength(1);
+    expect(t1[0].trackId).toBe(id);
+  });
+
+  it('hides tracks until minHits', () => {
+    const tracker = new SortTracker({ minHits: 2, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [100, 100, 200, 180] }],
+      0,
+    );
+    expect(t0).toHaveLength(0);
+    const t1 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [102, 100, 202, 180] }],
+      50,
+    );
+    expect(t1).toHaveLength(1);
+  });
+
+  it('drops tracks after maxAgeMs without matches', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    tracker.update([{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }], 0);
+    const still = tracker.update([], 700);
+    expect(still).toHaveLength(1);
+    const gone = tracker.update([], 800);
+    expect(gone).toHaveLength(0);
+  });
+
+  it('reset clears ids', () => {
+    const tracker = new SortTracker({ minHits: 1 });
+    const a = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    tracker.reset();
+    const b = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      10,
+    );
+    expect(b[0].trackId).not.toBe(a[0].trackId);
+  });
+});
diff --git a/src/lib/tracker.ts b/src/lib/tracker.ts
new file mode 100644
index 0000000..de1d0db
--- /dev/null
+++ b/src/lib/tracker.ts
@@ -0,0 +1,157 @@
+export type TrackBBox = [number, number, number, number];
+
+export interface RawDetection {
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+export interface TrackedObject {
+  trackId: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+interface TrackerOptions {
+  iouThreshold?: number;
+  maxAgeMs?: number;
+  minHits?: number;
+}
+
+interface InternalTrack {
+  id: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+  hits: number;
+  ageMs: number;
+  timeSinceUpdateMs: number;
+  // simple constant-velocity on center + size
+  vx: number;
+  vy: number;
+  vw: number;
+  vh: number;
+}
+
+function iou(a: TrackBBox, b: TrackBBox): number {
+  const x1 = Math.max(a[0], b[0]);
+  const y1 = Math.max(a[1], b[1]);
+  const x2 = Math.min(a[2], b[2]);
+  const y2 = Math.min(a[3], b[3]);
+  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
+  if (inter <= 0) return 0;
+  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
+  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
+  const denom = areaA + areaB - inter;
+  return denom > 0 ? inter / denom : 0;
+}
+
+function centerSize(b: TrackBBox) {
+  const w = b[2] - b[0];
+  const h = b[3] - b[1];
+  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
+}
+
+function fromCenterSize(cx: number, cy: number, w: number, h: number): TrackBBox {
+  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
+}
+
+export class SortTracker {
+  private iouThreshold: number;
+  private maxAgeMs: number;
+  private minHits: number;
+  private nextId = 1;
+  private tracks: InternalTrack[] = [];
+  private lastTs: number | null = null;
+
+  constructor(opts: TrackerOptions = {}) {
+    this.iouThreshold = opts.iouThreshold ?? 0.3;
+    this.maxAgeMs = opts.maxAgeMs ?? 750;
+    this.minHits = opts.minHits ?? 2;
+  }
+
+  /** Clears active tracks and timestamp state; track IDs remain monotonic (nextId is not reset). */
+  reset(): void {
+    this.tracks = [];
+    this.lastTs = null;
+  }
+
+  update(dets: RawDetection[], nowMs: number): TrackedObject[] {
+    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
+    this.lastTs = nowMs;
+
+    for (const tr of this.tracks) {
+      const { cx, cy, w, h } = centerSize(tr.bbox);
+      const ncx = cx + tr.vx * dt;
+      const ncy = cy + tr.vy * dt;
+      const nw = Math.max(1, w + tr.vw * dt);
+      const nh = Math.max(1, h + tr.vh * dt);
+      tr.bbox = fromCenterSize(ncx, ncy, nw, nh);
+      tr.ageMs += dt;
+      tr.timeSinceUpdateMs += dt;
+    }
+
+    const trackIdx = this.tracks.map((_, i) => i);
+    const detIdx = dets.map((_, i) => i);
+    const pairs: { t: number; d: number; score: number }[] = [];
+    for (const t of trackIdx) {
+      for (const d of detIdx) {
+        const score = iou(this.tracks[t].bbox, dets[d].bbox);
+        if (score >= this.iouThreshold) pairs.push({ t, d, score });
+      }
+    }
+    pairs.sort((a, b) => b.score - a.score);
+
+    const usedT = new Set<number>();
+    const usedD = new Set<number>();
+    for (const p of pairs) {
+      if (usedT.has(p.t) || usedD.has(p.d)) continue;
+      usedT.add(p.t);
+      usedD.add(p.d);
+      const tr = this.tracks[p.t];
+      const det = dets[p.d];
+      const prev = centerSize(tr.bbox);
+      const next = centerSize(det.bbox);
+      const invDt = dt > 0 ? 1 / dt : 0;
+      tr.vx = (next.cx - prev.cx) * invDt;
+      tr.vy = (next.cy - prev.cy) * invDt;
+      tr.vw = (next.w - prev.w) * invDt;
+      tr.vh = (next.h - prev.h) * invDt;
+      tr.bbox = [...det.bbox] as TrackBBox;
+      tr.className = det.className;
+      tr.confidence = det.confidence;
+      tr.hits += 1;
+      tr.timeSinceUpdateMs = 0;
+    }
+
+    for (let d = 0; d < dets.length; d++) {
+      if (usedD.has(d)) continue;
+      const det = dets[d];
+      this.tracks.push({
+        id: this.nextId++,
+        className: det.className,
+        confidence: det.confidence,
+        bbox: [...det.bbox] as TrackBBox,
+        hits: 1,
+        ageMs: 0,
+        timeSinceUpdateMs: 0,
+        vx: 0,
+        vy: 0,
+        vw: 0,
+        vh: 0,
+      });
+    }
+
+    this.tracks = this.tracks.filter((tr) => tr.timeSinceUpdateMs <= this.maxAgeMs);
+
+    return this.tracks
+      .filter((tr) => tr.hits >= this.minHits)
+      .map((tr) => ({
+        trackId: tr.id,
+        className: tr.className,
+        confidence: tr.confidence,
+        bbox: [...tr.bbox] as TrackBBox,
+      }));
+  }
+}
diff --git a/src/workers/analyticsWorker.ts b/src/workers/analyticsWorker.ts
new file mode 100644
index 0000000..01c5e0e
--- /dev/null
+++ b/src/workers/analyticsWorker.ts
@@ -0,0 +1,142 @@
+/// <reference lib="webworker" />
+
+import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
+import type { DetectionFrame } from '../lib/detections';
+import { SortTracker, type RawDetection } from '../lib/tracker';
+
+type InMsg =
+  | { type: 'init' }
+  | { type: 'reset' }
+  | {
+      type: 'frame';
+      bitmap: ImageBitmap;
+      width: number;
+      height: number;
+      timestampMs: number;
+      generation: number;
+    };
+
+type OutMsg =
+  | { type: 'ready' }
+  | { type: 'result'; frame: DetectionFrame; generation: number }
+  | { type: 'error'; message: string; generation?: number };
+
+const CLASS_MAP: Record<string, string> = {
+  person: 'person',
+  car: 'car',
+  bus: 'car',
+  truck: 'car',
+};
+
+const MODEL_URL =
+  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
+const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
+const CATEGORY_ALLOWLIST = ['person', 'car', 'bus', 'truck'];
+
+let detector: ObjectDetector | null = null;
+let busy = false;
+const tracker = new SortTracker({ iouThreshold: 0.3, maxAgeMs: 750, minHits: 2 });
+
+function post(message: OutMsg): void {
+  self.postMessage(message);
+}
+
+function errorMessage(error: unknown): string {
+  return error instanceof Error ? error.message : String(error);
+}
+
+function mapDetections(
+  result: ReturnType<ObjectDetector['detectForVideo']>,
+): RawDetection[] {
+  const detections: RawDetection[] = [];
+
+  for (const detection of result.detections ?? []) {
+    const category = detection.categories?.[0];
+    const className = CLASS_MAP[(category?.categoryName ?? '').toLowerCase()];
+    const box = detection.boundingBox;
+    if (!className || !box) continue;
+
+    detections.push({
+      className,
+      confidence: category?.score ?? 0,
+      bbox: [
+        box.originX,
+        box.originY,
+        box.originX + box.width,
+        box.originY + box.height,
+      ],
+    });
+  }
+
+  return detections;
+}
+
+async function createDetector(delegate: 'GPU' | 'CPU'): Promise<ObjectDetector> {
+  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
+  return ObjectDetector.createFromOptions(vision, {
+    baseOptions: {
+      modelAssetPath: MODEL_URL,
+      delegate,
+    },
+    scoreThreshold: 0.35,
+    runningMode: 'VIDEO',
+    categoryAllowlist: CATEGORY_ALLOWLIST,
+  });
+}
+
+async function init(): Promise<void> {
+  try {
+    detector = await createDetector('GPU');
+    post({ type: 'ready' });
+  } catch {
+    try {
+      detector = await createDetector('CPU');
+      post({ type: 'ready' });
+    } catch (error) {
+      post({ type: 'error', message: errorMessage(error) });
+    }
+  }
+}
+
+self.onmessage = async (event: MessageEvent<InMsg>): Promise<void> => {
+  const data = event.data;
+
+  if (data.type === 'init') {
+    await init();
+    return;
+  }
+
+  if (data.type === 'reset') {
+    tracker.reset();
+    return;
+  }
+
+  const { bitmap, width, height, timestampMs, generation } = data;
+  if (!detector || busy) {
+    bitmap.close();
+    return;
+  }
+
+  busy = true;
+  try {
+    const result = detector.detectForVideo(bitmap, timestampMs);
+    const tracked = tracker.update(mapDetections(result), timestampMs);
+    const frame: DetectionFrame = {
+      ts: timestampMs / 1000,
+      frameWidth: width,
+      frameHeight: height,
+      tracks: tracked.map((track) => ({
+        trackId: track.trackId,
+        class: track.className,
+        bbox: track.bbox,
+        confidence: track.confidence,
+      })),
+    };
+    post({ type: 'result', frame, generation });
+  } catch (error) {
+    post({ type: 'error', message: errorMessage(error), generation });
+  } finally {
+    bitmap.close();
+    busy = false;
+  }
+};
diff --git a/vite.config.ts b/vite.config.ts
index b05dfc1..d4da4de 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -11,6 +11,10 @@ export default defineConfig({
         changeOrigin: true,
         ws: true,
       },
     },
   },
+  test: {
+    environment: 'node',
+    include: ['src/**/*.test.ts'],
+  },
 })
`
