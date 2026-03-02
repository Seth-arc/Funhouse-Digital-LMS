# Quick Acceptance Smoke Check

Use this checklist before user testing and after every deployment.

## 1. Startup and Health

- [ ] `server/.env` includes `JWT_SECRET` and `CORS_ORIGIN`.
- [ ] `npm run dev` starts backend on `http://localhost:5000` and frontend on `http://localhost:3000`.
- [ ] `GET /api/health` returns status `ok`.

## 2. Auth Bootstrap Safety

- [ ] With `ALLOW_INITIAL_TUTOR_SIGNUP=true` and no tutor in DB, `POST /api/auth/register` can create the first tutor.
- [ ] After setting `ALLOW_INITIAL_TUTOR_SIGNUP=false`, the same endpoint returns `403`.
- [ ] `POST /api/auth/login` returns a valid staff JWT for the tutor account.

## 3. Role-Based Smoke Flow

- [ ] Tutor creates a student with a valid learner PIN (4-8 digits).
- [ ] Learner can sign in via `POST /api/auth/learner-login`.
- [ ] Learner can load own progress and lessons.
- [ ] Learner token is rejected on tutor-only endpoints (expect `403` or `401`).
- [ ] Tutor creates invite (`POST /api/auth/invite`) and invited user completes `POST /api/auth/accept-invite`.

## 4. Core Product Flow

- [ ] Tutor creates at least one game and one lesson.
- [ ] Tutor assigns a lesson to a learner.
- [ ] Learner completes one game and progress updates are visible.
- [ ] Feedback submission works and is visible to tutor.
- [ ] Notifications/interventions endpoints respond without server errors.

## 5. Railway Smoke Flow

- [ ] Railway build command runs: `npm run railway:build`.
- [ ] Railway start command runs: `npm run railway:start`.
- [ ] Deployed service returns healthy response at `/api/health`.
- [ ] Requests from deployed frontend origin succeed without CORS errors.

## 6. Supabase Deployment Gate (Initial User Testing)

- [ ] Run `npm run audit:deploy:supabase` and resolve all blocking failures.
- [ ] Run `supabase/audit/predeploy_audit.sql` in Supabase SQL editor.
- [ ] Confirm SQL checks for missing RLS/policies and dangerous `anon` grants return zero rows.
- [ ] Confirm `ALLOW_INITIAL_TUTOR_SIGNUP=false` and `BOOTSTRAP_DEMO_ADMIN=false` in deployed env.
- [ ] Confirm no SQLite runtime dependency remains in production deployment path.
