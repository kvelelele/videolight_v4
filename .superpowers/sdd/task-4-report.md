# Task 4 Report: Lighting REST API + wire app

## Status

DONE_WITH_CONCERNS

## Summary

Implemented `/api/lighting` REST API (controllers CRUD, camera links, test, command, presence) and wired a singleton `ScenarioEngine` on `app.state.lighting_engine` with `SessionLocal` getters plus a 1s asyncio tick loop. Kept Task 3's getter-based engine API (no snapshot/ingest_presence_with_links).

Commit: `2e43ea4 feat(lighting): expose lighting REST API and engine loop`

## What was implemented

### `backend/app/routers/lighting.py`

- Prefix `/api/lighting`; collection `/controllers`; `POST /presence`
- `_to_out`: `passwordSet=True`, `cameraIds` from links, `lightOn` from `engine.light_on(id)`; password never serialized
- Admin (`require_admin`): list/create/get/patch/delete, PUT cameras, test, command
- Authenticated (`get_current_user`): presence
- PUT `/controllers/{id}/cameras` replaces links; camera IDs validated; `cameraIds` also accepted on create/PATCH
- `POST .../test` → `build_driver(...).test()`, persists `status`/`last_error`
- `POST .../command` → `engine.set_manual`
- `POST /presence` → `engine.ingest_presence` (getters read links from DB)

### `backend/app/main.py`

- `ScenarioEngine` getters open short `SessionLocal()` sessions (same pattern as the brief)
- `app.state.lighting_engine` set in lifespan
- Background `asyncio` task: `await engine.tick()` every 1s; cancelled on shutdown
- Router registered: `app.include_router(lighting.router)`

`backend/app/routers/__init__.py` not needed (namespace import already used for cameras/auth).

## TDD evidence

### RED (routes missing)

```
cd backend
.venv/Scripts/pytest tests/test_lighting_api.py -v
```

Expected: 404 because `/api/lighting/*` was not mounted.

```
FAILED test_list_controllers_requires_auth — assert 404 == 401
FAILED test_list_controllers_requires_admin — assert 404 == 403
FAILED test_create_get_patch_delete_controller_hides_password — assert 404 == 201
FAILED test_put_cameras_replaces_links_and_rejects_unknown — KeyError: 'id'
FAILED test_test_endpoint_persists_status — KeyError: 'id'
FAILED test_command_sets_light_on — KeyError: 'id'
FAILED test_presence_accepted_for_authenticated_user — KeyError: 'id'
PASSED test_health_still_ok
7 failed, 1 passed
```

Failure mode was missing routes (404), not assertion typos.

### GREEN (after router + lifespan)

```
cd backend
.venv/Scripts/pytest tests/test_lighting_api.py -v
```

```
8 passed in 5.75s
```

### Full suite (before commit)

```
cd backend
.venv/Scripts/pytest -v
```

```
17 passed in 5.97s
  test_driver_factory.py          3 passed
  test_imperium_driver.py         3 passed
  test_lighting_api.py            8 passed
  test_scenario_engine.py         3 passed
```

One warning is from FastAPI's TestClient (`starlette.testclient` httpx deprecation), not from production code.

## Files changed

| File | Action |
|------|--------|
| `backend/app/routers/lighting.py` | Created — REST API |
| `backend/app/main.py` | Modified — engine singleton, tick loop, include router |
| `backend/tests/test_lighting_api.py` | Created — API tests (auth, CRUD, password hide, cameras, test, command, presence) |

## Self-review

| Check | Result |
|-------|--------|
| Routes match spec (`/api/lighting/controllers`, `/presence`) | Pass |
| CRUD/test/command admin; presence any authenticated user | Pass |
| `_to_out` sets passwordSet, cameraIds, lightOn; no password | Pass |
| PUT cameras replaces links; unknown camera IDs → 400 | Pass |
| Engine getters match Task 3 callable API | Pass |
| Tick loop ~1s in lifespan | Pass |
| Existing tests still pass | Pass |
| No routers/`__init__.py` required | Pass |
| YAGNI (no extra engine API, no persisted presence rows) | Pass |

## Concerns

1. **In-memory engine state after DELETE.** Fixed in review pass: `DELETE` calls `engine.forget_controller`; `tick` logs/skips a failed `get_driver` and continues other controllers.
2. **Tick loop swallows driver/DB errors.** Fixed in review pass: `_lighting_tick_loop` logs with `logging.getLogger(__name__).exception(...)`.
3. **`passwordSet` is always `True`** per brief, even if password were empty.
4. Getters live in `main.py` (as the brief snippet shows) rather than `app.lighting` package accessor.

## Review fixes

Addressed Critical/Important findings from Task 4 review.

1. **Critical — Manual ON undone by next tick.** Command handler calls `ensure_controller_config` (enabled, off_delay_sec from DB) before `set_manual`. After manual ON, `desired_on=True` and `off_deadline` is cleared. `_recompute_controller` does not start an off timer until a linked camera has reported presence; if no cameras ever reported, manual ON stays on until manual OFF (no `off_deadline=0` auto-off). Presence-driven absence still starts the real `off_delay_sec` timer. PATCH enabled/offDelaySec also syncs engine config.
2. **Important — DELETE leaves engine memory.** `forget_controller` drops runtime state; DELETE calls it. Tick wraps per-controller recompute and `get_driver`/turn_off in try/except, logs, and continues.
3. **Important — Tick loop swallows errors silently.** `_lighting_tick_loop` uses `logger.exception("lighting tick failed")` instead of bare `continue`.

### RED (before fix)

```
cd backend
.venv/Scripts/pytest -v tests/test_scenario_engine.py::test_manual_on_survives_tick_without_presence tests/test_scenario_engine.py::test_manual_on_then_presence_absence_starts_off_delay tests/test_scenario_engine.py::test_forget_controller_drops_state_so_tick_does_not_turn_off tests/test_scenario_engine.py::test_tick_skips_get_driver_failure_and_continues tests/test_lighting_api.py::test_command_on_survives_tick_until_manual_off tests/test_lighting_api.py::test_delete_forgets_engine_state
```

```
FAILED test_manual_on_survives_tick_without_presence — AttributeError: ensure_controller_config
FAILED test_manual_on_then_presence_absence_starts_off_delay — AttributeError: ensure_controller_config
FAILED test_forget_controller_drops_state_so_tick_does_not_turn_off — AttributeError: forget_controller
FAILED test_tick_skips_get_driver_failure_and_continues — KeyError: 'bad'
FAILED test_command_on_survives_tick_until_manual_off — assert False is True (lightOn after tick)
FAILED test_delete_forgets_engine_state — assert True is False (light_on after DELETE)
6 failed, 1 warning in 2.55s
```

### GREEN (after fix)

```
cd backend
.venv/Scripts/pytest -v
```

```
============================= test session starts =============================
platform win32 -- Python 3.13.14, pytest-9.1.1, pluggy-1.6.0 -- C:\DevPrj\videolight_v4\backend\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: C:\DevPrj\videolight_v4\backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.14.2, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 23 items

tests/test_driver_factory.py::test_build_driver_returns_spectrum_for_spectrum_type PASSED [  4%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_with_controller_credentials PASSED [  8%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_for_non_spectrum_types PASSED [ 13%]
tests/test_imperium_driver.py::test_imperium_test_on_off PASSED          [ 17%]
tests/test_imperium_driver.py::test_imperium_standalone_path_without_injected_client PASSED [ 21%]
tests/test_imperium_driver.py::test_imperium_test_fails_when_body_not_one PASSED [ 26%]
tests/test_lighting_api.py::test_list_controllers_requires_auth PASSED   [ 30%]
tests/test_lighting_api.py::test_list_controllers_requires_admin PASSED  [ 34%]
tests/test_lighting_api.py::test_create_get_patch_delete_controller_hides_password PASSED [ 39%]
tests/test_lighting_api.py::test_put_cameras_replaces_links_and_rejects_unknown PASSED [ 43%]
tests/test_lighting_api.py::test_test_endpoint_persists_status PASSED    [ 47%]
tests/test_lighting_api.py::test_command_sets_light_on PASSED            [ 52%]
tests/test_lighting_api.py::test_command_on_survives_tick_until_manual_off PASSED [ 56%]
tests/test_lighting_api.py::test_delete_forgets_engine_state PASSED      [ 60%]
tests/test_lighting_api.py::test_presence_accepted_for_authenticated_user PASSED [ 65%]
tests/test_lighting_api.py::test_health_still_ok PASSED                  [ 69%]
tests/test_scenario_engine.py::test_or_presence_and_off_delay PASSED     [ 73%]
tests/test_scenario_engine.py::test_second_camera_keeps_light_on PASSED  [ 78%]
tests/test_scenario_engine.py::test_stale_heartbeat_counts_absent PASSED [ 82%]
tests/test_scenario_engine.py::test_manual_on_survives_tick_without_presence PASSED [ 86%]
tests/test_scenario_engine.py::test_manual_on_then_presence_absence_starts_off_delay PASSED [ 91%]
tests/test_scenario_engine.py::test_forget_controller_drops_state_so_tick_does_not_turn_off PASSED [ 95%]
tests/test_scenario_engine.py::test_tick_skips_get_driver_failure_and_continues PASSED [100%]

============================== warnings summary ===============================
.venv\Lib\site-packages\fastapi\testclient.py:1
  C:\DevPrj\videolight_v4\backend\.venv\Lib\site-packages\fastapi\testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 23 passed, 1 warning in 7.16s ========================
```

One warning is from FastAPI's TestClient (`starlette.testclient` httpx deprecation), not from production code.

Commit: `fix(lighting): sync engine state with command/delete and tick errors`
