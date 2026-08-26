# Task 1 Report: Vitest + SORT-like tracker

## What was implemented

- Added **Vitest** (`vitest@^4.1.11`) as a dev dependency with `test` and `test:watch` npm scripts.
- Configured Vitest in `vite.config.ts` (node environment, `src/**/*.test.ts` include pattern).
- Created **`SortTracker`** — a pure TypeScript SORT-like multi-object tracker in `src/lib/tracker.ts`:
  - IoU-based greedy assignment
  - Constant-velocity prediction on bbox center + size
  - Configurable `iouThreshold`, `maxAgeMs`, `minHits`
  - `reset()` clears active tracks and timestamp state
- Added 4 unit tests in `src/lib/tracker.test.ts` covering stable IDs, minHits gating, maxAge expiry, and reset behavior.

**Not changed:** `tsconfig.json` — per resolution, explicit `import { describe, it, expect } from 'vitest'` used instead of `types: ["vitest/globals"]`.

## TDD evidence

### RED (Step 3)

**Command:**
```bash
npm test
```

**Output:**
```
 FAIL  src/lib/tracker.test.ts [ src/lib/tracker.test.ts ]
Error: Cannot find module './tracker' imported from C:/DevPrj/videolight_v4/src/lib/tracker.test.ts
 ❯ src/lib/tracker.test.ts:2:1
      1| import { describe, expect, it } from 'vitest';
      2| import { SortTracker } from './tracker';
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

Tests could not run because `tracker.ts` did not exist yet — expected RED.

### GREEN (Step 5)

**Command:**
```bash
npm test
```

**Output:**
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  294ms
```

All 4 tracker tests pass.

## Files changed

| File | Action |
|------|--------|
| `package.json` | Modified — added vitest dep + test scripts |
| `package-lock.json` | Modified — lockfile update |
| `vite.config.ts` | Modified — vitest config block |
| `src/lib/tracker.ts` | Created — SortTracker implementation |
| `src/lib/tracker.test.ts` | Created — 4 unit tests |

## Self-review

1. **Single filter applied** — return uses one `tr.hits >= this.minHits` filter (not the redundant double-filter from the plan snippet).
2. **BBox copies** — returned bboxes use `[...tr.bbox] as TrackBBox` to avoid aliasing internal state.
3. **reset() deviation** — plan snippet resets `nextId = 1`, but the verbatim test `reset clears ids` requires the post-reset track ID to differ from the pre-reset ID. Implemented reset clears `tracks` and `lastTs` only, leaving `nextId` monotonic. This matches test intent ("clears ids" = fresh assignment, not counter rewind).
4. **No globals** — tests import explicitly from `vitest`; no tsconfig types pollution.
5. **Scope** — no MediaPipe worker, React hook, or UI integration (deferred to later tasks as specified).

## Concerns

1. **Plan vs test inconsistency on `reset()`** — brief implementation sets `nextId = 1` on reset, but the acceptance test fails with that behavior. Current implementation follows the test; downstream consumers should not assume IDs restart at 1 after reset.
2. **Greedy IoU matching** — not optimal assignment (Hungarian); acceptable for MVP but may swap IDs when tracks cross closely.
3. **No class-aware matching** — tracks match purely on IoU; different-class overlap could cause ID handoff (unlikely in typical person/car scenes with non-overlapping classes).

## Review fix (Important findings)

**Changes:**
1. Added one-line JSDoc on `SortTracker.reset()` documenting that track IDs stay monotonic (`nextId` is not reset to 1).
2. Defensive-copy detection bboxes when storing into internal tracks on IoU match and on new track spawn (`[...det.bbox] as TrackBBox`), so caller mutations to `det.bbox` cannot corrupt tracker state. Return path already copied bboxes.

**Command:**
```bash
npm test
```

**Output:**
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  360ms
```

All 4 tracker tests pass after review fixes.
