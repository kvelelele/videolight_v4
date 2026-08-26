import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.lighting.drivers.base import DriverResult
from app.main import app
import app.database as database
import app.main as main_mod


class FakeDriver:
    def __init__(self) -> None:
        self.commands: list[str] = []

    async def test(self) -> DriverResult:
        return DriverResult(True, "online", "ok")

    async def turn_on(self) -> DriverResult:
        self.commands.append("on")
        return DriverResult(True, "online", "ok")

    async def turn_off(self) -> DriverResult:
        self.commands.append("off")
        return DriverResult(True, "online", "ok")


@pytest.fixture
def fake_driver() -> FakeDriver:
    return FakeDriver()


@pytest.fixture
def client(monkeypatch, fake_driver):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    monkeypatch.setattr(database, "engine", test_engine)
    monkeypatch.setattr(database, "SessionLocal", TestSession)
    monkeypatch.setattr(main_mod, "engine", test_engine)
    monkeypatch.setattr(main_mod, "SessionLocal", TestSession)
    monkeypatch.setattr(
        "app.lighting.drivers.factory.build_driver",
        lambda _controller: fake_driver,
    )

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str) -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["token"]


def _admin_token(client) -> str:
    return _login(client, "admin@visioncontrol.com", "admin123")


def _user_token(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": "viewer@example.com", "name": "Viewer", "password": "viewer1"},
    )
    assert response.status_code == 200
    return response.json()["token"]


def _create_camera(client, token: str, name: str = "Cam A") -> str:
    response = client.post(
        "/api/cameras",
        headers=_auth(token),
        json={
            "name": name,
            "location": "office",
            "sourceType": "HTTP",
            "sourceUrl": "http://example.com/stream",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def _controller_payload(**overrides):
    body = {
        "name": "Hall",
        "type": "imperium",
        "host": "192.168.1.10",
        "port": 90,
        "username": "TRION",
        "password": "TRION1",
        "offDelaySec": 60,
        "enabled": True,
        "cameraIds": [],
    }
    body.update(overrides)
    return body


def test_list_controllers_requires_auth(client):
    response = client.get("/api/lighting/controllers")
    assert response.status_code == 401


def test_list_controllers_requires_admin(client):
    token = _user_token(client)
    response = client.get("/api/lighting/controllers", headers=_auth(token))
    assert response.status_code == 403


def test_create_get_patch_delete_controller_hides_password(client):
    token = _admin_token(client)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    assert created.status_code == 201
    body = created.json()
    assert "password" not in body
    assert body["passwordSet"] is True
    assert body["cameraIds"] == []
    assert body["lightOn"] is False
    assert body["name"] == "Hall"
    assert body["host"] == "192.168.1.10"
    controller_id = body["id"]

    listed = client.get("/api/lighting/controllers", headers=_auth(token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "password" not in listed.json()[0]

    fetched = client.get(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert fetched.status_code == 200
    assert fetched.json()["id"] == controller_id
    assert "password" not in fetched.json()

    patched = client.patch(
        f"/api/lighting/controllers/{controller_id}",
        headers=_auth(token),
        json={"name": "Lobby", "offDelaySec": 90},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Lobby"
    assert patched.json()["offDelaySec"] == 90
    assert "password" not in patched.json()

    deleted = client.delete(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert deleted.status_code == 204
    missing = client.get(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert missing.status_code == 404


def test_put_cameras_replaces_links_and_rejects_unknown(client):
    token = _admin_token(client)
    camera_id = _create_camera(client, token)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    controller_id = created.json()["id"]

    bad = client.put(
        f"/api/lighting/controllers/{controller_id}/cameras",
        headers=_auth(token),
        json={"cameraIds": ["missing-cam"]},
    )
    assert bad.status_code == 400

    ok = client.put(
        f"/api/lighting/controllers/{controller_id}/cameras",
        headers=_auth(token),
        json={"cameraIds": [camera_id]},
    )
    assert ok.status_code == 200
    assert ok.json()["cameraIds"] == [camera_id]


def test_test_endpoint_persists_status(client, fake_driver):
    token = _admin_token(client)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    controller_id = created.json()["id"]

    tested = client.post(
        f"/api/lighting/controllers/{controller_id}/test",
        headers=_auth(token),
    )
    assert tested.status_code == 200
    assert tested.json()["success"] is True
    assert tested.json()["status"] == "online"

    fetched = client.get(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert fetched.json()["status"] == "online"
    assert fetched.json()["lastError"] is None


def test_command_sets_light_on(client, fake_driver):
    token = _admin_token(client)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    controller_id = created.json()["id"]

    commanded = client.post(
        f"/api/lighting/controllers/{controller_id}/command",
        headers=_auth(token),
        json={"action": "on"},
    )
    assert commanded.status_code == 200
    assert commanded.json()["lightOn"] is True
    assert fake_driver.commands == ["on"]
    assert "password" not in commanded.json()


def test_command_on_survives_tick_until_manual_off(client, fake_driver):
    token = _admin_token(client)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    controller_id = created.json()["id"]

    commanded = client.post(
        f"/api/lighting/controllers/{controller_id}/command",
        headers=_auth(token),
        json={"action": "on"},
    )
    assert commanded.status_code == 200
    assert commanded.json()["lightOn"] is True

    asyncio.run(app.state.lighting_engine.tick(now=time.time() + 1))

    fetched = client.get(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert fetched.status_code == 200
    assert fetched.json()["lightOn"] is True
    assert fake_driver.commands == ["on"]

    off = client.post(
        f"/api/lighting/controllers/{controller_id}/command",
        headers=_auth(token),
        json={"action": "off"},
    )
    assert off.status_code == 200
    assert off.json()["lightOn"] is False
    assert fake_driver.commands == ["on", "off"]


def test_delete_forgets_engine_state(client, fake_driver):
    token = _admin_token(client)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(token),
        json=_controller_payload(),
    )
    controller_id = created.json()["id"]

    commanded = client.post(
        f"/api/lighting/controllers/{controller_id}/command",
        headers=_auth(token),
        json={"action": "on"},
    )
    assert commanded.status_code == 200
    engine = app.state.lighting_engine
    assert engine.light_on(controller_id) is True

    deleted = client.delete(f"/api/lighting/controllers/{controller_id}", headers=_auth(token))
    assert deleted.status_code == 204
    assert engine.light_on(controller_id) is False
    asyncio.run(engine.tick(now=time.time() + 1))
    assert fake_driver.commands == ["on"]


def test_presence_accepted_for_authenticated_user(client, fake_driver):
    admin = _admin_token(client)
    camera_id = _create_camera(client, admin)
    created = client.post(
        "/api/lighting/controllers",
        headers=_auth(admin),
        json=_controller_payload(cameraIds=[camera_id]),
    )
    controller_id = created.json()["id"]

    user = _user_token(client)
    posted = client.post(
        "/api/lighting/presence",
        headers=_auth(user),
        json={"cameraId": camera_id, "present": True, "classes": ["person"]},
    )
    assert posted.status_code == 204

    fetched = client.get(f"/api/lighting/controllers/{controller_id}", headers=_auth(admin))
    assert fetched.json()["lightOn"] is True
    assert fake_driver.commands == ["on"]


def test_health_still_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
