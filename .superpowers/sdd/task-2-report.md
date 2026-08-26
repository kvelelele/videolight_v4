# Task 2 Report: ImperiumDriver + factory (TDD)

## Status: DONE

## Summary

Implemented HTTP lighting drivers (Imperium real, Spectrum stub) and factory with pytest TDD. All brief-specified files created; 2/2 tests pass.

## Files Created/Modified

| File | Action |
|------|--------|
| `backend/app/lighting/__init__.py` | Created (empty) |
| `backend/app/lighting/drivers/__init__.py` | Created (empty) |
| `backend/app/lighting/drivers/base.py` | Created — `DriverResult`, `LightingDriver` Protocol |
| `backend/app/lighting/drivers/imperium.py` | Created — `ImperiumDriver` with Basic auth + DALI API |
| `backend/app/lighting/drivers/spectrum.py` | Created — stub returning `ok=False`, `status="error"` |
| `backend/app/lighting/drivers/factory.py` | Created — `build_driver(controller)` |
| `backend/tests/conftest.py` | Created (empty) |
| `backend/tests/test_imperium_driver.py` | Created — verbatim from brief |
| `backend/requirements.txt` | Modified — added pytest, pytest-asyncio |
| `backend/pytest.ini` | Created — asyncio_mode=auto, pythonpath=. |

## TDD Evidence

### RED — Step 3 (expect fail: module not found)

```bash
cd backend
.venv/Scripts/pip install pytest pytest-asyncio
.venv/Scripts/pytest tests/test_imperium_driver.py -v
```

```
ERROR collecting tests/test_imperium_driver.py
ImportError while importing test module ...
    from app.lighting.drivers.imperium import ImperiumDriver
E   ModuleNotFoundError: No module named 'app.lighting'
=========================== short test summary info ===========================
ERROR tests/test_imperium_driver.py
!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
```

### GREEN — Step 5 (expect pass)

```bash
cd backend
.venv/Scripts/pytest tests/test_imperium_driver.py -v
```

```
tests/test_imperium_driver.py::test_imperium_test_on_off PASSED          [ 50%]
tests/test_imperium_driver.py::test_imperium_test_fails_when_body_not_one PASSED [100%]

============================== 2 passed in 0.11s ==============================
```

## Commit

```
bd6d683 feat(lighting): add Imperium driver and factory
```

## Self-Review

- Tests match brief verbatim; mock transport validates Basic auth and DALI params.
- `ImperiumDriver` handles injected client (relative paths) vs standalone (full URL via `_get`).
- `SpectrumDriver` stub and `build_driver` factory implemented per spec.
- No ScenarioEngine or API changes (out of scope).

## Concerns

None.

## Review Fix (factory + standalone coverage)

### Changes

- Added `backend/tests/test_driver_factory.py` — `build_driver` returns `SpectrumDriver` for `type="spectrum"`, `ImperiumDriver` for `imperium` and other types with host/port/username/password passed through (via `SimpleNamespace` fake controller).
- Added `test_imperium_standalone_path_without_injected_client` in `test_imperium_driver.py` — exercises `client=None` standalone path by monkeypatching `httpx.AsyncClient` to inject `MockTransport` (avoids recursion by calling saved original constructor).

### Verification

```bash
cd backend
.venv/Scripts/pytest tests/test_imperium_driver.py tests/test_driver_factory.py -v
```

```
tests/test_imperium_driver.py::test_imperium_test_on_off PASSED          [ 16%]
tests/test_imperium_driver.py::test_imperium_standalone_path_without_injected_client PASSED [ 33%]
tests/test_imperium_driver.py::test_imperium_test_fails_when_body_not_one PASSED [ 50%]
tests/test_driver_factory.py::test_build_driver_returns_spectrum_for_spectrum_type PASSED [ 66%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_with_controller_credentials PASSED [ 83%]
tests/test_driver_factory.py::test_build_driver_returns_imperium_for_non_spectrum_types PASSED [100%]

============================== 6 passed in 0.22s ==============================
```
