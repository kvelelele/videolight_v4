# Task 8 Report: End-to-end polish + spec status

**Status:** DONE  
**Date:** 2026-08-26  
**Branch:** ui-tracking  
**Commit:** `7b5cbda chore(lighting): finalize presence lighting MVP`

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

---

## Final lighting branch review fixes (2026-08-26)

**Commit:** `fix(lighting): presence clock, failed-command state, empty-links off, Imperium retries`  
**Status:** DONE

### P1 Presence clock

Client rAF/monotonic `frame.ts` was posted as presence `ts` and forwarded into `ScenarioEngine.ingest_presence`, so heartbeat grace compared Unix `tick()` time against a ~16ms clock.

- `ingest_presence` always uses `time.time()` and ignores the `now=` argument (client ts).
- Router no longer passes `body.ts`.
- `presenceReporter.ts` no longer sends `ts`.
- Tests: engine + API presence with `ts=0.016` / omitted `ts` still treat last_seen as server time (grace holds).

### P1 Failed driver must not flip `desired_on`

`set_manual`, `_apply_driver_on`, and tick `turn_off` only update `desired_on` / clear `off_deadline` when `DriverResult.ok` is True.

- Failed `turn_on` leaves `desired_on` False so presence/manual retries can fire.
- Failed `turn_off` leaves `desired_on` True and keeps `off_deadline` so tick retries.
- Tests use `FakeDriver(on_ok=False)` / `off_ok=False`.

### P2 Empty camera links after presence

Empty `get_camera_ids_for_controller` is treated as known-absent (`_presence_tracked` True) so an on light starts/continues `off_deadline` with `off_delay_sec` (unlinked or all links removed).

### P2 Imperium retries

`test` / `turn_on` / `turn_off` share `_get_response`: 1 try + 2 retries, backoff 0.05s then 0.15s, on HTTP errors and non-200. HTTP 200 with body `"0"` is not retried. MockTransport tests stay green; new flaky-ConnectError test covers recover-on-third-attempt.

### Test output

#### Backend (`cd backend; .venv/Scripts/pytest -v`)

```
============================= test session starts =============================
platform win32 -- Python 3.13.14, pytest-9.1.1, pluggy-1.6.0 -- C:\DevPrj\videolight_v4\backend\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: C:\DevPrj\videolight_v4\backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.14.2, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 32 items

tests/test_driver_factory.py::test_build_driver_returns_spectrum_for_spectrum_type PASSED [  3%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_with_controller_credentials PASSED [  6%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_for_non_spectrum_types PASSED [  9%]
tests/test_imperium_driver.py::test_imperium_test_on_off PASSED          [ 12%]
tests/test_imperium_driver.py::test_imperium_standalone_path_without_injected_client PASSED [ 15%]
tests/test_imperium_driver.py::test_imperium_test_fails_when_body_not_one PASSED [ 18%]
tests/test_imperium_driver.py::test_imperium_retries_http_errors_then_succeeds PASSED [ 21%]
tests/test_lighting_api.py::test_list_controllers_requires_auth PASSED   [ 25%]
tests/test_lighting_api.py::test_list_controllers_requires_admin PASSED  [ 28%]
tests/test_lighting_api.py::test_create_get_patch_delete_controller_hides_password PASSED [ 31%]
tests/test_lighting_api.py::test_put_cameras_replaces_links_and_rejects_unknown PASSED [ 34%]
tests/test_lighting_api.py::test_test_endpoint_persists_status PASSED    [ 37%]
tests/test_lighting_api.py::test_command_sets_light_on PASSED            [ 40%]
tests/test_lighting_api.py::test_command_on_survives_tick_until_manual_off PASSED [ 43%]
tests/test_lighting_api.py::test_delete_forgets_engine_state PASSED      [ 46%]
tests/test_lighting_api.py::test_presence_accepted_for_authenticated_user PASSED [ 50%]
tests/test_lighting_api.py::test_presence_without_or_bogus_ts_uses_server_time_for_grace PASSED [ 53%]
tests/test_lighting_api.py::test_health_still_ok PASSED                  [ 56%]
tests/test_scenario_engine.py::test_or_presence_and_off_delay PASSED     [ 59%]
tests/test_scenario_engine.py::test_second_camera_keeps_light_on PASSED  [ 62%]
tests/test_scenario_engine.py::test_stale_heartbeat_counts_absent PASSED [ 65%]
tests/test_scenario_engine.py::test_presence_without_or_bogus_ts_uses_server_time_for_grace PASSED [ 68%]
tests/test_scenario_engine.py::test_manual_on_survives_tick_without_presence PASSED [ 71%]
tests/test_scenario_engine.py::test_manual_on_then_presence_absence_starts_off_delay PASSED [ 75%]
tests/test_scenario_engine.py::test_forget_controller_drops_state_so_tick_does_not_turn_off PASSED [ 78%]
tests/test_scenario_engine.py::test_tick_skips_get_driver_failure_and_continues PASSED [ 81%]
tests/test_scenario_engine.py::test_failed_turn_on_does_not_set_desired_on_and_retries PASSED [ 84%]
tests/test_scenario_engine.py::test_failed_manual_on_does_not_set_desired_on PASSED [ 87%]
tests/test_scenario_engine.py::test_failed_manual_off_keeps_desired_on PASSED [ 90%]
tests/test_scenario_engine.py::test_failed_tick_turn_off_keeps_desired_on PASSED [ 93%]
tests/test_scenario_engine.py::test_empty_camera_links_starts_off_delay_when_light_on PASSED [ 96%]
tests/test_scenario_engine.py::test_manual_on_with_no_links_eventually_offs PASSED [100%]

============================== warnings summary ===============================
.venv\Lib\site-packages\fastapi\testclient.py:1
  C:\DevPrj\videolight_v4\backend\.venv\Lib\site-packages\fastapi\testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 32 passed, 1 warning in 8.12s ========================
```

#### Frontend (`npm test`)

```
> test
> vitest run

 RUN  v4.1.11 C:/DevPrj/videolight_v4

 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  21:18:10
   Duration  323ms
```

**Counts:** backend 32/32 passed; frontend 13/13 passed.
