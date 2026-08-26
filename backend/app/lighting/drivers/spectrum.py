from app.lighting.drivers.base import DriverResult


class SpectrumDriver:
    async def test(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")

    async def turn_on(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")

    async def turn_off(self) -> DriverResult:
        return DriverResult(False, "error", "Spectrum driver not implemented")
