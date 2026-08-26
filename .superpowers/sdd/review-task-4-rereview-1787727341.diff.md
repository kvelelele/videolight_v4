# Review package
BASE: 738b2322b80c4557635dac89c177b8e68e5f1758
HEAD: ced25ebd51644074aca93ca508409146f7f81637

## Commits
`
ced25eb fix: keep client analytics worker warm
bcd263a feat: run client MediaPipe analytics in CameraStreamPlayer
`

## Stat
`
 .superpowers/sdd/task-4-report.md     |  52 +++++++++++
 src/components/CameraStreamPlayer.tsx |  16 ++--
 src/lib/clientAnalytics.ts            | 162 ++++++++++++++++++++++++++++++++++
 src/lib/detections.ts                 |   5 --
 src/workers/analyticsWorker.ts        |  11 +--
 5 files changed, 231 insertions(+), 15 deletions(-)
`

## Diff
`diff
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
diff --git a/src/components/CameraStreamPlayer.tsx b/src/components/CameraStreamPlayer.tsx
index b8f270f..65d826e 100644
--- a/src/components/CameraStreamPlayer.tsx
+++ b/src/components/CameraStreamPlayer.tsx
@@ -1,14 +1,14 @@
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
   shouldUseDirectStream,
 } from '../lib/streams';
 import AnalyticsErrorBoundary from './AnalyticsErrorBoundary';
 import DetectionOverlay from './DetectionOverlay';
 
@@ -37,23 +37,27 @@ export default function CameraStreamPlayer({ camera, onStateChange }: CameraStre
   useEffect(() => {
     if (streamState !== 'playing') {
       setAnalyticsReady(false);
       return;
     }
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
     setUseProxy(!shouldUseDirectStream(camera));
     onStateChange?.('loading');
   }, [camera.id, camera.sourceType, camera.sourceUrl, onStateChange]);
 
   useEffect(() => {
@@ -199,26 +203,28 @@ export default function CameraStreamPlayer({ camera, onStateChange }: CameraStre
         />
       )}
 
       <AnalyticsErrorBoundary>
         <DetectionOverlay
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
         <span className="text-[10px] text-gray-300">
           {camera.name} В· {camera.resolution}
         </span>
       </div>
     </div>
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
index 3b54501..307c95f 100644
--- a/src/lib/detections.ts
+++ b/src/lib/detections.ts
@@ -39,15 +39,10 @@ export function getContentRect(
 
 export const CLASS_COLORS: Record<string, string> = {
   person: '#22c55e',
   car: '#3b82f6',
 };
 
 export const CLASS_LABELS: Record<string, string> = {
   person: 'С‡РµР»РѕРІРµРє',
   car: 'Р°РІС‚Рѕ',
 };
-
-// TEMP: removed in Task 4
-export function useDetections(_cameraId: string, _enabled: boolean) {
-  return { frame: null, connected: false, error: null };
-}
diff --git a/src/workers/analyticsWorker.ts b/src/workers/analyticsWorker.ts
index 11a15c1..01c5e0e 100644
--- a/src/workers/analyticsWorker.ts
+++ b/src/workers/analyticsWorker.ts
@@ -6,26 +6,27 @@ import { SortTracker, type RawDetection } from '../lib/tracker';
 
 type InMsg =
   | { type: 'init' }
   | { type: 'reset' }
   | {
       type: 'frame';
       bitmap: ImageBitmap;
       width: number;
       height: number;
       timestampMs: number;
+      generation: number;
     };
 
 type OutMsg =
   | { type: 'ready' }
-  | { type: 'result'; frame: DetectionFrame }
-  | { type: 'error'; message: string };
+  | { type: 'result'; frame: DetectionFrame; generation: number }
+  | { type: 'error'; message: string; generation?: number };
 
 const CLASS_MAP: Record<string, string> = {
   person: 'person',
   car: 'car',
   bus: 'car',
   truck: 'car',
 };
 
 const MODEL_URL =
   'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
@@ -103,39 +104,39 @@ self.onmessage = async (event: MessageEvent<InMsg>): Promise<void> => {
   if (data.type === 'init') {
     await init();
     return;
   }
 
   if (data.type === 'reset') {
     tracker.reset();
     return;
   }
 
-  const { bitmap, width, height, timestampMs } = data;
+  const { bitmap, width, height, timestampMs, generation } = data;
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
-    post({ type: 'result', frame });
+    post({ type: 'result', frame, generation });
   } catch (error) {
-    post({ type: 'error', message: errorMessage(error) });
+    post({ type: 'error', message: errorMessage(error), generation });
   } finally {
     bitmap.close();
     busy = false;
   }
 };
`
