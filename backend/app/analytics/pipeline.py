from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import WebSocket

from app.analytics.capture import iter_frames
from app.analytics.detector import CameraTracker
from app.config import settings

logger = logging.getLogger(__name__)

IDLE_STOP_SEC = 5


class AnalyticsPipeline:
    def __init__(self, camera_id: str, source_url: str) -> None:
        self.camera_id = camera_id
        self.source_url = source_url
        self._subscribers: set[WebSocket] = set()
        self._task: asyncio.Task[None] | None = None
        self._stop_timer: asyncio.Task[None] | None = None
        self._tracker = CameraTracker()
        self._min_interval = 1.0 / max(settings.analytics_target_fps, 0.1)
        self._last_inference = 0.0
        self._frame_width = 0
        self._frame_height = 0
        self._error: str | None = None

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    async def subscribe(self, websocket: WebSocket) -> None:
        if self._stop_timer is not None:
            self._stop_timer.cancel()
            self._stop_timer = None
        self._subscribers.add(websocket)
        if self._error:
            await self._send(websocket, {"error": self._error})
        await self._ensure_running()

    async def unsubscribe(self, websocket: WebSocket) -> None:
        self._subscribers.discard(websocket)
        if not self._subscribers:
            self._schedule_idle_stop()

    def _schedule_idle_stop(self) -> None:
        if self._stop_timer is not None:
            self._stop_timer.cancel()

        async def _stop_after_delay() -> None:
            try:
                await asyncio.sleep(IDLE_STOP_SEC)
                if not self._subscribers:
                    await self.stop()
            except asyncio.CancelledError:
                pass

        self._stop_timer = asyncio.create_task(_stop_after_delay())

    async def _ensure_running(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._error = None
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._tracker = CameraTracker()

    async def _run_loop(self) -> None:
        backoff = 1.0
        while self._subscribers:
            try:
                async for frame, orig_w, orig_h, inf_w, inf_h in iter_frames(self.source_url):
                    if not self._subscribers:
                        break

                    now = time.monotonic()
                    if now - self._last_inference < self._min_interval:
                        continue
                    self._last_inference = now

                    self._frame_width = orig_w
                    self._frame_height = orig_h
                    scale_x = orig_w / inf_w
                    scale_y = orig_h / inf_h

                    tracks = await asyncio.to_thread(
                        self._tracker.detect_and_track,
                        frame,
                        scale_x,
                        scale_y,
                    )
                    payload = self._build_payload(tracks)
                    await self._broadcast(payload)

                if self._subscribers:
                    raise RuntimeError("Поток кадров завершился")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Analytics pipeline error for camera %s", self.camera_id)
                self._error = str(exc)
                await self._broadcast({"error": self._error})
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            else:
                backoff = 1.0

    def _build_payload(self, tracks) -> dict[str, Any]:
        return {
            "ts": time.time(),
            "frameWidth": self._frame_width,
            "frameHeight": self._frame_height,
            "tracks": [
                {
                    "trackId": t.track_id,
                    "class": t.class_name,
                    "bbox": [round(v, 1) for v in t.bbox],
                    "confidence": round(t.confidence, 3),
                }
                for t in tracks
            ],
        }

    async def _send(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            self._subscribers.discard(websocket)

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        if not self._subscribers:
            return
        dead: list[WebSocket] = []
        message = json.dumps(payload)
        for ws in self._subscribers:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._subscribers.discard(ws)


class PipelineManager:
    def __init__(self) -> None:
        self._pipelines: dict[str, AnalyticsPipeline] = {}

    def get_or_create(self, camera_id: str, source_url: str) -> AnalyticsPipeline:
        pipeline = self._pipelines.get(camera_id)
        if pipeline is None or pipeline.source_url != source_url:
            if pipeline is not None:
                asyncio.create_task(pipeline.stop())
            pipeline = AnalyticsPipeline(camera_id, source_url)
            self._pipelines[camera_id] = pipeline
        return pipeline

    async def shutdown_all(self) -> None:
        for pipeline in list(self._pipelines.values()):
            await pipeline.stop()
        self._pipelines.clear()


pipeline_manager = PipelineManager()
