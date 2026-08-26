import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="offline")
    last_connected: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolution: Mapped[str] = mapped_column(String(64), nullable=False, default="1920 × 1080")
    fps: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    scene_type: Mapped[str] = mapped_column(String(32), nullable=False, default="office")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class LightingController(Base):
    __tablename__ = "lighting_controllers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="imperium")
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    username: Mapped[str] = mapped_column(String(255), nullable=False, default="TRION")
    password: Mapped[str] = mapped_column(String(255), nullable=False, default="TRION1")
    off_delay_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    last_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    camera_links: Mapped[list["CameraControllerLink"]] = relationship(
        back_populates="controller", cascade="all, delete-orphan"
    )


class CameraControllerLink(Base):
    __tablename__ = "camera_controller_links"
    __table_args__ = (UniqueConstraint("camera_id", "controller_id", name="uq_camera_controller"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    controller_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lighting_controllers.id", ondelete="CASCADE"), nullable=False
    )

    controller: Mapped["LightingController"] = relationship(back_populates="camera_links")
