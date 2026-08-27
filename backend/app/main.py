import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.lighting.drivers import factory as driver_factory
from app.lighting.engine import ControllerView, ScenarioEngine
from app.models import CameraControllerLink, LightingController
from app.routers import auth, cameras, lighting
from app.seed import seed_if_empty

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

logger = logging.getLogger(__name__)


def get_controllers_for_camera(camera_id: str) -> list[ControllerView]:
    db = SessionLocal()
    try:
        links = db.scalars(
            select(CameraControllerLink).where(CameraControllerLink.camera_id == camera_id)
        ).all()
        out = []
        for link in links:
            controller = db.get(LightingController, link.controller_id)
            if controller:
                out.append(
                    {
                        "id": controller.id,
                        "enabled": controller.enabled,
                        "off_delay_sec": controller.off_delay_sec,
                    }
                )
        return out
    finally:
        db.close()


def get_camera_ids_for_controller(controller_id: str) -> list[str]:
    db = SessionLocal()
    try:
        links = db.scalars(
            select(CameraControllerLink).where(CameraControllerLink.controller_id == controller_id)
        ).all()
        return [link.camera_id for link in links]
    finally:
        db.close()


def get_driver(controller_id: str):
    db = SessionLocal()
    try:
        controller = db.get(LightingController, controller_id)
        if controller is None:
            raise KeyError(controller_id)
        return driver_factory.build_driver(controller)
    finally:
        db.close()


async def _lighting_tick_loop(lighting_engine: ScenarioEngine) -> None:
    while True:
        await asyncio.sleep(1)
        try:
            await lighting_engine.tick()
        except Exception:
            logger.exception("lighting tick failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()

    lighting_engine = ScenarioEngine(
        get_controllers_for_camera,
        get_camera_ids_for_controller,
        get_driver,
    )
    app.state.lighting_engine = lighting_engine
    tick_task = asyncio.create_task(_lighting_tick_loop(lighting_engine))
    try:
        yield
    finally:
        tick_task.cancel()
        with suppress(asyncio.CancelledError):
            await tick_task


app = FastAPI(title="Vision Control API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(lighting.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Serve the Vite build when present (Docker / production). API routes stay first.
if STATIC_DIR.is_dir():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    async def spa_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}")
    async def spa_assets(full_path: str) -> FileResponse:
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
