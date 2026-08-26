# Task 3 Report: Analytics worker (MediaPipe + tracker)

## Status

Implemented the analytics worker and added `@mediapipe/tasks-vision` 1.0.1. No
CameraStreamPlayer or hook/UI wiring was changed.

Commit: `738b232 feat: add MediaPipe analytics worker with client tracking`

## Changes

- Added `src/workers/analyticsWorker.ts` with the requested `init`, `reset`, and
  transferable `frame` message protocol.
- Configured EfficientDet-Lite0 in `VIDEO` mode and used `detectForVideo`.
- Kept the `person`, `car`, `bus`, and `truck` category allowlist; mapped buses
  and trucks to the application's `car` class.
- Added GPU initialization with a single CPU fallback.
- Fed detections through the existing `SortTracker` and emitted
  `DetectionFrame` results.
- Closed every accepted or dropped `ImageBitmap` and dropped frames while the
  detector is busy or unavailable.
- Kept the Vite ESM worker implementation because Vite successfully bundled
  the worker and MediaPipe dependency as an ESM entry.

## Verification evidence

- `npm test`: passed, 1 test file and 4 tests.
- `npm run build`: passed with Vite 8.2.2; the existing bundle-size warning
  remains.
- Worker-only TypeScript check passed:
  `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib "ES2022,DOM,DOM.Iterable,WebWorker" --strict --skipLibCheck src/workers/analyticsWorker.ts`.
- Vite ESM worker bundle smoke check passed:
  `node --input-type=module -e "import { build } from 'vite'; await build({ configFile: false, build: { write: false, lib: { entry: 'src/workers/analyticsWorker.ts', formats: ['es'] } } });"`.
- IDE diagnostics for `src/workers/analyticsWorker.ts`: no errors.

## Concern

The requested full-project `npx tsc --noEmit` currently exits with code 2 due
to the pre-existing error
`src/components/CameraStreamPlayer.tsx(214,49): TS2339: Property 'tracks' does
not exist on type 'never'`. The new worker passes an isolated strict TypeScript
check, and fixing or wiring CameraStreamPlayer is outside Task 3.

Runtime model/WASM download and live category results cannot be exercised until
Task 4 creates and feeds the worker. If the model's category allowlist produces
empty live results, Task 4 validation should remove the allowlist and continue
filtering through `CLASS_MAP`, per the brief.
