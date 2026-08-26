# Task 8 Report: End-to-end polish + spec status

**Status:** DONE  
**Date:** 2026-08-26  
**Branch:** ui-tracking  
**Commit:** `502db9c chore(lighting): finalize presence lighting MVP`

## Summary

Full automated suites pass (backend 23/23, frontend 13/13). No alias/path mismatches found — frontend `/api/lighting/*` paths align with `backend/app/routers/lighting.py`; `offDelaySec` ↔ `off_delay_sec` aliases consistent in schemas, router, and client. Design spec status updated to **Implemented**.

## Test output

### Backend (`backend/.venv/Scripts/pytest -v`)

```
23 passed in 8.14s
```

Modules: `test_driver_factory`, `test_imperium_driver`, `test_lighting_api`, `test_scenario_engine`.

### Frontend (`npm test`)

```
Test Files  3 passed (3)
Tests  13 passed (13)
```

Modules: `presence.test.ts`, plus existing Vitest suites.

## Alias / path consistency

| Item | Frontend | Backend | Match |
|------|----------|---------|-------|
| Router prefix | `/api/lighting` | `prefix="/api/lighting"` | ✓ |
| Controllers | `/api/lighting/controllers` | `@router.get/post("/controllers")` | ✓ |
| Presence | `POST /api/lighting/presence` | `@router.post("/presence")` | ✓ |
| Off delay field | `offDelaySec` | `off_delay_sec` via Pydantic aliases + `field_map` on PATCH | ✓ |
| Camera links | `cameraIds` | `camera_ids` / `CameraIdsBody` | ✓ |

No fixes required.

## Manual checklist

### Verifiable without Imperium hardware

| # | Check | How to verify | Result |
|---|-------|---------------|--------|
| 1a | Admin adds controller (IP) | Settings → Освещение tab; Add controller modal (name, host, port, credentials, offDelaySec, camera checkboxes) | **Pass** (UI + API CRUD tests) |
| 1b | Проверить → status message | `POST .../test` persists `online`/`offline`/`error`; UI shows status column | **Pass** (mocked driver in `test_test_endpoint_persists_status`; UI in `LightingSettingsPanel`) |
| 2a | Вкл / Выкл via API | `POST .../command` `{action: on\|off}` sets `lightOn` | **Pass** (`test_command_sets_light_on`, manual-on survives tick) |
| 3a | Link camera to controller | `PUT .../cameras` replaces links; modal checkboxes | **Pass** (`test_put_cameras_replaces_links_and_rejects_unknown`) |
| 3b | Presence POST accepted | `POST /api/lighting/presence` with auth | **Pass** (`test_presence_accepted_for_authenticated_user`) |
| 3c | Client presence from tracks | `usePresenceReporter` in `CameraStreamPlayer` when analytics enabled; person/car → present | **Pass** (Task 7 + `presence.test.ts`) |
| 3d | Engine turns light on on presence | ScenarioEngine OR + driver mock | **Pass** (`test_or_presence_and_off_delay`) |
| 4a | Off delay after absence | Engine starts `off_deadline = now + off_delay_sec` | **Pass** (`test_or_presence_and_off_delay`, `test_stale_heartbeat_counts_absent`) |
| 4b | Heartbeat grace 20s | `HEARTBEAT_GRACE_SEC = 20`; stale heartbeat counts absent | **Pass** (`test_stale_heartbeat_counts_absent`) |
| 4c | Tab closed grace | Client sends best-effort `present: false` on unmount/disable | **Pass** (code review; best-effort, not hardware-tested) |
| 5 | Two cameras, one controller: OR | Second camera keeps light on | **Pass** (`test_second_camera_keeps_light_on`) |
| — | Password not returned | `passwordSet` flag, no password in JSON | **Pass** (`test_create_get_patch_delete_controller_hides_password`) |
| — | Settings tabs | Cameras + Lighting tabs in `SettingsPage` | **Pass** (code review) |

### Requires real Imperium device (or LAN mock)

| # | Check | Why hardware needed |
|---|-------|---------------------|
| 1 | Проверить against real IP | HTTP reachability + Imperium auth/body semantics on physical controller |
| 2 | Вкл / Выкл physical light | DALI command must reach real fixture |
| 3 | Live view person/car → light on | End-to-end: browser MediaPipe → presence POST → engine tick → Imperium HTTP → fixture |
| 4 | Empty frame > offDelaySec → light off | Requires observing physical off after delay |
| 5 | Two cameras OR with real fixtures | Same as above with two live streams |

## Spec coverage (final)

| Spec item | Status |
|-----------|--------|
| Unified LightingController entity | Implemented (Task 1) |
| M2M camera links | Implemented (Tasks 1, 4, 6) |
| Imperium driver + auth + endpoints | Implemented (Task 2) |
| Spectrum stub / same entity | Implemented (Tasks 2, 6) |
| ScenarioEngine OR + off delay | Implemented (Task 3) |
| Heartbeat grace 20s | Implemented (Tasks 3, 7) |
| REST API + presence | Implemented (Tasks 4, 5) |
| Settings tabs + modal + test/on/off | Implemented (Task 6) |
| Client presence from tracks | Implemented (Task 7) |
| Password not returned | Implemented (Tasks 1, 4) |
| No server 24/7 detection | Documented non-goal |

Design spec `docs/superpowers/specs/2026-08-26-lighting-control-design.md` → **Status: Implemented**.

## Concerns

- End-to-end with physical Imperium not exercised in CI; only mocked drivers.
- Unmount/disable `present: false` is best-effort (network errors swallowed).
- Live “Свет: присутствие” chip intentionally skipped (YAGNI).
- Spectrum driver is stub only; UI shows type but Spectrum option may be disabled.
