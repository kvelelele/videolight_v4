# Task 2 Report: Slim `detections.ts` (remove WebSocket hook)

**Branch:** `ui-tracking`  
**Date:** 2026-08-26  
**Status:** Complete

## Summary

Removed the WebSocket detection client from `src/lib/detections.ts`, leaving shared types and overlay helpers. Added a temporary `useDetections` stub so `CameraStreamPlayer` continues to compile without changes until Task 4 wires in client-side analytics.

## Changes

### `src/lib/detections.ts`

**Removed:**
- React imports (`useEffect`, `useRef`, `useState`)
- `./api` import (`getToken`)
- `getDetectionsWebSocketUrl()`
- Full `useDetections` WebSocket hook (~115 lines): connection, retry/backoff, message parsing, cleanup

**Retained (unchanged shapes):**
- `DetectionTrack`, `DetectionFrame` interfaces
- `getContentRect()` overlay layout helper
- `CLASS_COLORS`, `CLASS_LABELS` constants

**Added (temporary):**
```ts
// TEMP: removed in Task 4
export function useDetections(_cameraId: string, _enabled: boolean) {
  return { frame: null, connected: false, error: null };
}
```

### Not modified (per binding resolution)

- `src/components/CameraStreamPlayer.tsx` — still imports `useDetections` from `detections.ts`; compiles against stub
- `src/components/DetectionOverlay.tsx` — unchanged; continues to consume types/helpers from `detections.ts`

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `npm run test` | Pass (4/4) |
| Linter (`detections.ts`) | No issues |

## Commit

```
refactor: remove WebSocket detection client from detections.ts
```

Only `src/lib/detections.ts` staged and committed. Not pushed.

## Impact / follow-up

- **Runtime:** Analytics overlay will show no detections until Task 3–4 land (`frame` is always `null`, `connected` always `false`).
- **Task 4:** Remove the TEMP stub; point `CameraStreamPlayer` at the new client analytics hook (or re-export from `detections.ts` if desired).
- **No regressions** in build or existing vitest suite; no detection-specific tests existed for the removed WebSocket code.

## Concerns

None blocking. Stub intentionally disables server-side detection streaming; expected until Tasks 3–4.
