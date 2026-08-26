### Task 6: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Start stack**

```bash
npm run dev:api
npm run dev
```

- [ ] **Step 2: Open a proxied/HLS camera, wait for «Загрузка модели…» → «Детекция · N»**

Expected: person/car boxes, stable IDs while moving, UI responsive.

- [ ] **Step 3: Switch cameras**

Expected: boxes clear, no stale trackIds from previous camera.

- [ ] **Step 4: Confirm `/api/cameras/{id}/detections` is gone**

```bash
curl -i -N "http://127.0.0.1:8000/api/health"
```

Expected: health ok. WebSocket detections endpoint should 404 / not exist.

- [ ] **Step 5: Commit only if verification found fixes**

If bugs fixed during verification, commit with messages like `fix: ...`. Otherwise no empty commit.

---
