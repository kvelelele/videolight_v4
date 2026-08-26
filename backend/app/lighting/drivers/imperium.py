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

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Basic {self._auth}"}

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.get(
                f"{self._base}{path}", params=params, headers=self._headers()
            )

    async def test(self) -> DriverResult:
        try:
            if self._client is not None:
                resp = await self._client.get("/api_dali/is", headers=self._headers())
            else:
                resp = await self._get("/api_dali/is")
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
