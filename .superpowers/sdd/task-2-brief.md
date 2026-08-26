### Task 2: Slim `detections.ts` types (remove WebSocket hook)

**Files:**
- Modify: `src/lib/detections.ts`
- Modify: `src/components/CameraStreamPlayer.tsx` (temporary: comment/stub only if compile breaks — prefer finishing Task 4 same session; if Task 2 alone must compile, leave a thin deprecated stub that returns empty state until Task 4)

**Interfaces:**
- Consumes: none
- Produces: `DetectionTrack`, `DetectionFrame`, `getContentRect`, `CLASS_COLORS`, `CLASS_LABELS` (unchanged shapes)

- [ ] **Step 1: Replace `src/lib/detections.ts` with types + helpers only**

```ts
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
```

- [ ] **Step 2: If `CameraStreamPlayer` still imports `useDetections`, add a one-line temporary stub at bottom of `detections.ts` ONLY if Task 3–4 are not landed in the same working tree commit chain — otherwise skip stub and continue to Task 3 immediately.**

Preferred: do not leave a stub; complete Tasks 3–4 before relying on `npm run build`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/detections.ts
git commit -m "refactor: remove WebSocket detection client from detections.ts"
```

---
