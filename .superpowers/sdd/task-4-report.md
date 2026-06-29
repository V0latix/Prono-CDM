# Task 4 Report — Routes joueur `/api/tdf/*`

## Status: DONE ✓

## TDD Evidence

### RED (module not found)
```
FAIL  worker/src/tdf-routes.test.ts
Error: Cannot find module './tdf-routes' imported from ...worker/src/tdf-routes.test.ts
Test Files  1 failed (1)
Tests       no tests
```

### GREEN (after implementation)
```
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    1.12s
```

All 5 scenarios from the brief passed:
- refuse si moins de 10 coureurs ✓
- refuse les doublons ✓
- refuse un coureur inconnu ✓
- refuse après le verrou ✓
- accepte un prono valide ✓

## Full Suite + Build

```
Test Files  30 passed (30)
Tests       263 passed (263)
Duration    5.82s

vite build → ✓ built in 1.21s (zero TS errors)
```

Nothing regressed.

## Files Changed

- **Created** `worker/src/tdf-routes.ts` — 7 exported handlers:
  - `tdfRiders`, `tdfStages`, `tdfDashboard`, `tdfSaveStagePrediction`,
    `tdfSaveGrandDepart`, `tdfLeaderboard`, `tdfResults`
- **Created** `worker/src/tdf-routes.test.ts` — Miniflare real-D1 harness, 5 validation tests
- **Modified** `worker/src/routes.ts` — import + 9 route lines inserted before `throw HttpError(404)`

## Self-Review

### Brief vs Real Signatures
- `json(request, env, data, init?)` — matches real signature in `worker/src/http.ts` line 20. No conflict.
- `parseJson<T>(request)` — takes only the Request. Brief handler code is correct.
- `requireUser(ctx)` — returns User. Brief handler code is correct.

### Test Harness Deviation
Used Miniflare real-D1 pattern (from `stats-routes.test.ts`) instead of `createTestDb()` as required by the task override. Applied `0001_initial.sql` + `0012_tdf.sql`. Seeded users, stages, and riders via real INSERTs.

### Import of `recalculateTdfStagePoints`
The brief lists it as "Consumes" but none of the handler bodies shown call it. I omitted the import to avoid a TS "imported but never used" error. The function remains available in `tdf-scoring-db.ts` for future use (e.g., a sync/admin route).

### Dispatch in `route()`
Inserted just before `throw new HttpError(404, ...)` as instructed. The `/api/tdf/grand-depart` route accepts any method (PUT is expected); a method guard can be added later if needed.

### Commit
`96b5fad` — "TDF: routes joueur (pronos etape + grand depart, classement, resultats)"

---

## Review Fixes (commit `4e662b7`)

### Fix 1 — Grand-départ test coverage (4 new cases)

Added `describe("tdfSaveGrandDepart validation", ...)` in `worker/src/tdf-routes.test.ts`:
- **valid** yellow/white/green/polka → status 200 + DB row asserted ✓
- **podium non-distinct rejected** yellow `["a","a","b"]` → throws `/double|jaune/i` ✓
- **unknown rider rejected** yellow `["a","b","zzz"]` → throws `/inconnu/i` ✓
- **locked rejected** stage 1 with past `lock_at` → throws `/verrou/i` ✓

```
npx vitest run worker/src/tdf-routes.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)   ← 5 existing + 4 new
Duration    1.74s
```

### Fix 2 — Lock comment (ponytail:)

Added explicit `// ponytail:` comment above the `if (firstStage && ...)` lock check in
`tdfSaveGrandDepart` explaining that absent stage 1 = schedule not yet loaded = grand départ open.
Behavior unchanged.

### Fix 3a — Method guard in routes.ts

`/api/tdf/grand-depart` dispatch changed to:
```ts
if (pathname === "/api/tdf/grand-depart" && ctx.request.method === "PUT") return tdfSaveGrandDepart(ctx);
```

### Fix 3b — Podium length guard in tdf-routes.ts

Added guard inside `podium()` before `slice`:
```ts
if ((arr ?? []).length > 3) {
  throw new HttpError(400, `Le podium ${label} ne peut contenir que 3 coureurs.`);
}
```

### Build

```
vite build → ✓ built in 1.21s (zero TS errors)
```
