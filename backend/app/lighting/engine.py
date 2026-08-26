from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, TypedDict

from app.lighting.drivers.base import DriverResult, LightingDriver

HEARTBEAT_GRACE_SEC = 20
logger = logging.getLogger(__name__)


class ControllerView(TypedDict):
    id: str
    enabled: bool
    off_delay_sec: int


@dataclass
class _CameraState:
    present: bool
    last_seen: float


@dataclass
class _ControllerState:
    desired_on: bool
    off_deadline: float | None
    off_delay_sec: int
    enabled: bool


class ScenarioEngine:
    def __init__(
        self,
        get_controllers_for_camera: Callable[[str], list[ControllerView]],
        get_camera_ids_for_controller: Callable[[str], list[str]],
        get_driver: Callable[[str], LightingDriver],
    ) -> None:
        self._get_controllers_for_camera = get_controllers_for_camera
        self._get_camera_ids_for_controller = get_camera_ids_for_controller
        self._get_driver = get_driver
        self._cameras: dict[str, _CameraState] = {}
        self._controllers: dict[str, _ControllerState] = {}

    def light_on(self, controller_id: str) -> bool:
        state = self._controllers.get(controller_id)
        return state.desired_on if state is not None else False

    def ensure_controller_config(
        self, controller_id: str, *, enabled: bool, off_delay_sec: int
    ) -> None:
        state = self._ensure_controller_state(controller_id)
        state.enabled = enabled
        state.off_delay_sec = off_delay_sec

    def forget_controller(self, controller_id: str) -> None:
        self._controllers.pop(controller_id, None)

    async def set_manual(self, controller_id: str, on: bool) -> DriverResult:
        driver = self._get_driver(controller_id)
        result = await (driver.turn_on() if on else driver.turn_off())
        if result.ok:
            state = self._ensure_controller_state(controller_id)
            state.desired_on = on
            state.off_deadline = None
        return result

    async def ingest_presence(
        self, camera_id: str, present: bool, *, now: float | None = None
    ) -> None:
        # Client ts is ignored: rAF/monotonic clocks must not drive heartbeat grace.
        now = time.time()
        self._cameras[camera_id] = _CameraState(present=present, last_seen=now)

        for view in self._get_controllers_for_camera(camera_id):
            await self._recompute_controller(view["id"], view, now)

    async def tick(self, now: float | None = None) -> None:
        now = time.time() if now is None else now

        for controller_id, state in list(self._controllers.items()):
            view: ControllerView = {
                "id": controller_id,
                "enabled": state.enabled,
                "off_delay_sec": state.off_delay_sec,
            }
            try:
                await self._recompute_controller(controller_id, view, now)
            except Exception:
                logger.exception("lighting recompute failed for %s", controller_id)

        for controller_id, state in list(self._controllers.items()):
            if not state.enabled:
                continue
            if (
                state.off_deadline is not None
                and now >= state.off_deadline
                and state.desired_on
            ):
                try:
                    driver = self._get_driver(controller_id)
                    result = await driver.turn_off()
                    if result.ok:
                        state.desired_on = False
                        state.off_deadline = None
                except Exception:
                    logger.exception("lighting driver off failed for %s", controller_id)

    def _effective_present(self, camera_id: str, now: float) -> bool:
        state = self._cameras.get(camera_id)
        if state is None:
            return False
        return state.present and (now - state.last_seen) <= HEARTBEAT_GRACE_SEC

    def _or_present(self, controller_id: str, now: float) -> bool:
        return any(
            self._effective_present(camera_id, now)
            for camera_id in self._get_camera_ids_for_controller(controller_id)
        )

    def _presence_tracked(self, controller_id: str) -> bool:
        camera_ids = self._get_camera_ids_for_controller(controller_id)
        if not camera_ids:
            # No linked cameras: treat as known-absent so an on light can time out.
            return True
        return any(camera_id in self._cameras for camera_id in camera_ids)

    def _ensure_controller_state(self, controller_id: str) -> _ControllerState:
        if controller_id not in self._controllers:
            self._controllers[controller_id] = _ControllerState(
                desired_on=False,
                off_deadline=None,
                off_delay_sec=0,
                enabled=True,
            )
        return self._controllers[controller_id]

    async def _apply_driver_on(self, controller_id: str, state: _ControllerState) -> None:
        try:
            driver = self._get_driver(controller_id)
            result = await driver.turn_on()
            if result.ok:
                state.desired_on = True
        except Exception:
            logger.exception("lighting driver on failed for %s", controller_id)

    async def _recompute_controller(
        self, controller_id: str, view: ControllerView, now: float
    ) -> None:
        state = self._ensure_controller_state(controller_id)
        state.off_delay_sec = view["off_delay_sec"]
        state.enabled = view["enabled"]

        if not state.enabled:
            return

        if self._or_present(controller_id, now):
            state.off_deadline = None
            if not state.desired_on:
                await self._apply_driver_on(controller_id, state)
        elif self._presence_tracked(controller_id):
            if state.off_deadline is None:
                state.off_deadline = now + state.off_delay_sec
