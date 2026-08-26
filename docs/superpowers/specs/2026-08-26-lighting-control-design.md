# Lighting control — presence-based automation

**Date:** 2026-08-26  
**Status:** Draft (awaiting user review)  
**Related:** client MediaPipe tracking (`2026-08-26-client-mediapipe-tracking-design.md`)

## Goal

Turn lights on when a camera sees a **person** or **vehicle** (class presence, not motion), and turn them off after a configurable quiet period (default 60s) when no linked camera still reports presence.

MVP drives **STAR Imperium-1** (DALI over HTTP). Architecture must also fit **STAR Spectrum-1** (DMX over HTTP) without a second entity model.

## Non-goals (MVP)

- 24/7 server-side detection (no open browser)
- Full DMX / Spectrum driver implementation
- Separate Zone entity
- Dimming / scenes beyond all-on / all-off
- Command history, schedules, “hold on / pause automation” modes

## Decisions

| Topic | Choice |
|-------|--------|
| Control path | Browser presence → backend ScenarioEngine → driver → controller |
| Binding | Controllers as first-class entities; many-to-many with cameras |
| Multi-camera | **OR**: light stays on while any linked camera has presence |
| Off delay | Per controller, default 60s, editable in UI |
| Manual controls | Test connectivity + manual on/off (no hold/pause yet) |
| Future headless | Same engine; add server `PresenceSource` later |

## Architecture

```
PresenceSource (MVP: browser MediaPipe)
        │  POST /api/lighting/presence
        ▼
 ScenarioEngine (PresenceLighting)
        │  desired on/off per controller
        ▼
 LightingDriver (interface)
   ├─ ImperiumDriver  (MVP)
   └─ SpectrumDriver  (stub / later)
        ▼
 STAR Imperium-1 / Spectrum-1 (LAN HTTP)
```

Browser never talks to controllers directly (auth, retries, no CORS). CRUD and commands go through the FastAPI backend.

### Unified controller model

DALI and DMX share **one** persisted entity and **one** driver interface. Type selects the driver; fields that differ (port defaults, command payloads) live in the driver, not in parallel tables.

```text
LightingController (entity)
  type: imperium | spectrum
       │
       ├─► ImperiumDriver
       └─► SpectrumDriver
```

Adding a new controller family = new `type` enum value + new driver class implementing the same interface. No second “controller product” table.

## Data model

### `LightingController` (SQLite)

| Field | Notes |
|-------|--------|
| `id` | PK |
| `name` | Display name |
| `type` | `imperium` \| `spectrum` |
| `host` | IP or hostname |
| `port` | Default 90 for Imperium |
| `username` / `password` | Default `TRION` / `TRION1`; editable; password never returned in API (use `passwordSet`) |
| `off_delay_sec` | Default 60 |
| `enabled` | Soft disable without delete |
| `status` | `unknown` \| `online` \| `offline` \| `error` |
| `last_error` | Short last failure message (optional) |
| `updated_at` | |

### `CameraControllerLink`

| Field | Notes |
|-------|--------|
| `camera_id` | FK → Camera |
| `controller_id` | FK → LightingController |
| Unique `(camera_id, controller_id)` | |

### Runtime (in-memory on backend process)

Per controller:

- `desired_on: bool`
- `last_command_at`
- Per linked camera: `last_present: bool`, `last_heartbeat_at`

Not required in DB for MVP; OK to lose on process restart (next presence/heartbeat re-converges). Optionally persist `desired_on` later.

## ScenarioEngine — PresenceLighting

1. Ingest presence for `cameraId`.
2. Resolve all controllers linked to that camera (skip `enabled=false`).
3. For each controller, compute OR across **all** linked cameras’ presence (stale heartbeats count as absent after **20s** grace without heartbeat/edge update).
4. If OR true and lights off → `driver.turn_on()`.
5. If OR false → start/continue off timer using that controller’s `off_delay_sec`; when elapsed → `driver.turn_off()`.
6. Presence again while timer running → cancel timer, ensure on.

Manual `command` on/off updates desired state immediately; subsequent presence continues to drive automation (no pause mode in MVP).

## Drivers

### Interface

```text
test() -> online | offline | error
turn_on() -> ok | error
turn_off() -> ok | error
```

### ImperiumDriver (MVP)

- Basic auth (stored credentials).
- Availability: `GET http://{host}:{port}/api_dali/is` → body `"1"`, HTTP 200.
- All on: `GET .../api_dali/dali_command?channel=1&ID=65&d_send=1&param=10`
- All off: same with `param=0`

Timeouts and short retries with backoff; failures set controller `status`/`last_error` without crashing the engine.

### SpectrumDriver

Stub implementing the same interface. In MVP UI the `spectrum` type is visible but disabled with label «скоро».

## API (backend)

| Method | Purpose |
|--------|---------|
| `GET/POST /api/lighting/controllers` | List / create |
| `GET/PATCH/DELETE /api/lighting/controllers/{id}` | Read / update / delete |
| `PUT /api/lighting/controllers/{id}/cameras` | Replace linked camera IDs |
| `POST /api/lighting/controllers/{id}/test` | Reachability check |
| `POST /api/lighting/controllers/{id}/command` | `{ "action": "on" \| "off" }` |
| `POST /api/lighting/presence` | `{ cameraId, present, classes?, ts }` |

List/detail responses include `cameraIds`, `passwordSet`, and runtime `lightOn` (from ScenarioEngine memory; `false` after restart until next command/presence).

Auth: CRUD/test/command — admin (same as camera admin). Presence — any authenticated user (viewer with open camera stream).

## Client integration

- Derive presence from existing `DetectionFrame.tracks`: any `person` or `car` (bus/truck already mapped to `car` in the worker).
- Emit on **edge** (present ↔ absent) plus **heartbeat** every ~5–10s while present.
- When analytics stops / tab closes: server marks camera quiet after heartbeat grace → OR + off delay as usual.
- Lighting automation only runs while some client is producing presence for that camera (documented limitation until server PresenceSource exists).

## UI

Settings page gains tabs: **Камеры** | **Освещение**.

### Lighting tab

- Short Russian intro explaining presence (not motion) behavior.
- Controller table/list: name, type label (STAR Imperium-1 / Spectrum-1), IP, status, light on/off, linked camera count, off delay.
- Row actions: Проверить, Вкл, Выкл, Изменить, Удалить.
- Add controller button.

### Controller modal

- Name, type (`imperium` active; `spectrum` disabled “скоро”).
- Host, port, username, password (placeholders for defaults).
- Off-delay control with helper text.
- Camera multi-select; empty state warns that automation needs ≥1 camera.
- Optional connectivity check on save.

### Live cameras view

- Subtle status chip when the camera has lighting links (e.g. presence automation active / light on) — no extra overlay clutter on detection boxes.

Copy stays friendly; avoid raw DALI jargon in primary labels (product name in secondary text).

## Extension path

| Later feature | How it plugs in |
|---------------|-----------------|
| Headless / 24/7 | New `PresenceSource` posting the same presence events (or internal call into ScenarioEngine) |
| Spectrum-1 | Implement `SpectrumDriver`; enable type in UI |
| Zones | Optional grouping entity above M2M; engine still OR/AND over membership |
| Hold / pause | Flag on controller; engine skips auto writes while set |
| More scenarios | Additional scenario modules sharing drivers |

## Testing

- Unit: ScenarioEngine OR + off-delay (fake clock, no HTTP).
- Unit: ImperiumDriver URL building and auth headers (mocked HTTP).
- Manual: UI test/on/off; presence with person/car in frame turns lights on; quiet period turns off.

## Success criteria

1. Admin can add an Imperium controller by IP, test it, manually on/off.
2. Link one or more cameras; with analytics open, person/car presence turns linked lights on.
3. After all linked cameras quiet for `off_delay_sec`, lights turn off.
4. Two cameras on one controller: presence on either keeps lights on (OR).
5. Spectrum is representable as the same entity type without schema redesign.
