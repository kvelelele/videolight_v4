import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_flexible, require_admin
from app.database import get_db
from app.models import Camera, User
from app.schemas import CameraCreate, CameraOut, CameraTestRequest, CameraTestResponse, CameraUpdate
from app.streaming import ffmpeg_mjpeg_stream, needs_ffmpeg_transcode, proxy_http_stream, test_stream_url

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

UNSUPPORTED_SOURCE_TYPES = {"USB Camera", "Web Camera"}


def _to_out(camera: Camera) -> CameraOut:
    return CameraOut.model_validate(camera)


@router.get("", response_model=list[CameraOut])
def list_cameras(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CameraOut]:
    cameras = db.scalars(select(Camera).order_by(Camera.name)).all()
    return [_to_out(c) for c in cameras]


@router.post("/test", response_model=CameraTestResponse)
async def test_camera_connection(
    body: CameraTestRequest,
    _: User = Depends(get_current_user),
) -> CameraTestResponse:
    if body.sourceType in UNSUPPORTED_SOURCE_TYPES:
        return CameraTestResponse(
            success=False,
            message="Сетевой тест недоступен для USB/Web камер",
        )

    success, message = await test_stream_url(body.sourceUrl)
    return CameraTestResponse(success=success, message=message)


@router.get("/{camera_id}/stream")
async def stream_camera(
    camera_id: str,
    _: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.source_type in UNSUPPORTED_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="USB/Web камеры не поддерживаются для сетевого воспроизведения",
        )

    if not camera.source_url.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL источника не указан")

    if camera.source_type == "HTTP":
        if needs_ffmpeg_transcode(camera.source_url):
            generator = ffmpeg_mjpeg_stream(camera.source_url)
            media_type = "multipart/x-mixed-replace; boundary=ffmpeg"
        else:
            generator = proxy_http_stream(camera.source_url)
            media_type = "multipart/x-mixed-replace"
    else:
        generator = ffmpeg_mjpeg_stream(camera.source_url)
        media_type = "multipart/x-mixed-replace; boundary=ffmpeg"

    return StreamingResponse(generator, media_type=media_type)


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
def create_camera(
    body: CameraCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraOut:
    camera_id = body.id or f"cam-{uuid.uuid4().hex[:12]}"
    if db.get(Camera, camera_id) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Camera id already exists")

    camera = Camera(
        id=camera_id,
        name=body.name,
        location=body.location,
        source_type=body.sourceType,
        source_url=body.sourceUrl,
        status=body.status,
        last_connected=body.lastConnected,
        resolution=body.resolution,
        fps=body.fps,
        scene_type=body.sceneType,
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return _to_out(camera)


@router.put("/{camera_id}", response_model=CameraOut)
def update_camera(
    camera_id: str,
    body: CameraUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    data = body.model_dump(exclude_unset=True)
    field_map = {
        "sourceType": "source_type",
        "sourceUrl": "source_url",
        "lastConnected": "last_connected",
        "sceneType": "scene_type",
    }
    for key, value in data.items():
        attr = field_map.get(key, key)
        setattr(camera, attr, value)

    db.commit()
    db.refresh(camera)
    return _to_out(camera)


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(
    camera_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    db.delete(camera)
    db.commit()
