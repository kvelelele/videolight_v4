import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.analytics.pipeline import pipeline_manager
from app.auth import _user_from_token
from app.database import get_db
from app.models import Camera
from app.streaming import ffmpeg_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cameras", tags=["analytics"])

UNSUPPORTED_SOURCE_TYPES = {"USB Camera", "Web Camera"}


@router.websocket("/{camera_id}/detections")
async def detections_websocket(
    websocket: WebSocket,
    camera_id: str,
    db: Session = Depends(get_db),
) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    try:
        _user_from_token(token, db)
    except HTTPException:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    camera = db.get(Camera, camera_id)
    if camera is None:
        await websocket.close(code=4404, reason="Camera not found")
        return

    if camera.source_type in UNSUPPORTED_SOURCE_TYPES:
        await websocket.close(code=4400, reason="Unsupported camera type")
        return

    if not camera.source_url.strip():
        await websocket.close(code=4400, reason="Empty source URL")
        return

    if not ffmpeg_available():
        await websocket.close(code=4503, reason="ffmpeg not available")
        return

    await websocket.accept()

    pipeline = pipeline_manager.get_or_create(camera_id, camera.source_url)
    await pipeline.subscribe(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("Detections websocket closed for camera %s", camera_id)
    finally:
        await pipeline.unsubscribe(websocket)
