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
