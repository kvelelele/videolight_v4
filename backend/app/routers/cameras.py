import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_flexible, require_admin
from app.database import get_db
from app.models import Camera, User
from app.schemas import CameraCreate, CameraOut, CameraTestRequest, CameraTestResponse, CameraUpdate
from app.streaming import (
    fetch_hls_asset_bytes,
    fetch_hls_playlist,
    ffmpeg_available,
    ffmpeg_mjpeg_stream,
    is_allowed_hls_asset,
    is_hls_url,
    proxy_http_stream,
    rewrite_hls_playlist,
    test_stream_url,
)

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
    token: str | None = Query(default=None),
    _: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> Response:
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

    # HLS: return rewritten playlist so browser playback goes through our proxy.
    if is_hls_url(camera.source_url):
        try:
            playlist_url, body = await fetch_hls_playlist(camera.source_url)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Не удалось загрузить HLS-плейлист: {exc}",
            ) from exc

        asset_base = f"/api/cameras/{camera_id}/hls-asset"
        rewritten = rewrite_hls_playlist(body, playlist_url, asset_base, auth_token=token)
        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    if camera.source_type == "HTTP":
        generator = proxy_http_stream(camera.source_url)
        media_type = "multipart/x-mixed-replace"
        return StreamingResponse(generator, media_type=media_type)

    if not ffmpeg_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ffmpeg не найден — установите FFmpeg и добавьте в PATH",
        )

    return StreamingResponse(
        ffmpeg_mjpeg_stream(camera.source_url),
        media_type="multipart/x-mixed-replace; boundary=ffmpeg",
    )


@router.get("/{camera_id}/hls-asset", name="hls_asset")
async def hls_asset(
    camera_id: str,
    url: str = Query(..., min_length=8),
    token: str | None = Query(default=None),
    _: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> Response:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if not is_allowed_hls_asset(camera.source_url, url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL сегмента не относится к источнику камеры",
        )

    try:
        content, content_type = await fetch_hls_asset_bytes(url, camera.source_url)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Не удалось загрузить сегмент: {exc}",
        ) from exc

    path = urlparse(url).path.lower()
    is_playlist = (
        path.endswith(".m3u8")
        or "mpegurl" in content_type.lower()
        or content.lstrip().startswith(b"#EXTM3U")
    )
    if is_playlist:
        text = content.decode("utf-8", errors="replace")
        asset_base = f"/api/cameras/{camera_id}/hls-asset"
        rewritten = rewrite_hls_playlist(text, url, asset_base, auth_token=token)
        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    media_type = content_type.split(";")[0].strip() if content_type else "video/mp2t"
    if path.endswith(".ts"):
        media_type = "video/mp2t"
    return Response(content=content, media_type=media_type, headers={"Cache-Control": "no-store"})


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
