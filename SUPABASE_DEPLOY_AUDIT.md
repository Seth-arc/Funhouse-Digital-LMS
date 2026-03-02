# Supabase Final Deployment Audit

This audit is the release gate for initial user testing. It is designed to be run in four phases so failures are caught early and triaged by severity.

## Phase 1: Static + Build Gate (required)

Run from repo root:

```bash
npm run audit:deploy:supabase
```

Fast variant (no production build):

```bash
npm run audit:deploy:supabase -- --skip-build
```

Strict variant (warnings fail the run):

```bash
npm run audit:deploy:supabase:strict
```

What it checks:
- Required files and server security config presence.
- Environment hardening (`JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL`, tutor bootstrap gates).
- Supabase readiness blockers (SQLite dependency, missing Supabase config/migrations, missing Supabase env vars).
- TypeScript checks for `server` and `client`.
- Optional production builds for `server` and `client`.

## Phase 2: Live API Gate (required before user testing)

Set environment variables and rerun the audit command:

```bash
AUDIT_API_URL=https://<api-host>/api
AUDIT_TUTOR_TOKEN=<staff-jwt>
AUDIT_LEARNER_TOKEN=<learner-jwt>
AUDIT_LEARNER_STUDENT_ID=<learner-student-id>
AUDIT_CROSS_STUDENT_ID=<different-student-id>
```

This validates:
- `/health` response.
- Unauthenticated access blocks on protected endpoints.
- Learner token restrictions on tutor-only routes.
- Learner own-data vs cross-student data access behavior.

## Phase 3: Supabase SQL Gate (required)

Run SQL file in Supabase SQL editor:

`supabase/audit/predeploy_audit.sql`

Blocking expectation:
- Query 1 returns zero rows.
- Query 2 returns zero rows.
- Query 3 returns zero rows.
- Query 4 returns zero rows.
- Query 8 returns zero rows for production-scale data.

Review expectation:
- Query 5 extension inventory is expected and minimal.
- Query 6 policy inventory matches your intended access model.
- Query 7 realtime publication coverage matches product requirements.

## Phase 4: Release Signoff (required)

Release is approved for initial user testing only if:
- All blocking checks in phases 1-3 pass.
- No unresolved auth, RLS, or cross-tenant data access findings remain.
- Tutor bootstrap is locked (`ALLOW_INITIAL_TUTOR_SIGNUP=false`).
- Demo admin bootstrap is locked (`BOOTSTRAP_DEMO_ADMIN=false`).
- CORS allowlist is explicit and deployment-origin specific.

## Notes

- The audit script is intentionally strict for Supabase target readiness and will fail if the codebase still depends on SQLite.
- Keep audit artifacts (console output + SQL results) in deployment notes for traceability.
