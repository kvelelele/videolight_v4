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
      inflightRef.current = false;
      lastSentRef.current = 0;
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }

    setLoading(true);
    setReady(false);
    setError(null);
    setFrame(null);
    inflightRef.current = false;
    lastSentRef.current = 0;

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
      inflightRef.current = false;
    };

    worker.postMessage({ type: 'init' });

    return () => {
      cancelled = true;
      inflightRef.current = false;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !workerRef.current) return;
    inflightRef.current = false;
    lastSentRef.current = 0;
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
        if (cancelled || inflightRef.current || workerRef.current !== worker) {
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
        setReady(false);
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
