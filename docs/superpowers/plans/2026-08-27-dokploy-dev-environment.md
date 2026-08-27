# Dokploy Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision a Dokploy Compose service that builds from Git branch `dev` and serves the app at `https://dev-videolight.dokploy.gcexp.ru`.

**Architecture:** Reuse the repo’s root `Dockerfile` + `docker-compose.yml`. Create branch `dev` from `main`, push it, then via Dokploy API create/reuse project + `development` environment, create a Compose service pointed at GitHub branch `dev`, set env/`JWT_SECRET`, attach the domain to compose service `app` port `8000`, and deploy.

**Tech Stack:** Dokploy API (`https://dokploy.gcexp.ru`), Docker Compose, GitHub (`kvelelele/videolight_v4`), Traefik/Let’s Encrypt via Dokploy domains.

## Global Constraints

- Dokploy panel base URL: `https://dokploy.gcexp.ru`
- App domain: `dev-videolight.dokploy.gcexp.ru`
- Git branch: `dev` (create from `main` if missing)
- Compose file path: `docker-compose.yml` (repo root)
- Compose service name inside file: `app`
- Container port: `8000`
- Auth header: `x-api-key: $env:DOKPLOY_API_KEY` (never commit the key; never print it)
- Do not commit secrets (API key, `JWT_SECRET`)
- Prefer reusing an existing Dokploy project named like `videolight` / `Videolight` over creating duplicates
- User must approve git push / commits that touch the remote

---

## File map

| Path | Responsibility |
|------|----------------|
| `docs/superpowers/specs/2026-08-27-dokploy-dev-environment-design.md` | Approved design (read-only reference) |
| `docs/superpowers/plans/2026-08-27-dokploy-dev-environment.md` | This plan |
| `docker-compose.yml` | Deployable compose (modify only if Dokploy requires `dokploy-network`) |
| Git branch `dev` on `origin` | Source of truth for the environment builds |

No application source changes are required unless domain routing fails without `dokploy-network`.

---

### Task 1: Create and push Git branch `dev`

**Files:**
- Create: git branch `dev` (from `main`)
- Modify: none in working tree required
- Test: `git ls-remote --heads origin dev`

**Interfaces:**
- Consumes: current `main` at `origin`
- Produces: remote branch `origin/dev` containing current Docker setup

- [ ] **Step 1: Confirm clean enough state for branching**

```powershell
git status -sb
git branch --show-current
```

Expected: on `main` (or note current branch). Uncommitted work is OK to leave uncommitted; branch `dev` from latest committed `main`.

- [ ] **Step 2: Create local `dev` from `main`**

```powershell
git fetch origin
git branch dev origin/main
git checkout dev
```

Expected: `dev` checked out, tracking will be set on push.

- [ ] **Step 3: Push `dev` to origin (requires user-approved network/git push)**

```powershell
git push -u origin dev
```

Expected: `origin/dev` exists.

- [ ] **Step 4: Verify remote branch**

```powershell
git ls-remote --heads origin dev
```

Expected: one line with `refs/heads/dev`.

---

### Task 2: Authenticate Dokploy API and inventory existing resources

**Files:**
- Create: none (session env only)
- Modify: none
- Test: `GET /api/project.all` returns HTTP 200 JSON

**Interfaces:**
- Consumes: Dokploy API key in `$env:DOKPLOY_API_KEY` (set by operator; do not echo)
- Produces: `$ProjectId`, `$EnvironmentId` candidates; knowledge of whether GitHub provider exists

- [ ] **Step 1: Set API key in the shell session without printing it**

```powershell
# Operator pastes key once; do not Write-Host / echo the value
$env:DOKPLOY_API_KEY = "<PASTE_KEY_HERE>"
$env:DOKPLOY_URL = "https://dokploy.gcexp.ru"
```

- [ ] **Step 2: List projects**

```powershell
curl.exe -sS "$env:DOKPLOY_URL/api/project.all" -H "x-api-key: $env:DOKPLOY_API_KEY" -o project-all.json
Get-Content project-all.json -TotalCount 40
```

Expected: HTTP success JSON listing projects (check exit code 0; file non-empty). Look for a project whose `name` matches / contains `videolight` (case-insensitive).

- [ ] **Step 3: List GitHub providers (optional path for sourceType github)**

```powershell
curl.exe -sS "$env:DOKPLOY_URL/api/github.githubProviders" -H "x-api-key: $env:DOKPLOY_API_KEY" -o github-providers.json
Get-Content github-providers.json -TotalCount 40
```

Expected: either a provider with `githubId`, or empty/error → use `sourceType: git` + `customGitUrl` in Task 4.

- [ ] **Step 4: Record IDs for later tasks**

Parse `project-all.json` and set session variables (adjust property names to match actual payload: often `projectId` / `id`, nested `environments`):

```powershell
# Example shape — adjust after inspecting JSON
$projects = Get-Content project-all.json -Raw | ConvertFrom-Json
$project = $projects | Where-Object { $_.name -match 'videolight' } | Select-Object -First 1
$env:DOKPLOY_PROJECT_ID = $project.projectId
# If environments nested:
$devEnv = $project.environments | Where-Object { $_.name -match '^(development|dev)$' } | Select-Object -First 1
if ($devEnv) { $env:DOKPLOY_ENVIRONMENT_ID = $devEnv.environmentId }
```

Expected: `$env:DOKPLOY_PROJECT_ID` set if reuse; `$env:DOKPLOY_ENVIRONMENT_ID` set if `development`/`dev` already exists.

- [ ] **Step 5: Delete local JSON dumps that may contain internal IDs if desired**

```powershell
Remove-Item -ErrorAction SilentlyContinue project-all.json, github-providers.json
```

---

### Task 3: Ensure Dokploy project + `development` environment

**Files:**
- Create: Dokploy remote resources only
- Modify: none in git
- Test: environment exists and `$env:DOKPLOY_ENVIRONMENT_ID` is set

**Interfaces:**
- Consumes: `$env:DOKPLOY_PROJECT_ID` or creates project `videolight`
- Produces: `$env:DOKPLOY_ENVIRONMENT_ID` for Compose creation

- [ ] **Step 1: Create project if missing**

If `$env:DOKPLOY_PROJECT_ID` is empty:

```powershell
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/project.create" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"videolight\",\"description\":\"Videolight camera/lighting app\"}" `
  -o project-create.json
Get-Content project-create.json
```

Parse and set `$env:DOKPLOY_PROJECT_ID` from response (`projectId` or `id`).

Expected: project created or already present.

- [ ] **Step 2: Create environment `development` if missing**

If `$env:DOKPLOY_ENVIRONMENT_ID` is empty:

```powershell
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/environment.create" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"development\",\"description\":\"Dev builds from branch dev\",\"projectId\":\"$env:DOKPLOY_PROJECT_ID\"}" `
  -o environment-create.json
Get-Content environment-create.json
```

Parse and set `$env:DOKPLOY_ENVIRONMENT_ID`.

If create returns empty `{}`, re-fetch `project.all` / `project.one` and resolve the new environment id.

Expected: `$env:DOKPLOY_ENVIRONMENT_ID` non-empty.

- [ ] **Step 3: Verify by re-listing project**

```powershell
curl.exe -sS "$env:DOKPLOY_URL/api/project.all" -H "x-api-key: $env:DOKPLOY_API_KEY" -o project-all.json
# Confirm project + development environment present, then:
Remove-Item -ErrorAction SilentlyContinue project-all.json, project-create.json, environment-create.json
```

---

### Task 4: Create Compose service linked to branch `dev`

**Files:**
- Create: Dokploy Compose service `videolight-dev`
- Modify: none in git (unless Step 5 requires compose network fix — then Task 6)
- Test: Compose resource exists with branch `dev` and path `./docker-compose.yml`

**Interfaces:**
- Consumes: `$env:DOKPLOY_ENVIRONMENT_ID`
- Produces: `$env:DOKPLOY_COMPOSE_ID`

- [ ] **Step 1: Create compose service**

```powershell
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/compose.create" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"videolight-dev\",\"description\":\"Dev environment from branch dev\",\"environmentId\":\"$env:DOKPLOY_ENVIRONMENT_ID\",\"composeType\":\"docker-compose\",\"appName\":\"videolight-dev\"}" `
  -o compose-create.json
Get-Content compose-create.json
```

Parse `$env:DOKPLOY_COMPOSE_ID` from `composeId` / `id`. If body is `{}`, list composes for the environment (e.g. reopen project payload) and pick `videolight-dev`.

Expected: compose id captured.

- [ ] **Step 2: Generate JWT secret (do not print full value in logs)**

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$jwt = [Convert]::ToBase64String($bytes)
$env:JWT_SECRET = $jwt
# env file content for Dokploy (KEY=value lines)
$envFile = "JWT_SECRET=$jwt`nDATABASE_URL=sqlite:///./data/videolight.db"
```

- [ ] **Step 3: Update compose — preferred GitHub provider path**

If Task 2 found a `githubId`:

```powershell
# Fill owner/repository/githubId from providers + repo
$body = @{
  composeId   = $env:DOKPLOY_COMPOSE_ID
  sourceType  = "github"
  owner       = "kvelelele"
  repository  = "videolight_v4"
  branch      = "dev"
  composePath = "./docker-compose.yml"
  autoDeploy  = $true
  env         = $envFile
  githubId    = $env:DOKPLOY_GITHUB_ID
} | ConvertTo-Json
$body | Set-Content -Encoding utf8 compose-update.json
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/compose.update" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@compose-update.json" `
  -o compose-update-result.json
Get-Content compose-update-result.json
```

- [ ] **Step 4: Fallback — custom Git URL if no GitHub provider**

```powershell
$body = @{
  composeId        = $env:DOKPLOY_COMPOSE_ID
  sourceType       = "git"
  customGitUrl     = "https://github.com/kvelelele/videolight_v4.git"
  customGitBranch  = "dev"
  composePath      = "./docker-compose.yml"
  autoDeploy       = $true
  env              = $envFile
} | ConvertTo-Json
$body | Set-Content -Encoding utf8 compose-update.json
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/compose.update" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@compose-update.json" `
  -o compose-update-result.json
Get-Content compose-update-result.json
```

Expected: update succeeds; compose points at `dev` and `./docker-compose.yml`.

- [ ] **Step 5: Scrub temp files containing secrets**

```powershell
Remove-Item -ErrorAction SilentlyContinue compose-create.json, compose-update.json, compose-update-result.json
Clear-Variable jwt, envFile -ErrorAction SilentlyContinue
```

---

### Task 5: Attach domain and deploy

**Files:**
- Create: Dokploy domain resource
- Modify: none in git
- Test: HTTPS GET to the domain returns app HTML (not Traefik 404)

**Interfaces:**
- Consumes: `$env:DOKPLOY_COMPOSE_ID`
- Produces: live URL `https://dev-videolight.dokploy.gcexp.ru`

- [ ] **Step 1: Create domain**

```powershell
$body = @{
  host            = "dev-videolight.dokploy.gcexp.ru"
  path            = "/"
  port            = 8000
  https           = $true
  certificateType = "letsencrypt"
  domainType      = "compose"
  composeId       = $env:DOKPLOY_COMPOSE_ID
  serviceName     = "app"
} | ConvertTo-Json
$body | Set-Content -Encoding utf8 domain-create.json
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/domain.create" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@domain-create.json" `
  -o domain-create-result.json
Get-Content domain-create-result.json
Remove-Item domain-create.json, domain-create-result.json
```

Expected: domain created without validation errors.

- [ ] **Step 2: Deploy compose**

```powershell
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/compose.deploy" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  -d "{\"composeId\":\"$env:DOKPLOY_COMPOSE_ID\"}" `
  -o compose-deploy.json
Get-Content compose-deploy.json
Remove-Item -ErrorAction SilentlyContinue compose-deploy.json
```

Expected: deploy accepted. Build may take several minutes (npm ci + pip + ffmpeg).

- [ ] **Step 3: Poll until site responds**

```powershell
for ($i = 0; $i -lt 30; $i++) {
  $code = curl.exe -sS -o NUL -w "%{http_code}" --max-time 20 "https://dev-videolight.dokploy.gcexp.ru/"
  Write-Host "attempt $($i+1): $code"
  if ($code -eq "200" -or $code -eq "302" -or $code -eq "401") { break }
  Start-Sleep -Seconds 20
}
```

Expected: eventually `200` (or app redirect/`401` if auth gate). Not endless `404`/`502`.

- [ ] **Step 4: Spot-check HTML title/body**

```powershell
curl.exe -sS --max-time 20 "https://dev-videolight.dokploy.gcexp.ru/" | Select-Object -First 20
```

Expected: SPA/shell HTML from this app (not Dokploy marketing page).

- [ ] **Step 5: Remind operator to rotate Dokploy API key**

Tell the user to revoke/regenerate the key that was pasted in chat after success.

---

### Task 6 (conditional): Fix compose networking if domain never routes

**Files:**
- Modify: `docker-compose.yml` only if Task 5 Step 3 stays `404`/`gateway` after a successful container start
- Test: redeploy + HTTPS 200

**Interfaces:**
- Consumes: failure evidence from Task 5
- Produces: updated compose on branch `dev` with external `dokploy-network` if required by this Dokploy version

- [ ] **Step 1: Confirm failure mode**

If containers are up in Dokploy UI but domain still fails, proceed. If build failed, fix build logs first — do not change networking.

- [ ] **Step 2: Update `docker-compose.yml` on `dev`**

Replace file contents with:

```yaml
services:
  app:
    build: .
    expose:
      - "8000"
    environment:
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      DATABASE_URL: sqlite:///./data/videolight.db
    volumes:
      - videolight-data:/app/data
    networks:
      - dokploy-network
    restart: unless-stopped

volumes:
  videolight-data:

networks:
  dokploy-network:
    external: true
```

- [ ] **Step 3: Commit and push on `dev` (only if user approved commits/push)**

```powershell
git add docker-compose.yml
git commit -m "fix(docker): attach dokploy-network for Traefik routing"
git push origin dev
```

- [ ] **Step 4: Redeploy and re-run Task 5 Steps 2–4**

```powershell
curl.exe -sS -X POST "$env:DOKPLOY_URL/api/compose.deploy" `
  -H "x-api-key: $env:DOKPLOY_API_KEY" `
  -H "Content-Type: application/json" `
  -d "{\"composeId\":\"$env:DOKPLOY_COMPOSE_ID\"}"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Branch `dev` on origin | Task 1 |
| Project + development environment | Tasks 2–3 |
| Compose from Git / branch `dev` / `docker-compose.yml` | Task 4 |
| `JWT_SECRET` + sqlite `DATABASE_URL` | Task 4 |
| Domain `dev-videolight.dokploy.gcexp.ru` → `app:8000` HTTPS | Task 5 |
| Deploy + verify HTTPS | Task 5 |
| Volume persistence | unchanged compose volume; verified by not removing volume |
| Token rotation reminder | Task 5 Step 5 |
| Optional Traefik network fix | Task 6 |

No TBD/placeholder steps remain.
