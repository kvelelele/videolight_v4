import { useEffect, useRef, useState } from 'react';
import { getToken } from './api';

export interface DetectionTrack {
  trackId: number;
  class: 'person' | 'car' | string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface DetectionFrame {
  ts: number;
  frameWidth: number;
  frameHeight: number;
  tracks: DetectionTrack[];
  error?: string;
}

export function getDetectionsWebSocketUrl(cameraId: string): string {
  const token = getToken();
  const params = new URLSearchParams();
  if (token) {
    params.set('token', token);
  }
  const query = params.toString();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/cameras/${cameraId}/detections${query ? `?${query}` : ''}`;
}

export function useDetections(cameraId: string, enabled: boolean) {
  const [frame, setFrame] = useState<DetectionFrame | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      setConnected(false);
      setError(null);
      return;
    }

    let ws: WebSocket | null = null;
    let cancelled = false;
    let retryDelay = 1000;
    let attempts = 0;
    const maxAttempts = 8;

    const clearReconnect = () => {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setError('Не удалось подключить аналитику');
        setConnected(false);
        return;
      }
      clearReconnect();
      attempts += 1;

      try {
        ws = new WebSocket(getDetectionsWebSocketUrl(cameraId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'WebSocket failed');
        setConnected(false);
        return;
      }

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        retryDelay = 1000;
        attempts = 0;
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as DetectionFrame;
          if (payload.error) {
            setError(payload.error);
            setFrame(null);
            return;
          }
          setError(null);
          setFrame({
            ts: payload.ts,
            frameWidth: payload.frameWidth,
            frameHeight: payload.frameHeight,
            tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
          });
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        setConnected(false);
        // Auth / not found — do not retry forever.
        if (event.code === 4401 || event.code === 4404 || event.code === 4400) {
          setError('Аналитика недоступна');
          return;
        }
        reconnectTimer.current = window.setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 10000);
          connect();
        }, retryDelay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      ws?.close();
    };
  }, [cameraId, enabled]);

  return { frame, connected, error };
}

export function getContentRect(
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
) {
  if (mediaW <= 0 || mediaH <= 0 || containerW <= 0 || containerH <= 0) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }

  const mediaAspect = mediaW / mediaH;
  const containerAspect = containerW / containerH;

  if (mediaAspect > containerAspect) {
    const w = containerW;
    const h = containerW / mediaAspect;
    return { x: 0, y: (containerH - h) / 2, w, h };
  }

  const h = containerH;
  const w = containerH * mediaAspect;
  return { x: (containerW - w) / 2, y: 0, w, h };
}

export const CLASS_COLORS: Record<string, string> = {
  person: '#22c55e',
  car: '#3b82f6',
};

export const CLASS_LABELS: Record<string, string> = {
  person: 'человек',
  car: 'авто',
};
