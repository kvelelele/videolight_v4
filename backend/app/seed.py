from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Camera, User


DEMO_CAMERAS = [
    {
        "id": "cam-1",
        "name": "Офис — вход",
        "location": "Главный вход, 1 этаж",
        "source_type": "RTSP",
        "source_url": "rtsp://192.168.1.100:554/stream1",
        "status": "online",
        "last_connected": "2025-03-15 14:32:10",
        "resolution": "1920 × 1080",
        "fps": 25,
        "scene_type": "office",
    },
    {
        "id": "cam-2",
        "name": "Офис — open space",
        "location": "Open Space, 2 этаж",
        "source_type": "IP Camera",
        "source_url": "http://192.168.1.101:8080/video",
        "status": "online",
        "last_connected": "2025-03-15 14:32:08",
        "resolution": "1920 × 1080",
        "fps": 30,
        "scene_type": "office",
    },
    {
        "id": "cam-3",
        "name": "Переговорная",
        "location": "Переговорная A, 2 этаж",
        "source_type": "RTSP",
        "source_url": "rtsp://192.168.1.102:554/stream2",
        "status": "connecting",
        "last_connected": "2025-03-15 14:25:00",
        "resolution": "1280 × 720",
        "fps": 20,
        "scene_type": "office",
    },
    {
        "id": "cam-4",
        "name": "Парковка — въезд",
        "location": "Въезд на парковку, -1 этаж",
        "source_type": "HTTP",
        "source_url": "http://192.168.1.200:8080/mjpeg",
        "status": "online",
        "last_connected": "2025-03-15 14:31:55",
        "resolution": "1920 × 1080",
        "fps": 15,
        "scene_type": "parking",
    },
]


def seed_if_empty(db: Session) -> None:
    has_users = db.scalar(select(User.id).limit(1)) is not None
    if not has_users:
        db.add(
            User(
                email="admin@visioncontrol.com",
                name="Алексей Смирнов",
                password_hash=hash_password("admin123"),
                role="admin",
            )
        )

    has_cameras = db.scalar(select(Camera.id).limit(1)) is not None
    if not has_cameras:
        for cam in DEMO_CAMERAS:
            db.add(Camera(**cam))

    db.commit()
