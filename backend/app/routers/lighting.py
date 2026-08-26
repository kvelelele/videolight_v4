from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.lighting.drivers import factory as driver_factory
from app.lighting.engine import ScenarioEngine
from app.models import Camera, CameraControllerLink, LightingController, User
from app.schemas import (
    LightingCommandRequest,
    LightingControllerCreate,
    LightingControllerOut,
    LightingControllerUpdate,
    LightingTestResponse,
    PresenceEvent,
)

router = APIRouter(prefix="/api/lighting", tags=["lighting"])


class CameraIdsBody(BaseModel):
    cameraIds: list[str]


def get_lighting_engine(request: Request) -> ScenarioEngine:
    return request.app.state.lighting_engine


def _to_out(controller: LightingController, engine: ScenarioEngine) -> LightingControllerOut:
    camera_ids = [link.camera_id for link in controller.camera_links]
    return LightingControllerOut(
        id=controller.id,
        name=controller.name,
        type=controller.type,
        host=controller.host,
        port=controller.port,
        username=controller.username,
        passwordSet=True,
        offDelaySec=controller.off_delay_sec,
        enabled=controller.enabled,
        status=controller.status,
        lastError=controller.last_error,
        cameraIds=camera_ids,
        lightOn=engine.light_on(controller.id),
    )


def _get_controller_or_404(db: Session, controller_id: str) -> LightingController:
    controller = db.scalars(
        select(LightingController)
        .where(LightingController.id == controller_id)
        .options(selectinload(LightingController.camera_links))
    ).first()
    if controller is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Controller not found")
    return controller


def _set_camera_ids(db: Session, controller: LightingController, camera_ids: list[str]) -> None:
    unique_ids = list(dict.fromkeys(camera_ids))
    for camera_id in unique_ids:
        if db.get(Camera, camera_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Camera not found: {camera_id}",
            )
    controller.camera_links.clear()
    for camera_id in unique_ids:
        controller.camera_links.append(
            CameraControllerLink(camera_id=camera_id, controller_id=controller.id)
        )


@router.get("/controllers", response_model=list[LightingControllerOut])
def list_controllers(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> list[LightingControllerOut]:
    controllers = db.scalars(
        select(LightingController)
        .options(selectinload(LightingController.camera_links))
        .order_by(LightingController.name)
    ).all()
    return [_to_out(c, engine) for c in controllers]


@router.post("/controllers", response_model=LightingControllerOut, status_code=status.HTTP_201_CREATED)
def create_controller(
    body: LightingControllerCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> LightingControllerOut:
    controller = LightingController(
        name=body.name,
        type=body.type,
        host=body.host,
        port=body.port,
        username=body.username,
        password=body.password,
        off_delay_sec=body.offDelaySec,
        enabled=body.enabled,
    )
    db.add(controller)
    db.flush()
    _set_camera_ids(db, controller, body.cameraIds)
    db.commit()
    db.refresh(controller)
    return _to_out(_get_controller_or_404(db, controller.id), engine)


@router.get("/controllers/{controller_id}", response_model=LightingControllerOut)
def get_controller(
    controller_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> LightingControllerOut:
    return _to_out(_get_controller_or_404(db, controller_id), engine)


@router.patch("/controllers/{controller_id}", response_model=LightingControllerOut)
def update_controller(
    controller_id: str,
    body: LightingControllerUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> LightingControllerOut:
    controller = _get_controller_or_404(db, controller_id)
    data = body.model_dump(exclude_unset=True)
    camera_ids = data.pop("cameraIds", None)
    password = data.pop("password", None)
    field_map = {"offDelaySec": "off_delay_sec"}
    for key, value in data.items():
        setattr(controller, field_map.get(key, key), value)
    if password:
        controller.password = password
    if camera_ids is not None:
        _set_camera_ids(db, controller, camera_ids)
    db.commit()
    engine.ensure_controller_config(
        controller.id,
        enabled=controller.enabled,
        off_delay_sec=controller.off_delay_sec,
    )
    return _to_out(_get_controller_or_404(db, controller_id), engine)


@router.delete("/controllers/{controller_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_controller(
    controller_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> None:
    controller = _get_controller_or_404(db, controller_id)
    db.delete(controller)
    db.commit()
    engine.forget_controller(controller_id)


@router.put("/controllers/{controller_id}/cameras", response_model=LightingControllerOut)
def replace_controller_cameras(
    controller_id: str,
    body: CameraIdsBody,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> LightingControllerOut:
    controller = _get_controller_or_404(db, controller_id)
    _set_camera_ids(db, controller, body.cameraIds)
    db.commit()
    return _to_out(_get_controller_or_404(db, controller_id), engine)


@router.post("/controllers/{controller_id}/test", response_model=LightingTestResponse)
async def test_controller(
    controller_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LightingTestResponse:
    controller = _get_controller_or_404(db, controller_id)
    result = await driver_factory.build_driver(controller).test()
    controller.status = result.status
    controller.last_error = None if result.ok else (result.message or None)
    db.commit()
    return LightingTestResponse(success=result.ok, message=result.message, status=result.status)


@router.post("/controllers/{controller_id}/command", response_model=LightingControllerOut)
async def command_controller(
    controller_id: str,
    body: LightingCommandRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> LightingControllerOut:
    controller = _get_controller_or_404(db, controller_id)
    engine.ensure_controller_config(
        controller_id,
        enabled=controller.enabled,
        off_delay_sec=controller.off_delay_sec,
    )
    result = await engine.set_manual(controller_id, on=body.action == "on")
    controller.status = result.status
    controller.last_error = None if result.ok else (result.message or None)
    db.commit()
    return _to_out(_get_controller_or_404(db, controller_id), engine)


@router.post("/presence", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_presence(
    body: PresenceEvent,
    _: User = Depends(get_current_user),
    engine: ScenarioEngine = Depends(get_lighting_engine),
) -> None:
    await engine.ingest_presence(body.cameraId, body.present, now=body.ts)
