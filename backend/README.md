# Vision Control API

SQLite + FastAPI backend for auth and cameras.

## Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r requirements.txt
# macOS/Linux:
# .venv/bin/pip install -r requirements.txt
```

## Run

```bash
# from backend/
.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Or from repo root: `npm run dev:api`

Seeded admin: `admin@visioncontrol.com` / `admin123`

DB file: `backend/data/videolight.db`
