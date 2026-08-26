from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


Role = Literal["admin", "user"]
SourceType = Literal["RTSP", "IP Camera", "HTTP", "USB Camera", "Web Camera"]
CameraStatus = Literal["online", "connecting", "offline", "error"]
SceneType = Literal["office", "parking"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    name: str
    role: Role


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    location: str
    source_type: SourceType = Field(serialization_alias="sourceType")
    source_url: str = Field(serialization_alias="sourceUrl")
    status: CameraStatus
    last_connected: str | None = Field(serialization_alias="lastConnected")
    resolution: str
    fps: int
    scene_type: SceneType = Field(serialization_alias="sceneType")
    created_at: datetime | None = Field(default=None, serialization_alias="createdAt")


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location: str = ""
    sourceType: SourceType
    sourceUrl: str = ""
    status: CameraStatus = "online"
    lastConnected: str | None = None
    resolution: str = "1920 × 1080"
    fps: int = 25
    sceneType: SceneType = "office"
    id: str | None = None


class CameraUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    sourceType: SourceType | None = None
    sourceUrl: str | None = None
    status: CameraStatus | None = None
    lastConnected: str | None = None
    resolution: str | None = None
    fps: int | None = None
    sceneType: SceneType | None = None


class CameraTestRequest(BaseModel):
    sourceType: SourceType
    sourceUrl: str = Field(min_length=1)


class CameraTestResponse(BaseModel):
    success: bool
    message: str


ControllerType = Literal["imperium", "spectrum"]
ControllerStatus = Literal["unknown", "online", "offline", "error"]


class LightingControllerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    type: ControllerType
    host: str
    port: int
    username: str
    passwordSet: bool = True
    offDelaySec: int = Field(validation_alias="off_delay_sec", serialization_alias="offDelaySec")
    enabled: bool
    status: ControllerStatus
    lastError: str | None = Field(default=None, validation_alias="last_error", serialization_alias="lastError")
    cameraIds: list[str] = Field(default_factory=list, serialization_alias="cameraIds")
    lightOn: bool = False


class LightingControllerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ControllerType = "imperium"
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=90, ge=1, le=65535)
    username: str = "TRION"
    password: str = "TRION1"
    offDelaySec: int = Field(default=60, ge=1, le=3600)
    enabled: bool = True
    cameraIds: list[str] = Field(default_factory=list)


class LightingControllerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ControllerType | None = None
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = None
    password: str | None = None
    offDelaySec: int | None = Field(default=None, ge=1, le=3600)
    enabled: bool | None = None
    cameraIds: list[str] | None = None


class LightingCommandRequest(BaseModel):
    action: Literal["on", "off"]


class PresenceEvent(BaseModel):
    cameraId: str
    present: bool
    classes: list[str] = Field(default_factory=list)
    ts: float | None = None


class LightingTestResponse(BaseModel):
    success: bool
    message: str
    status: ControllerStatus
