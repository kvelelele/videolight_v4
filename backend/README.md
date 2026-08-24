# Vision Control API

SQLite + FastAPI backend for auth, cameras, and video stream proxy.

## Requirements

- Python 3.11+
- [FFmpeg](https://ffmpeg.org/download.html) in `PATH` (for RTSP/IP camera streams and connection tests)

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

## Stream API

- `POST /api/cameras/test` — probe camera URL (ffprobe)
- `GET /api/cameras/{id}/stream?token=<jwt>` — MJPEG proxy for RTSP/IP/HTTP cameras
