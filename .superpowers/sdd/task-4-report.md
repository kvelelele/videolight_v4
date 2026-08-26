# Task 4 Report: Client analytics hook and player wiring

## Status

Implemented and committed as
`bcd263a feat: run client MediaPipe analytics in CameraStreamPlayer`.

## Changes

- Added `useClientAnalytics(mediaRef, cameraId, enabled)` with worker lifecycle,
  model readiness state, camera resets, one-frame backpressure, and 12 FPS
  capture throttling.
- Added safe frame capture with transferable `ImageBitmap` messages. Capture
  failures surface through `error` and stop analytics without affecting stream
  playback.
- Wired `CameraStreamPlayer` to the client hook after selecting its media ref.
- Added loading, error, and ready detection-count badge states.
- Removed the temporary `useDetections` stub from `detections.ts`.

## Verification evidence

- `npm run build`: passed; Vite bundled
  `dist/assets/analyticsWorker-DqExiPie.js`.
- `npm test`: passed, 1 test file and 4 tests.
- `npx tsc --noEmit`: passed.
- IDE diagnostics for all three changed source files: no errors.

## Concerns

- Vite retains the existing warning that the main JavaScript chunk exceeds
  500 kB after minification.
- Live model/WASM download, camera CORS behavior, and detection output require
  browser testing against an available camera stream.

## Review fixes

- Decoupled the worker lifecycle from `enabled`: the worker initializes once,
  remains warm while capture is disabled, and terminates only on unmount.
- Camera changes now reset tracker state without reloading the model. Generation
  tags prevent results and detection errors from older capture epochs from
  updating the current overlay.
- Capture backpressure is reserved before `createImageBitmap`; capture failures
  release it and clear the overlay. Worker and detector errors also clear the
  overlay.

## Review fix verification

- `npm test`: passed, 1 test file and 4 tests.
- `npm run build`: passed; Vite bundled
  `dist/assets/analyticsWorker-DU3tBzMS.js`.
- IDE diagnostics for `clientAnalytics.ts` and `analyticsWorker.ts`: no errors.
- Vite retained the existing main-chunk size warning.
