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
async def test_imperium_standalone_path_without_injected_client(monkeypatch):
    transport = httpx.MockTransport(_handler)
    original_async_client = httpx.AsyncClient

    def async_client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        return original_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", async_client_factory)

    driver = ImperiumDriver("192.168.1.10", 90, "TRION", "TRION1")
    assert driver._client is None
    assert (await driver.test()).ok is True
    assert (await driver.turn_on()).ok is True


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


@pytest.mark.asyncio
async def test_imperium_retries_http_errors_then_succeeds():
    attempts = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise httpx.ConnectError("transient")
        return _handler(request)

    transport = httpx.MockTransport(flaky)
    async with httpx.AsyncClient(transport=transport, base_url="http://192.168.1.10:90") as client:
        driver = ImperiumDriver("192.168.1.10", 90, "TRION", "TRION1", client=client)
        assert (await driver.test()).ok is True
        assert attempts["n"] == 3
        assert (await driver.turn_on()).ok is True
        assert (await driver.turn_off()).ok is True
