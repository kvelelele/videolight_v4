import asyncio
import base64

import httpx

from app.lighting.drivers.base import DriverResult

_RETRY_BACKOFFS = (0.05, 0.15)


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

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Basic {self._auth}"}

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.get(
                f"{self._base}{path}", params=params, headers=self._headers()
            )

    async def _get_response(self, path: str, params: dict | None = None) -> httpx.Response:
        last_exc: httpx.HTTPError | None = None
        last_resp: httpx.Response | None = None
        for attempt in range(1 + len(_RETRY_BACKOFFS)):
            try:
                if self._client is not None:
                    resp = await self._client.get(
                        path, params=params, headers=self._headers()
                    )
                else:
                    resp = await self._get(path, params)
                if resp.status_code == 200:
                    return resp
                last_resp = resp
            except httpx.HTTPError as exc:
                last_exc = exc
            if attempt < len(_RETRY_BACKOFFS):
                await asyncio.sleep(_RETRY_BACKOFFS[attempt])
        if last_resp is not None:
            return last_resp
        raise last_exc  # type: ignore[misc]

    async def test(self) -> DriverResult:
        try:
            resp = await self._get_response("/api_dali/is")
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
            resp = await self._get_response("/api_dali/dali_command", params)
            if resp.status_code == 200:
                return DriverResult(True, "online", "ok")
            return DriverResult(False, "error", f"HTTP {resp.status_code}")
        except httpx.HTTPError as exc:
            return DriverResult(False, "error", str(exc))
