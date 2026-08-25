import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  getContentRect,
  type DetectionFrame,
  type DetectionTrack,
} from '../lib/detections';

interface DetectionOverlayProps {
  frame: DetectionFrame | null;
  mediaRef: RefObject<HTMLVideoElement | HTMLImageElement | null>;
  visible: boolean;
}

function getMediaDimensions(media: HTMLVideoElement | HTMLImageElement) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

function labelFor(track: DetectionTrack): string {
  const name = CLASS_LABELS[track.class] ?? String(track.class);
  const pct = Number.isFinite(track.confidence) ? Math.round(track.confidence * 100) : 0;
  return `${name} ${pct}%`;
}

export default function DetectionOverlay({ frame, mediaRef, visible }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    if (!visible) return;

    const canvas = canvasRef.current;
    const media = mediaRef.current;
    if (!canvas || !media) return;

    try {
      const rect = media.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayW = Math.max(0, Math.floor(rect.width));
      const displayH = Math.max(0, Math.floor(rect.height));
      if (displayW === 0 || displayH === 0) return;

      if (displayW !== sizeRef.current.w || displayH !== sizeRef.current.h) {
        sizeRef.current = { w: displayW, h: displayH };
        canvas.width = Math.round(displayW * dpr);
        canvas.height = Math.round(displayH * dpr);
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, displayW, displayH);

      if (!frame?.tracks?.length) return;

      const mediaDims = getMediaDimensions(media);
      const sourceW = frame.frameWidth || mediaDims.width;
      const sourceH = frame.frameHeight || mediaDims.height;
      if (sourceW <= 0 || sourceH <= 0) return;

      const content = getContentRect(displayW, displayH, sourceW, sourceH);
      const scaleX = content.w / sourceW;
      const scaleY = content.h / sourceH;

      for (const track of frame.tracks) {
        if (!track?.bbox || track.bbox.length < 4) continue;
        const [x1, y1, x2, y2] = track.bbox;
        const left = content.x + x1 * scaleX;
        const top = content.y + y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;
        const color = CLASS_COLORS[track.class] ?? '#f59e0b';
        const label = labelFor(track);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, width, height);

        ctx.font = '600 12px system-ui, sans-serif';
        const textW = ctx.measureText(label).width;
        const labelH = 18;
        const labelY = Math.max(top - labelH, 0);

        ctx.fillStyle = color;
        ctx.fillRect(left, labelY, textW + 8, labelH);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, left + 4, labelY + 13);
      }
    } catch (err) {
      console.error('DetectionOverlay draw failed:', err);
    }
  }, [frame, mediaRef, visible]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[5]"
      aria-hidden
    />
  );
}
