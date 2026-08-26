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
