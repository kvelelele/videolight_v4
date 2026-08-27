# Dokploy development environment — design

**Date:** 2026-08-27  
**Status:** approved direction (Compose from Git, branch `dev`)  
**Domain:** `dev-videolight.dokploy.gcexp.ru`  
**Dokploy panel:** `https://dokploy.gcexp.ru`

## Goal

Provision a Dokploy **development** environment that auto-builds this app from Git branch `dev` and serves it at `https://dev-videolight.dokploy.gcexp.ru`.

## Context

- Repo already has root `Dockerfile` (frontend Vite build + Python/uvicorn API on port 8000) and `docker-compose.yml` (service `app`, volume `videolight-data`, no host port bind — Traefik-friendly).
- Remote: `https://github.com/kvelelele/videolight_v4.git`
- Branch `dev` does **not** exist yet; must be created from `main` and pushed before first deploy.
- Auth to Dokploy: API token (stored only in local env / session; not committed).

## Architecture

```
GitHub (branch: dev)
        │
        ▼
Dokploy Compose service  ──►  docker compose build/up
        │
        ▼
Container `app` :8000  (SPA static + FastAPI)
        │
        ▼
Traefik / Dokploy domain
  host: dev-videolight.dokploy.gcexp.ru
  https: Let's Encrypt
  target: service `app`, port 8000
```

## Dokploy layout

| Resource | Value |
|----------|--------|
| Project | Prefer existing Videolight / related project if present; else create `videolight` |
| Environment | `development` (or `dev`) |
| Service type | **Compose** (`docker-compose`) |
| Source | GitHub `kvelelele/videolight_v4` |
| Branch | `dev` |
| Compose path | `docker-compose.yml` (repo root) |
| App/service name | `videolight-dev` (Dokploy) / compose service `app` |
| Domain | `dev-videolight.dokploy.gcexp.ru` |
| Domain target | compose service name `app`, port `8000`, HTTPS + Let's Encrypt |

## Configuration

Environment variables on the Compose service (override compose defaults where needed):

| Variable | Value |
|----------|--------|
| `JWT_SECRET` | Random secret generated at provision time (not committed) |
| `DATABASE_URL` | `sqlite:///./data/videolight.db` (same as compose default) |

Persistent data: existing named volume `videolight-data` → `/app/data`.

## Git workflow

1. Create local branch `dev` from current `main`.
2. Push `dev` to `origin`.
3. Point Dokploy Compose source at branch `dev` (auto-deploy on push if Dokploy GitHub integration supports it; otherwise manual deploy after push).

No application code changes required for this environment beyond branch existence and Dokploy resources.

## Error handling / ops

- If GitHub provider is not connected in Dokploy, fall back to `sourceType: git` with the public HTTPS URL (or document that a GitHub App connection is required for private repos).
- If project/environment already exists, reuse IDs; do not duplicate.
- After successful deploy, verify `https://dev-videolight.dokploy.gcexp.ru` returns the app (HTTP 200 / login page).
- Rotate the Dokploy API token after provisioning (token was shared in chat).

## Out of scope

- Production environment / production domain
- Changing app architecture, DB engine, or CI beyond Dokploy deploy
- Committing secrets (`.env`, API tokens, JWT values)

## Success criteria

1. Branch `dev` exists on `origin`.
2. Dokploy Compose service builds from `dev` using repo `docker-compose.yml`.
3. `https://dev-videolight.dokploy.gcexp.ru` serves the app over HTTPS.
4. Data volume persists across redeploys.
