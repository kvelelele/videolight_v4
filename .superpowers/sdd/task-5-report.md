# Task 5 Report: Remove server analytics

## Status

Removed the server-side YOLO/ByteTrack analytics pipeline. Auth, cameras, streaming, and health endpoints remain unchanged.

Commit: `b965351 chore: remove server-side detection analytics pipeline`

## Changes

- Rewrote `backend/app/main.py` — dropped analytics router and pipeline shutdown from lifespan.
- Trimmed `backend/app/config.py` — removed `analytics_*` settings.
- Trimmed `backend/requirements.txt` — removed `opencv-python-headless`, `ultralytics`, `numpy`, `supervision`.
- Deleted `backend/app/analytics/` (`__init__.py`, `capture.py`, `detector.py`, `pipeline.py`).
- Deleted `backend/app/routers/analytics.py` (WebSocket `/api/cameras/{id}/detections`).

## Verification evidence

```
cd backend
.venv/Scripts/python -c "from app.main import app; print('ok', app.title)"
```

Output: `ok Vision Control API`

Backend grep for `analytics`, `ultralytics`, `supervision`, `opencv`: no matches.

## Concerns

- Existing `.env` entries for `analytics_*` are ignored via `extra="ignore"`; safe to leave or clean up manually.
- Venv may still contain removed packages until `pip install -r requirements.txt` is run; import check passes without them loaded.
- Client analytics (Task 3/4) is unaffected; no frontend changes in this task.
