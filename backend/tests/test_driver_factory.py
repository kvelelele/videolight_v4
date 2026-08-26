from types import SimpleNamespace

from app.lighting.drivers.factory import build_driver
from app.lighting.drivers.imperium import ImperiumDriver
from app.lighting.drivers.spectrum import SpectrumDriver


def test_build_driver_returns_spectrum_for_spectrum_type():
    controller = SimpleNamespace(
        type="spectrum",
        host="ignored",
        port=0,
        username="u",
        password="p",
    )
    driver = build_driver(controller)
    assert isinstance(driver, SpectrumDriver)


def test_build_driver_returns_imperium_with_controller_credentials():
    controller = SimpleNamespace(
        type="imperium",
        host="192.168.1.10",
        port=90,
        username="TRION",
        password="TRION1",
    )
    driver = build_driver(controller)
    assert isinstance(driver, ImperiumDriver)
    assert driver._base == "http://192.168.1.10:90"
    assert driver._auth == "VFJJT046VFJJT04x"


def test_build_driver_returns_imperium_for_non_spectrum_types():
    controller = SimpleNamespace(
        type="other",
        host="10.0.0.5",
        port=8080,
        username="admin",
        password="secret",
    )
    driver = build_driver(controller)
    assert isinstance(driver, ImperiumDriver)
    assert driver._base == "http://10.0.0.5:8080"
    assert driver._client is None
