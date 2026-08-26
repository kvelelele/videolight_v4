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
