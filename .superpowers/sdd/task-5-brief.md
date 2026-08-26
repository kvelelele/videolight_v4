### Task 5: Remove server analytics

**Files:**
- Delete: `backend/app/analytics/__init__.py`
- Delete: `backend/app/analytics/capture.py`
- Delete: `backend/app/analytics/detector.py`
- Delete: `backend/app/analytics/pipeline.py`
- Delete: `backend/app/routers/analytics.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: none
- Produces: FastAPI app without analytics router; health/auth/cameras/streaming unchanged

- [ ] **Step 1: Rewrite `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
from app.routers import auth, cameras
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 2: Remove analytics settings from `backend/app/config.py`**

Keep only:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    jwt_secret: str = "dev-secret-change-me"
    database_url: str = "sqlite:///./data/videolight.db"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_algorithm: str = "HS256"


settings = Settings()
```

- [ ] **Step 3: Trim `backend/requirements.txt`**

```text
fastapi==0.141.1
uvicorn[standard]==0.52.4
sqlalchemy==2.0.52
pydantic==2.13.4
pydantic-settings==2.15.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
python-jose[cryptography]==3.5.0
python-multipart==0.0.32
email-validator==2.3.0
httpx==0.28.1
```

- [ ] **Step 4: Delete analytics files**

```bash
git rm -r backend/app/analytics
git rm backend/app/routers/analytics.py
```

- [ ] **Step 5: Verify API imports**

```bash
cd backend
.venv/Scripts/python -c "from app.main import app; print('ok', app.title)"
```

Expected: `ok Vision Control API`

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/config.py backend/requirements.txt
git commit -m "chore: remove server-side detection analytics pipeline"
```

---
