# Lighting Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add presence-based lighting automation: browser reports person/car presence → backend ScenarioEngine (OR + off-delay) → STAR Imperium-1 over HTTP, with a unified controller model ready for Spectrum/DMX.

**Architecture:** One `LightingController` entity (`type: imperium | spectrum`) + `CameraControllerLink` M2M. `LightingDriver` interface with `ImperiumDriver` (MVP) and `SpectrumDriver` stub. In-memory `ScenarioEngine` owns OR logic and off timers. Client sends presence edges + heartbeats from MediaPipe tracks.

**Tech Stack:** FastAPI, SQLAlchemy, httpx, pytest; React 19, TypeScript, existing `api()` helper, Vitest only if adding pure TS helpers.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-lighting-control-design.md`
- Presence = class `person` or `car`, **not** motion
- Multi-camera rule: **OR** across linked cameras
- Off delay: per controller, default **60** seconds
- Heartbeat grace: **20** seconds without update → camera treated absent
- Imperium defaults: port `90`, user `TRION`, password `TRION1`
- Imperium endpoints: `/api_dali/is`, on `param=10`, off `param=0` (channel=1, ID=65, d_send=1)
- Password never returned in API (`passwordSet: boolean`)
- CRUD/test/command: admin; presence: any authenticated user
- Browser must not call controller IPs directly
- Spectrum: same entity + stub driver; UI type disabled labeled «скоро»
- Commits: frequent, one logical change per task

## File structure

| Path | Responsibility |
|------|----------------|
| `backend/app/models.py` | `LightingController`, `CameraControllerLink` |
| `backend/app/schemas.py` | Lighting Pydantic schemas |
| `backend/app/lighting/__init__.py` | Package export / engine accessor |
| `backend/app/lighting/drivers/base.py` | `LightingDriver` Protocol + result types |
| `backend/app/lighting/drivers/imperium.py` | Imperium HTTP driver |
| `backend/app/lighting/drivers/spectrum.py` | Stub driver |
| `backend/app/lighting/drivers/factory.py` | `build_driver(controller) -> LightingDriver` |
| `backend/app/lighting/engine.py` | `ScenarioEngine` presence OR + timers |
| `backend/app/routers/lighting.py` | REST API |
| `backend/app/main.py` | Mount router; engine on `app.state` |
| `backend/requirements.txt` | Add pytest (+ pytest-asyncio) |
| `backend/tests/test_imperium_driver.py` | Driver unit tests |
| `backend/tests/test_scenario_engine.py` | Engine unit tests |
| `src/lib/lighting.ts` | Types + API client |
| `src/lib/presenceReporter.ts` | Edge + heartbeat presence posts |
| `src/lib/presenceReporter.test.ts` | Pure helper tests (present from tracks) |
| `src/components/LightingSettingsPanel.tsx` | Controllers list UI |
| `src/components/ControllerModal.tsx` | Add/edit controller form |
| `src/components/SettingsPage.tsx` | Tabs Камеры / Освещение |
| `src/components/CameraStreamPlayer.tsx` | Wire presence reporter + optional chip |

---

### Task 1: Models + schemas

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: existing `Base`, `new_id`, `_utcnow`, `Camera`
- Produces:
  - `LightingController` ORM
  - `CameraControllerLink` ORM
  - Schemas: `LightingControllerOut`, `LightingControllerCreate`, `LightingControllerUpdate`, `LightingCommandRequest`, `PresenceEvent`, `LightingTestResponse`

- [ ] **Step 1: Add ORM models**

Append to `backend/app/models.py` (keep existing imports; add `ForeignKey`, `UniqueConstraint`, `relationship` as needed):

```python
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class LightingController(Base):
    __tablename__ = "lighting_controllers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="imperium")
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    username: Mapped[str] = mapped_column(String(255), nullable=False, default="TRION")
    password: Mapped[str] = mapped_column(String(255), nullable=False, default="TRION1")
    off_delay_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    last_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    camera_links: Mapped[list["CameraControllerLink"]] = relationship(
        back_populates="controller", cascade="all, delete-orphan"
    )


class CameraControllerLink(Base):
    __tablename__ = "camera_controller_links"
    __table_args__ = (UniqueConstraint("camera_id", "controller_id", name="uq_camera_controller"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    controller_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lighting_controllers.id", ondelete="CASCADE"), nullable=False
    )

    controller: Mapped["LightingController"] = relationship(back_populates="camera_links")
```

For `enabled` boolean on SQLite with SQLAlchemy 2, use:

```python
from sqlalchemy import Boolean
enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

- [ ] **Step 2: Add Pydantic schemas**

Append to `backend/app/schemas.py`:

```python
ControllerType = Literal["imperium", "spectrum"]
ControllerStatus = Literal["unknown", "online", "offline", "error"]


class LightingControllerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    type: ControllerType
    host: str
    port: int
    username: str
    passwordSet: bool = True
    offDelaySec: int = Field(validation_alias="off_delay_sec", serialization_alias="offDelaySec")
    enabled: bool
    status: ControllerStatus
    lastError: str | None = Field(default=None, validation_alias="last_error", serialization_alias="lastError")
    cameraIds: list[str] = Field(default_factory=list, serialization_alias="cameraIds")
    lightOn: bool = False


class LightingControllerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ControllerType = "imperium"
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=90, ge=1, le=65535)
    username: str = "TRION"
    password: str = "TRION1"
    offDelaySec: int = Field(default=60, ge=1, le=3600)
    enabled: bool = True
    cameraIds: list[str] = Field(default_factory=list)


class LightingControllerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ControllerType | None = None
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = None
    password: str | None = None
    offDelaySec: int | None = Field(default=None, ge=1, le=3600)
    enabled: bool | None = None
    cameraIds: list[str] | None = None


class LightingCommandRequest(BaseModel):
    action: Literal["on", "off"]


class PresenceEvent(BaseModel):
    cameraId: str
    present: bool
    classes: list[str] = Field(default_factory=list)
    ts: float | None = None


class LightingTestResponse(BaseModel):
    success: bool
    message: str
    status: ControllerStatus
```

Use `model_config` / aliases consistently with `CameraOut` (camelCase for JSON). When mapping ORM → Out in the router (Task 4), set `passwordSet=True`, `cameraIds`, `lightOn` explicitly rather than relying on ORM attributes for those three.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat(lighting): add controller models and schemas"
```

---

### Task 2: ImperiumDriver + factory (TDD)

**Files:**
- Create: `backend/app/lighting/__init__.py`
- Create: `backend/app/lighting/drivers/__init__.py`
- Create: `backend/app/lighting/drivers/base.py`
- Create: `backend/app/lighting/drivers/imperium.py`
- Create: `backend/app/lighting/drivers/spectrum.py`
- Create: `backend/app/lighting/drivers/factory.py`
- Create: `backend/tests/test_imperium_driver.py`
- Create: `backend/tests/conftest.py` (empty or path setup)
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: none from Task 1 at runtime (credentials passed as plain args)
- Produces:
  - `DriverResult` dataclass: `ok: bool`, `status: str`, `message: str`
  - `class LightingDriver(Protocol): async def test(self) -> DriverResult; async def turn_on(self) -> DriverResult; async def turn_off(self) -> DriverResult`
  - `class ImperiumDriver: __init__(host, port, username, password, *, client: httpx.AsyncClient | None = None, timeout: float = 5.0)`
  - `class SpectrumDriver` — stub returning `ok=False`, `status="error"`, message about not implemented
  - `def build_driver(controller) -> LightingDriver`

- [ ] **Step 1: Add test deps**

Append to `backend/requirements.txt`:

```
pytest==8.4.1
pytest-asyncio==1.0.0
```

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
pythonpath = .
testpaths = tests
```

- [ ] **Step 2: Write failing Imperium driver tests**

`backend/tests/test_imperium_driver.py`:

```python
import httpx
import pytest

from app.lighting.drivers.imperium import ImperiumDriver


def _handler(request: httpx.Request) -> httpx.Response:
    auth = request.headers.get("Authorization", "")
    assert auth.startswith("Basic ")
    path = request.url.path
    if path.endswith("/api_dali/is"):
        return httpx.Response(200, text="1")
    if path.endswith("/api_dali/dali_command"):
        params = dict(request.url.params)
        assert params["channel"] == "1"
        assert params["ID"] == "65"
        assert params["d_send"] == "1"
        assert params["param"] in {"0", "10"}
        return httpx.Response(200, text="ok")
    return httpx.Response(404)


@pytest.mark.asyncio
async def test_imperium_test_on_off():
    transport = httpx.MockTransport(_handler)
    async with httpx.AsyncClient(transport=transport, base_url="http://192.168.1.10:90") as client:
        driver = ImperiumDriver("192.168.1.10", 90, "TRION", "TRION1", client=client)
        assert (await driver.test()).ok is True
        assert (await driver.turn_on()).ok is True
        assert (await driver.turn_off()).ok is True


@pytest.mark.asyncio
async def test_imperium_test_fails_when_body_not_one():
    def bad(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="0")

    transport = httpx.MockTransport(bad)
    async with httpx.AsyncClient(transport=transport, base_url="http://x:90") as client:
        driver = ImperiumDriver("x", 90, "TRION", "TRION1", client=client)
        result = await driver.test()
        assert result.ok is False
        assert result.status == "offline"
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd backend
.venv/Scripts/pip install pytest pytest-asyncio
.venv/Scripts/pytest tests/test_imperium_driver.py -v
```

Expected: FAIL (module not found)

- [ ] **Step 4: Implement drivers**

`backend/app/lighting/drivers/base.py`:

```python
from dataclasses import dataclass
from typing import Protocol


@dataclass
class DriverResult:
    ok: bool
    status: str  # online | offline | error
    message: str = ""


class LightingDriver(Protocol):
    async def test(self) -> DriverResult: ...
    async def turn_on(self) -> DriverResult: ...
    async def turn_off(self) -> DriverResult: ...
```

`backend/app/lighting/drivers/imperium.py`:

```python
import base64

import httpx

from app.lighting.drivers.base import DriverResult


class ImperiumDriver:
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        *,
        client: httpx.AsyncClient | None = None,
        timeout: float = 5.0,
    ) -> None:
        self._base = f"http://{host}:{port}"
        self._auth = base64.b64encode(f"{username}:{password}".encode()).decode()
        self._client = client
        self._timeout = timeout
        self._owns_client = client is None

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Basic {self._auth}"}

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        if self._client is not None:
            return await self._client.get(path, params=params, headers=self._headers())
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.get(f"{self._base}{path}", params=params, headers=self._headers())

    async def test(self) -> DriverResult:
        try:
            # When using injected client, path is relative to base_url
            path = "/api_dali/is" if self._client is not None else "/api_dali/is"
            if self._client is None:
                resp = await self._get("/api_dali/is")
            else:
                resp = await self._client.get("/api_dali/is", headers=self._headers())
            if resp.status_code == 200 and resp.text.strip() == "1":
                return DriverResult(True, "online", "ok")
            return DriverResult(False, "offline", f"unexpected response: {resp.status_code} {resp.text!r}")
        except httpx.HTTPError as exc:
            return DriverResult(False, "offline", str(exc))

    async def turn_on(self) -> DriverResult:
        return await self._command("10")

    async def turn_off(self) -> DriverResult:
        return await self._command("0")

    async def _command(self, param: str) -> DriverResult:
        params = {"channel": "1", "ID": "65", "d_send": "1", "param": param}
        try:
            if self._client is not None:
                resp = await self._client.get(
                    "/api_dali/dali_command", params=params, headers=self._headers()
                )
            else:
                resp = await self._get("/api_dali/dali_command", params)
            if resp.status_code == 200:
                return DriverResult(True, "online", "ok")
            return DriverResult(False, "error", f"HTTP {resp.status_code}")
        except httpx.HTTPError as exc:
            return DriverResult(False, "error", str(exc))
```

Simplify `_get` during implementation so injected-client and standalone paths are consistent (tests inject client with `base_url`).

`spectrum.py` stub:

```python
from app.lighting.drivers.base import DriverResult


class SpectrumDriver:
    async def test(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")

    async def turn_on(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")

    async def turn_off(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")
```

`factory.py`:

```python
from app.lighting.drivers.base import LightingDriver
from app.lighting.drivers.imperium import ImperiumDriver
from app.lighting.drivers.spectrum import SpectrumDriver


def build_driver(controller) -> LightingDriver:
    if controller.type == "spectrum":
        return SpectrumDriver()
    return ImperiumDriver(
        controller.host,
        controller.port,
        controller.username,
        controller.password,
    )
```

Empty `__init__.py` files for packages.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
.venv/Scripts/pytest tests/test_imperium_driver.py -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/lighting backend/tests backend/requirements.txt backend/pytest.ini
git commit -m "feat(lighting): add Imperium driver and factory"
```

---

### Task 3: ScenarioEngine (TDD)

**Files:**
- Create: `backend/app/lighting/engine.py`
- Create: `backend/tests/test_scenario_engine.py`

**Interfaces:**
- Consumes: `LightingDriver` Protocol / `DriverResult`; caller supplies link lookup + driver factory via injected callables
- Produces:
  - `HEARTBEAT_GRACE_SEC = 20`
  - `class ScenarioEngine:`
    - `async def ingest_presence(self, camera_id: str, present: bool, *, now: float | None = None) -> None`
    - `async def set_manual(self, controller_id: str, on: bool) -> DriverResult` (uses injected driver)
    - `def light_on(self, controller_id: str) -> bool`
    - `async def tick(self, now: float | None = None) -> None` — advance timers / expire heartbeats (tests call this; production may call from a loop or from ingest)

Keep the engine **pure of SQLAlchemy**: inject:

```python
ControllerView = ...  # id, enabled, off_delay_sec
# get_controllers_for_camera(camera_id) -> list[ControllerView]
# get_camera_ids_for_controller(controller_id) -> list[str]
# get_driver(controller_id) -> LightingDriver
```

- [ ] **Step 1: Write failing engine tests**

```python
import pytest

from app.lighting.drivers.base import DriverResult
from app.lighting.engine import ScenarioEngine


class FakeDriver:
    def __init__(self):
        self.commands: list[str] = []

    async def test(self) -> DriverResult:
        return DriverResult(True, "online")

    async def turn_on(self) -> DriverResult:
        self.commands.append("on")
        return DriverResult(True, "online")

    async def turn_off(self) -> DriverResult:
        self.commands.append("off")
        return DriverResult(True, "online")


@pytest.mark.asyncio
async def test_or_presence_and_off_delay():
    driver = FakeDriver()
    # controller c1 linked to cam-a and cam-b, delay 60
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ] if cam in {"cam-a", "cam-b"} else [],
        get_camera_ids_for_controller=lambda cid: ["cam-a", "cam-b"] if cid == "c1" else [],
        get_driver=lambda cid: driver,
    )

    await engine.ingest_presence("cam-a", True, now=1000.0)
    assert driver.commands == ["on"]
    assert engine.light_on("c1") is True

    await engine.ingest_presence("cam-a", False, now=1001.0)
    # cam-b never present → start off timer; still on until delay
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 59)
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 60)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_second_camera_keeps_light_on():
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a", "cam-b"],
        get_driver=lambda cid: driver,
    )
    await engine.ingest_presence("cam-a", True, now=1000.0)
    await engine.ingest_presence("cam-b", True, now=1001.0)
    await engine.ingest_presence("cam-a", False, now=1002.0)
    await engine.tick(now=1002.0 + 120)
    assert driver.commands == ["on"]  # still on via cam-b
    assert engine.light_on("c1") is True


@pytest.mark.asyncio
async def test_stale_heartbeat_counts_absent():
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 10}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    await engine.ingest_presence("cam-a", True, now=1000.0)
    # no heartbeat for 21s → absent, then off after 10s delay
    await engine.tick(now=1021.0)
    await engine.tick(now=1031.0)
    assert driver.commands == ["on", "off"]
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend
.venv/Scripts/pytest tests/test_scenario_engine.py -v
```

Expected: FAIL (import)

- [ ] **Step 3: Implement `ScenarioEngine`**

Core logic in `backend/app/lighting/engine.py`:

- Per camera: `{present: bool, last_seen: float}`
- Per controller: `{desired_on: bool, off_deadline: float | None}`
- `effective_present(camera, now)` = present and `(now - last_seen) <= HEARTBEAT_GRACE_SEC`
- On ingest: update camera state; for each linked controller recompute OR; if OR and not on → `turn_on`; if not OR → set `off_deadline = now + off_delay_sec` if unset; if OR → clear deadline and ensure on
- `tick(now)`: expire heartbeats (recompute), fire offs when `now >= off_deadline`
- Idempotent: do not call `turn_on` if already `desired_on`

- [ ] **Step 4: Run — expect pass**

```bash
cd backend
.venv/Scripts/pytest tests/test_scenario_engine.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/lighting/engine.py backend/tests/test_scenario_engine.py
git commit -m "feat(lighting): add presence ScenarioEngine"
```

---

### Task 4: Lighting REST API + wire app

**Files:**
- Create: `backend/app/routers/lighting.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/__init__.py` if needed (may be namespace-only)

**Interfaces:**
- Consumes: models, schemas, `ScenarioEngine`, `build_driver`
- Produces: routes under `/api/lighting/...`

- [ ] **Step 1: Implement router**

`backend/app/routers/lighting.py` — mirror cameras auth patterns:

- Helper `_to_out(controller, db, engine) -> LightingControllerOut`
- `GET ""` list (admin or authenticated — **admin only** for MVP list is fine; spec says CRUD admin — use `require_admin` for all controller mutations and list; presence uses `get_current_user`)
- `POST ""` create + links
- `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`
- `PUT /{id}/cameras` body `{"cameraIds": [...]}` **or** accept `cameraIds` only on create/update (spec lists PUT — implement PUT replacing links; validate camera IDs exist)
- `POST /{id}/test` → driver.test(), persist status/last_error
- `POST /{id}/command` → engine.set_manual / driver turn_on|off, update engine `light_on`
- `POST /presence` → `engine.ingest_presence` + look up links from DB

Wire DB-backed closures into a **singleton** `ScenarioEngine` stored on `app.state.lighting_engine`, recreating lookup lambdas that open short DB sessions **or** pass `db` into ingest from the request handler and call a method that accepts controller rows for this request.

Recommended simpler approach for MVP:

```python
# In presence handler:
engine: ScenarioEngine = request.app.state.lighting_engine
# Refresh engine link cache from DB each ingest OR query DB inside handler and call:
await engine.ingest_presence_with_links(
    camera_id,
    present,
    controllers=[{id, enabled, off_delay_sec}, ...],
    cameras_by_controller={cid: [cam_ids]},
    get_driver=lambda cid: build_driver(controller_row),
)
```

Prefer extending `ingest_presence` as designed in Task 3 with injected getters that close over `db` **for that request** (create a thin per-request engine adapter or set getters temporarily). Cleanest MVP: store only runtime state on singleton; pass link snapshot into `ingest_presence`:

```python
async def ingest_presence(
    self,
    camera_id: str,
    present: bool,
    *,
    controllers: list[dict],  # linked to this camera
    all_links: dict[str, list[str]],  # controller_id -> camera_ids
    drivers: dict[str, LightingDriver],
    now: float | None = None,
) -> None: ...
```

If Task 3 already shipped with callable getters, keep that API and in the router do:

```python
def get_controllers_for_camera(cam_id: str):
    # query db
...
await engine.ingest_presence(camera_id, present)
```

with getters closed over the request `db` Session (OK for sync SQLAlchemy inside async route if queries are fast; cameras router already mixes sync db with async handlers).

Background: start `asyncio` task in lifespan that every 1s calls `await engine.tick()` so off-delay fires without new presence events.

```python
# main.py lifespan
engine = ScenarioEngine(...)  # getters that open SessionLocal()
app.state.lighting_engine = engine
task = asyncio.create_task(_lighting_tick_loop(engine))
yield
task.cancel()
```

Getters using `SessionLocal()`:

```python
def get_controllers_for_camera(camera_id: str):
    db = SessionLocal()
    try:
        links = db.scalars(
            select(CameraControllerLink).where(CameraControllerLink.camera_id == camera_id)
        ).all()
        out = []
        for link in links:
            c = db.get(LightingController, link.controller_id)
            if c:
                out.append({"id": c.id, "enabled": c.enabled, "off_delay_sec": c.off_delay_sec})
        return out
    finally:
        db.close()
```

Same pattern for cameras-for-controller and get_driver (load controller row → `build_driver`).

- [ ] **Step 2: Register router in `main.py`**

```python
from app.routers import auth, cameras, lighting
...
app.include_router(lighting.router)
```

Plus lifespan engine + tick loop as above.

- [ ] **Step 3: Manual smoke (optional)**

```bash
cd backend
.venv/Scripts/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`GET /api/health` still OK; OpenAPI shows `/api/lighting/*`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/lighting.py backend/app/main.py backend/app/lighting
git commit -m "feat(lighting): expose lighting REST API and engine loop"
```

---

### Task 5: Frontend lighting API client

**Files:**
- Create: `src/lib/lighting.ts`

**Interfaces:**
- Produces:
  - `LightingController` type matching API Out
  - `listControllers`, `createController`, `updateController`, `deleteController`, `setControllerCameras`, `testController`, `commandController`, `postPresence`

- [ ] **Step 1: Implement client**

```ts
import { api } from './api';

export type ControllerType = 'imperium' | 'spectrum';
export type ControllerStatus = 'unknown' | 'online' | 'offline' | 'error';

export interface LightingController {
  id: string;
  name: string;
  type: ControllerType;
  host: string;
  port: number;
  username: string;
  passwordSet: boolean;
  offDelaySec: number;
  enabled: boolean;
  status: ControllerStatus;
  lastError: string | null;
  cameraIds: string[];
  lightOn: boolean;
}

export interface LightingControllerPayload {
  name: string;
  type: ControllerType;
  host: string;
  port: number;
  username: string;
  password?: string;
  offDelaySec: number;
  enabled: boolean;
  cameraIds: string[];
}

export function listControllers() {
  return api<LightingController[]>('/api/lighting/controllers');
}

export function createController(body: LightingControllerPayload) {
  return api<LightingController>('/api/lighting/controllers', { method: 'POST', body });
}

export function updateController(id: string, body: Partial<LightingControllerPayload>) {
  return api<LightingController>(`/api/lighting/controllers/${id}`, { method: 'PATCH', body });
}

export function deleteController(id: string) {
  return api<void>(`/api/lighting/controllers/${id}`, { method: 'DELETE' });
}

export function setControllerCameras(id: string, cameraIds: string[]) {
  return api<LightingController>(`/api/lighting/controllers/${id}/cameras`, {
    method: 'PUT',
    body: { cameraIds },
  });
}

export function testController(id: string) {
  return api<{ success: boolean; message: string; status: ControllerStatus }>(
    `/api/lighting/controllers/${id}/test`,
    { method: 'POST' },
  );
}

export function commandController(id: string, action: 'on' | 'off') {
  return api<LightingController>(`/api/lighting/controllers/${id}/command`, {
    method: 'POST',
    body: { action },
  });
}

export function postPresence(body: {
  cameraId: string;
  present: boolean;
  classes?: string[];
  ts?: number;
}) {
  return api<void>('/api/lighting/presence', { method: 'POST', body });
}
```

Align path prefix with router (`prefix="/api/lighting"`, controllers at `/controllers`).

- [ ] **Step 2: Commit**

```bash
git add src/lib/lighting.ts
git commit -m "feat(lighting): add frontend lighting API client"
```

---

### Task 6: Settings UI — tabs + controller CRUD

**Files:**
- Create: `src/components/LightingSettingsPanel.tsx`
- Create: `src/components/ControllerModal.tsx`
- Modify: `src/components/SettingsPage.tsx`

**Interfaces:**
- Consumes: `src/lib/lighting.ts`, `useCameras()` for camera multi-select
- Produces: admin UI for controllers

- [ ] **Step 1: Add tabs to SettingsPage**

Top bar subtitle + tab switcher:

```tsx
const [tab, setTab] = useState<'cameras' | 'lighting'>('cameras');
// buttons: Камеры | Освещение
// if tab === 'cameras' → existing table
// if tab === 'lighting' → <LightingSettingsPanel />
```

- [ ] **Step 2: Implement `LightingSettingsPanel`**

- Load `listControllers()` on mount
- Intro copy (Russian): presence of person/car, off after delay
- Table columns: name, type label (`STAR Imperium-1` / `STAR Spectrum-1`), host, status, lightOn, camera count, offDelaySec
- Actions: Проверить, Вкл, Выкл, Изменить, Удалить
- Add button opens `ControllerModal`

- [ ] **Step 3: Implement `ControllerModal`**

Fields per spec: name, type (spectrum option `disabled`), host, port, username, password (empty on edit = keep existing), offDelaySec, camera checkboxes from `useCameras()`, empty-state hint if none selected.

On save: create or update (+ `setControllerCameras` if update path separates links).

- [ ] **Step 4: Visual check in browser**

Admin → Настройки → Освещение → add controller form renders; Spectrum disabled.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPage.tsx src/components/LightingSettingsPanel.tsx src/components/ControllerModal.tsx
git commit -m "feat(lighting): add settings UI for controllers"
```

---

### Task 7: Presence reporter + wire player

**Files:**
- Create: `src/lib/presence.ts` (pure helpers)
- Create: `src/lib/presence.test.ts`
- Create: `src/lib/presenceReporter.ts` (hook or class)
- Modify: `src/components/CameraStreamPlayer.tsx`

**Interfaces:**
- Consumes: `DetectionFrame`, `postPresence`
- Produces:
  - `export function tracksIndicatePresence(tracks: DetectionTrack[]): { present: boolean; classes: string[] }`
  - `export function usePresenceReporter(cameraId: string, frame: DetectionFrame | null, enabled: boolean): void`

- [ ] **Step 1: Failing Vitest for presence helper**

```ts
import { describe, expect, it } from 'vitest';
import { tracksIndicatePresence } from './presence';

describe('tracksIndicatePresence', () => {
  it('is true for person or car', () => {
    expect(tracksIndicatePresence([{ trackId: 1, class: 'person', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(true);
    expect(tracksIndicatePresence([{ trackId: 1, class: 'car', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(true);
  });
  it('is false for empty or other classes', () => {
    expect(tracksIndicatePresence([]).present).toBe(false);
    expect(tracksIndicatePresence([{ trackId: 1, class: 'dog', bbox: [0, 0, 1, 1], confidence: 0.9 }]).present).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- src/lib/presence.test.ts
```

- [ ] **Step 3: Implement helper + reporter**

`presence.ts`: filter `person` | `car`.

`presenceReporter.ts`:

```ts
// useRef lastPresent
// on each frame: compute present
// if present !== lastPresent → postPresence (edge)
// if present && Date.now() - lastHeartbeat > 7000 → postPresence heartbeat
// on unmount / enabled false: optional post present:false (best-effort)
// swallow ApiError (console.warn) — do not break player
```

Wire in `CameraStreamPlayer` when analytics enabled and `frame` updates:

```tsx
usePresenceReporter(camera.id, frame, analyticsEnabled);
```

Optional small chip when `camera` has lighting (requires either embedding `hasLighting` from API later or skipping chip until a cheap `GET` — **MVP:** chip showing «Присутствие → свет» only if parent passes `lightingLinked?: boolean`. If no API on camera list yet, skip chip or add `GET /api/lighting/controllers` once in CamerasPage — **YAGNI: skip live chip in this task** unless trivial; spec allows subtle chip — add a soft badge in player when presence reporter last sent `present=true` (local only): «Свет: присутствие».

- [ ] **Step 4: Run tests — pass**

```bash
npm test -- src/lib/presence.test.ts
cd backend && .venv/Scripts/pytest -v
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/presence.ts src/lib/presence.test.ts src/lib/presenceReporter.ts src/components/CameraStreamPlayer.tsx
git commit -m "feat(lighting): report presence from client analytics"
```

---

### Task 8: End-to-end polish + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-08-26-lighting-control-design.md` (Status: Approved → Implemented or leave Approved)
- Fix any alias/path mismatches found in smoke

- [ ] **Step 1: Manual checklist**

1. Admin adds Imperium controller (IP), Проверить → online/offline message  
2. Вкл / Выкл sends commands (real device or mock)  
3. Link camera; open live view with person/car → light on  
4. Leave frame empty > offDelaySec (+ grace if tab closed) → light off  
5. Two cameras one controller: OR behavior  

- [ ] **Step 2: Run full automated suite**

```bash
cd backend && .venv/Scripts/pytest -v
npm test
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(lighting): finalize presence lighting MVP"
```

---

## Spec coverage self-review

| Spec item | Task |
|-----------|------|
| Unified LightingController entity | 1 |
| M2M camera links | 1, 4, 6 |
| Imperium driver + auth + endpoints | 2 |
| Spectrum stub / same entity | 2, 6 |
| ScenarioEngine OR + off delay | 3 |
| Heartbeat grace 20s | 3, 7 |
| REST API + presence | 4, 5 |
| Settings tabs + modal + test/on/off | 6 |
| Client presence from tracks | 7 |
| Password not returned | 1, 4 |
| No server 24/7 detection | documented; out of scope |

## Placeholder / consistency notes

- Router prefix: `/api/lighting`, controllers collection `/controllers`
- Engine injectable getters vs per-request snapshots: Task 4 must match Task 3’s final `ScenarioEngine` signature — implementers should not invent a second API
- Frontend `offDelaySec` ↔ backend `off_delay_sec` via aliases
