import pytest

from app.lighting.drivers.base import DriverResult
from app.lighting.engine import HEARTBEAT_GRACE_SEC, ScenarioEngine


def _freeze_now(monkeypatch: pytest.MonkeyPatch, t: float) -> None:
    monkeypatch.setattr("app.lighting.engine.time.time", lambda: t)


class FakeDriver:
    def __init__(self, *, on_ok: bool = True, off_ok: bool = True):
        self.commands: list[str] = []
        self.on_ok = on_ok
        self.off_ok = off_ok

    async def test(self) -> DriverResult:
        return DriverResult(True, "online")

    async def turn_on(self) -> DriverResult:
        self.commands.append("on")
        return DriverResult(self.on_ok, "online" if self.on_ok else "error")

    async def turn_off(self) -> DriverResult:
        self.commands.append("off")
        return DriverResult(self.off_ok, "online" if self.off_ok else "error")


@pytest.mark.asyncio
async def test_or_presence_and_off_delay(monkeypatch):
    driver = FakeDriver()
    # controller c1 linked to cam-a and cam-b, delay 60
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ] if cam in {"cam-a", "cam-b"} else [],
        get_camera_ids_for_controller=lambda cid: ["cam-a", "cam-b"] if cid == "c1" else [],
        get_driver=lambda cid: driver,
    )

    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    assert driver.commands == ["on"]
    assert engine.light_on("c1") is True

    _freeze_now(monkeypatch, 1001.0)
    await engine.ingest_presence("cam-a", False)
    # cam-b never present → start off timer; still on until delay
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 59)
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 60)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_second_camera_keeps_light_on(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a", "cam-b"],
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    _freeze_now(monkeypatch, 1001.0)
    await engine.ingest_presence("cam-b", True)
    _freeze_now(monkeypatch, 1002.0)
    await engine.ingest_presence("cam-a", False)
    await engine.tick(now=1002.0 + 120)
    assert driver.commands == ["on"]  # still on via cam-b
    assert engine.light_on("c1") is True


@pytest.mark.asyncio
async def test_stale_heartbeat_counts_absent(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 10}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    # no heartbeat for 21s → absent, then off after 10s delay
    await engine.tick(now=1000.0 + HEARTBEAT_GRACE_SEC + 1)
    await engine.tick(now=1000.0 + HEARTBEAT_GRACE_SEC + 1 + 10)
    assert driver.commands == ["on", "off"]


@pytest.mark.asyncio
async def test_presence_without_or_bogus_ts_uses_server_time_for_grace(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 0}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    server_now = 1_700_000_000.0
    _freeze_now(monkeypatch, server_now)
    await engine.ingest_presence("cam-a", True, now=0.016)
    assert engine.light_on("c1") is True
    await engine.tick(now=server_now)
    assert engine.light_on("c1") is True
    assert driver.commands == ["on"]

    driver2 = FakeDriver()
    engine2 = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 0}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver2,
    )
    await engine2.ingest_presence("cam-a", True)
    await engine2.tick(now=server_now)
    assert engine2.light_on("c1") is True
    assert driver2.commands == ["on"]


@pytest.mark.asyncio
async def test_manual_on_survives_tick_without_presence():
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [],
        get_camera_ids_for_controller=lambda cid: [],
        get_driver=lambda cid: driver,
    )
    engine.ensure_controller_config("c1", enabled=True, off_delay_sec=60)
    await engine.set_manual("c1", on=True)
    assert driver.commands == ["on"]
    assert engine.light_on("c1") is True

    await engine.tick(now=1.0)
    assert engine.light_on("c1") is True
    assert driver.commands == ["on"]

    await engine.set_manual("c1", on=False)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_manual_on_then_presence_absence_starts_off_delay(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    engine.ensure_controller_config("c1", enabled=True, off_delay_sec=60)
    await engine.set_manual("c1", on=True)
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    _freeze_now(monkeypatch, 1001.0)
    await engine.ingest_presence("cam-a", False)
    await engine.tick(now=1001.0 + 59)
    assert engine.light_on("c1") is True
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 60)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_forget_controller_drops_state_so_tick_does_not_turn_off(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 10}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    _freeze_now(monkeypatch, 1001.0)
    await engine.ingest_presence("cam-a", False)
    engine.forget_controller("c1")
    assert engine.light_on("c1") is False
    await engine.tick(now=1011.0)
    assert driver.commands == ["on"]


@pytest.mark.asyncio
async def test_tick_skips_get_driver_failure_and_continues(monkeypatch):
    good = FakeDriver()
    live: dict[str, FakeDriver] = {"good": good, "bad": FakeDriver()}

    def get_driver(cid: str) -> FakeDriver:
        if cid not in live:
            raise KeyError(cid)
        return live[cid]

    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "bad", "enabled": True, "off_delay_sec": 10}
            if cam == "cam-bad"
            else {"id": "good", "enabled": True, "off_delay_sec": 10}
        ],
        get_camera_ids_for_controller=lambda cid: (
            ["cam-bad"] if cid == "bad" else ["cam-good"]
        ),
        get_driver=get_driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-bad", True)
    await engine.ingest_presence("cam-good", True)
    _freeze_now(monkeypatch, 1001.0)
    await engine.ingest_presence("cam-bad", False)
    await engine.ingest_presence("cam-good", False)
    del live["bad"]

    await engine.tick(now=1011.0)

    assert good.commands == ["on", "off"]
    assert engine.light_on("good") is False


@pytest.mark.asyncio
async def test_failed_turn_on_does_not_set_desired_on_and_retries(monkeypatch):
    driver = FakeDriver(on_ok=False)
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 60}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    assert engine.light_on("c1") is False
    assert driver.commands == ["on"]

    driver.on_ok = True
    await engine.tick(now=1000.0)
    assert engine.light_on("c1") is True
    assert driver.commands == ["on", "on"]


@pytest.mark.asyncio
async def test_failed_manual_on_does_not_set_desired_on():
    driver = FakeDriver(on_ok=False)
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    engine.ensure_controller_config("c1", enabled=True, off_delay_sec=60)
    result = await engine.set_manual("c1", on=True)
    assert result.ok is False
    assert engine.light_on("c1") is False
    assert driver.commands == ["on"]


@pytest.mark.asyncio
async def test_failed_manual_off_keeps_desired_on():
    driver = FakeDriver(off_ok=False)
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    engine.ensure_controller_config("c1", enabled=True, off_delay_sec=60)
    await engine.set_manual("c1", on=True)
    result = await engine.set_manual("c1", on=False)
    assert result.ok is False
    assert engine.light_on("c1") is True
    assert driver.commands == ["on", "off"]


@pytest.mark.asyncio
async def test_failed_tick_turn_off_keeps_desired_on(monkeypatch):
    driver = FakeDriver(off_ok=False)
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 0}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    await engine.ingest_presence("cam-a", False)
    await engine.tick(now=1000.0)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is True


@pytest.mark.asyncio
async def test_empty_camera_links_starts_off_delay_when_light_on(monkeypatch):
    driver = FakeDriver()
    links: list[str] = ["cam-a"]
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: (
            [{"id": "c1", "enabled": True, "off_delay_sec": 10}] if cam in links else []
        ),
        get_camera_ids_for_controller=lambda cid: list(links),
        get_driver=lambda cid: driver,
    )
    _freeze_now(monkeypatch, 1000.0)
    await engine.ingest_presence("cam-a", True)
    assert engine.light_on("c1") is True
    links.clear()
    await engine.tick(now=1000.0)
    assert engine.light_on("c1") is True
    await engine.tick(now=1010.0)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_manual_on_with_no_links_eventually_offs(monkeypatch):
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [],
        get_camera_ids_for_controller=lambda cid: [],
        get_driver=lambda cid: driver,
    )
    engine.ensure_controller_config("c1", enabled=True, off_delay_sec=10)
    await engine.set_manual("c1", on=True)
    _freeze_now(monkeypatch, 1000.0)
    await engine.tick(now=1000.0)
    assert engine.light_on("c1") is True
    await engine.tick(now=1010.0)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False
