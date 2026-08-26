import { useEffect, useRef } from 'react';
import { ApiError } from './api';
import type { DetectionFrame } from './detections';
import { postPresence } from './lighting';
import { tracksIndicatePresence } from './presence';

const HEARTBEAT_MS = 7000;

function safePostPresence(body: Parameters<typeof postPresence>[0]) {
  void postPresence(body).catch((err) => {
    console.warn('Presence report failed:', err instanceof ApiError ? err.message : err);
  });
}

export function usePresenceReporter(
  cameraId: string,
  frame: DetectionFrame | null,
  enabled: boolean,
): void {
  const lastPresentRef = useRef<boolean | null>(null);
  const lastHeartbeatRef = useRef(0);

  useEffect(() => {
    lastPresentRef.current = null;
    lastHeartbeatRef.current = 0;

    return () => {
      if (lastPresentRef.current === true) {
        safePostPresence({ cameraId, present: false });
      }
    };
  }, [cameraId]);

  useEffect(() => {
    if (!enabled) {
      if (lastPresentRef.current === true) {
        safePostPresence({ cameraId, present: false });
      }
      lastPresentRef.current = null;
      lastHeartbeatRef.current = 0;
      return;
    }

    if (!frame) return;

    const { present, classes } = tracksIndicatePresence(frame.tracks);
    const now = Date.now();
    const edge = lastPresentRef.current !== present;
    const heartbeat = present && now - lastHeartbeatRef.current > HEARTBEAT_MS;

    if (!edge && !heartbeat) return;

    lastPresentRef.current = present;
    lastHeartbeatRef.current = now;
    safePostPresence({
      cameraId,
      present,
      classes: present ? classes : undefined,
    });
  }, [cameraId, frame, enabled]);
}
