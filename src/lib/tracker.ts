export type TrackBBox = [number, number, number, number];

export interface RawDetection {
  className: string;
  confidence: number;
  bbox: TrackBBox;
}

export interface TrackedObject {
  trackId: number;
  className: string;
  confidence: number;
  bbox: TrackBBox;
}

interface TrackerOptions {
  iouThreshold?: number;
  maxAgeMs?: number;
  minHits?: number;
}

interface InternalTrack {
  id: number;
  className: string;
  confidence: number;
  /** Last matched detection bbox (never a coasting prediction). */
  bbox: TrackBBox;
  hits: number;
  ageMs: number;
  timeSinceUpdateMs: number;
  // constant-velocity on center + size, estimated from successive measurements
  vx: number;
  vy: number;
  vw: number;
  vh: number;
}

function iou(a: TrackBBox, b: TrackBBox): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const denom = areaA + areaB - inter;
  return denom > 0 ? inter / denom : 0;
}

function centerSize(b: TrackBBox) {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
}

function fromCenterSize(cx: number, cy: number, w: number, h: number): TrackBBox {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function predictBBox(
  bbox: TrackBBox,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  dt: number,
): TrackBBox {
  const { cx, cy, w, h } = centerSize(bbox);
  return fromCenterSize(
    cx + vx * dt,
    cy + vy * dt,
    Math.max(1, w + vw * dt),
    Math.max(1, h + vh * dt),
  );
}

export class SortTracker {
  private iouThreshold: number;
  private maxAgeMs: number;
  private minHits: number;
  private nextId = 1;
  private tracks: InternalTrack[] = [];
  private lastTs: number | null = null;

  constructor(opts: TrackerOptions = {}) {
    this.iouThreshold = opts.iouThreshold ?? 0.3;
    this.maxAgeMs = opts.maxAgeMs ?? 750;
    this.minHits = opts.minHits ?? 2;
  }

  /** Clears active tracks and timestamp state; track IDs remain monotonic (nextId is not reset). */
  reset(): void {
    this.tracks = [];
    this.lastTs = null;
  }

  update(dets: RawDetection[], nowMs: number): TrackedObject[] {
    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
    this.lastTs = nowMs;

    // Predict only for association; keep measured bbox for output/coasting display.
    const predicted = this.tracks.map((tr) =>
      predictBBox(tr.bbox, tr.vx, tr.vy, tr.vw, tr.vh, dt),
    );

    for (const tr of this.tracks) {
      tr.ageMs += dt;
      tr.timeSinceUpdateMs += dt;
    }

    const pairs: { t: number; d: number; score: number }[] = [];
    for (let t = 0; t < this.tracks.length; t++) {
      for (let d = 0; d < dets.length; d++) {
        const score = iou(predicted[t], dets[d].bbox);
        if (score >= this.iouThreshold) pairs.push({ t, d, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedT = new Set<number>();
    const usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.t) || usedD.has(p.d)) continue;
      usedT.add(p.t);
      usedD.add(p.d);
      const tr = this.tracks[p.t];
      const det = dets[p.d];
      // Velocity from successive measurements (not residual to prediction).
      const prev = centerSize(tr.bbox);
      const next = centerSize(det.bbox);
      const invDt = dt > 0 ? 1 / dt : 0;
      tr.vx = (next.cx - prev.cx) * invDt;
      tr.vy = (next.cy - prev.cy) * invDt;
      tr.vw = (next.w - prev.w) * invDt;
      tr.vh = (next.h - prev.h) * invDt;
      tr.bbox = [...det.bbox] as TrackBBox;
      tr.className = det.className;
      tr.confidence = det.confidence;
      tr.hits += 1;
      tr.timeSinceUpdateMs = 0;
    }

    for (let d = 0; d < dets.length; d++) {
      if (usedD.has(d)) continue;
      const det = dets[d];
      this.tracks.push({
        id: this.nextId++,
        className: det.className,
        confidence: det.confidence,
        bbox: [...det.bbox] as TrackBBox,
        hits: 1,
        ageMs: 0,
        timeSinceUpdateMs: 0,
        vx: 0,
        vy: 0,
        vw: 0,
        vh: 0,
      });
    }

    this.tracks = this.tracks.filter((tr) => tr.timeSinceUpdateMs <= this.maxAgeMs);

    return this.tracks
      .filter((tr) => tr.hits >= this.minHits)
      .map((tr) => ({
        trackId: tr.id,
        className: tr.className,
        confidence: tr.confidence,
        bbox: [...tr.bbox] as TrackBBox,
      }));
  }
}
