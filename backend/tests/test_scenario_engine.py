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
async def test_manual_on_then_presence_absence_starts_off_delay():
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
    await engine.ingest_presence("cam-a", True, now=1000.0)
    await engine.ingest_presence("cam-a", False, now=1001.0)
    await engine.tick(now=1001.0 + 59)
    assert engine.light_on("c1") is True
    assert driver.commands == ["on"]
    await engine.tick(now=1001.0 + 60)
    assert driver.commands == ["on", "off"]
    assert engine.light_on("c1") is False


@pytest.mark.asyncio
async def test_forget_controller_drops_state_so_tick_does_not_turn_off():
    driver = FakeDriver()
    engine = ScenarioEngine(
        get_controllers_for_camera=lambda cam: [
            {"id": "c1", "enabled": True, "off_delay_sec": 10}
        ],
        get_camera_ids_for_controller=lambda cid: ["cam-a"],
        get_driver=lambda cid: driver,
    )
    await engine.ingest_presence("cam-a", True, now=1000.0)
    await engine.ingest_presence("cam-a", False, now=1001.0)
    engine.forget_controller("c1")
    assert engine.light_on("c1") is False
    await engine.tick(now=1011.0)
    assert driver.commands == ["on"]


@pytest.mark.asyncio
async def test_tick_skips_get_driver_failure_and_continues():
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
    await engine.ingest_presence("cam-bad", True, now=1000.0)
    await engine.ingest_presence("cam-good", True, now=1000.0)
    await engine.ingest_presence("cam-bad", False, now=1001.0)
    await engine.ingest_presence("cam-good", False, now=1001.0)
    del live["bad"]

    await engine.tick(now=1011.0)

    assert good.commands == ["on", "off"]
    assert engine.light_on("good") is False
