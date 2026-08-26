import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DetectionFrame } from './detections';

const TARGET_INTERVAL_MS = 1000 / 12;

export function isCorsCaptureError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'SecurityError' ||
    /(?:taint(?:ed)?|cross[- ]origin|cors|insecure)/i.test(message)
  );
}

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
  onCaptureError?: (error: unknown) => void,
) {
  const [frame, setFrame] = useState<DetectionFrame | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const inflightRef = useRef(false);
  const lastSentRef = useRef(0);
  const generationRef = useRef(0);
  const workerReadyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onCaptureErrorRef = useRef(onCaptureError);
  enabledRef.current = enabled;
  onCaptureErrorRef.current = onCaptureError;

  useEffect(() => {
    if (!enabled) return;
    if (workerRef.current) {
      if (workerReadyRef.current) {
        setReady(true);
        setLoading(false);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setReady(false);
    setError(null);
    setFrame(null);
    inflightRef.current = false;
    lastSentRef.current = 0;

    const worker = new Worker(new URL('../workers/analyticsWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      if (workerRef.current !== worker) return;
      const data = event.data as
        | { type: 'ready' }
        | { type: 'result'; frame: DetectionFrame; generation: number }
        | { type: 'error'; message: string; generation?: number };

      if (data.type === 'ready') {
        workerReadyRef.current = true;
        setReady(true);
        setLoading(false);
        setError(null);
        return;
      }
      if (data.type === 'error') {
        if (data.generation !== undefined && data.generation !== generationRef.current) return;
        workerReadyRef.current = false;
        setError(data.message || 'Аналитика недоступна');
        setLoading(false);
        setReady(false);
        inflightRef.current = false;
        setFrame(null);
        return;
      }
      if (data.type === 'result') {
        if (data.generation !== generationRef.current) return;
        inflightRef.current = false;
        if (enabledRef.current) setFrame(data.frame);
      }
    };

    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      workerReadyRef.current = false;
      setError('Аналитика недоступна');
      setLoading(false);
      setReady(false);
      inflightRef.current = false;
      setFrame(null);
    };

    worker.postMessage({ type: 'init' });
  }, [enabled]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      inflightRef.current = false;
      workerReadyRef.current = false;
      const worker = workerRef.current;
      workerRef.current = null;
      worker?.terminate();
    },
    [],
  );

  useEffect(() => {
    generationRef.current += 1;
    inflightRef.current = false;
    lastSentRef.current = 0;
    workerRef.current?.postMessage({ type: 'reset' });
    setFrame(null);
  }, [cameraId]);

  useEffect(() => {
    if (enabled) return;
    generationRef.current += 1;
    inflightRef.current = false;
    lastSentRef.current = 0;
    setFrame(null);
  }, [enabled]);

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

      const generation = generationRef.current;
      inflightRef.current = true;
      try {
        const bitmap = await createImageBitmap(media);
        if (
          cancelled ||
          !enabledRef.current ||
          generation !== generationRef.current ||
          workerRef.current !== worker
        ) {
          bitmap.close();
          return;
        }
        lastSentRef.current = now;
        worker.postMessage(
          { type: 'frame', bitmap, width, height, timestampMs: now, generation },
          [bitmap],
        );
      } catch (err) {
        if (generation === generationRef.current) {
          inflightRef.current = false;
          setFrame(null);
          setReady(false);
          setError(err instanceof Error ? err.message : 'Не удалось захватить кадр');
          onCaptureErrorRef.current?.(err);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      inflightRef.current = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled, ready, mediaRef]);

  return { frame, ready, loading, error };
}
