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
