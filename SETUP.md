# Quick Setup Guide

## Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)

## Installation

1. Install dependencies:
   ```bash
   npm run install-all
   ```

2. Configure backend environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Set `JWT_SECRET` to a long random secret
   - Set `CORS_ORIGIN=http://localhost:3000` for local development
   - Set `FRONTEND_URL=http://localhost:3000` (used for OAuth callback redirects)
   - Keep `ALLOW_INITIAL_TUTOR_SIGNUP=false` by default
   - Keep `BOOTSTRAP_DEMO_ADMIN=false` by default
   - Optional calendar linking:
     - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
     - `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`
     - `MICROSOFT_TENANT_ID=common` (or your tenant ID)
     - `CALENDAR_TIMEZONE=UTC` (or your preferred IANA timezone, e.g. `Africa/Johannesburg`)
     - Add OAuth redirect URIs in provider consoles:
       - Google: `http://localhost:5000/api/calendar-integrations/google/callback`
       - Microsoft: `http://localhost:5000/api/calendar-integrations/microsoft/callback`

## Bootstrap Access (Pick One)

### Option A: One-Time Initial Tutor Signup (recommended)

1. Set `ALLOW_INITIAL_TUTOR_SIGNUP=true` in `server/.env`.
2. Start the app (`npm run dev`).
3. Create the first tutor account via `POST /api/auth/register` with `role: "tutor"`.
4. Set `ALLOW_INITIAL_TUTOR_SIGNUP=false` and restart the server.

### Option B: Local Demo Tutor (development only)

1. Set `BOOTSTRAP_DEMO_ADMIN=true` in `server/.env`.
2. Start the server once to create demo tutor credentials:
   - Email: `admin@lms.com`
   - Password: `admin123`
3. Set `BOOTSTRAP_DEMO_ADMIN=false` after local verification.

## Run the App

```bash
npm run dev
```

This starts:
- Backend API on `http://localhost:5000`
- Frontend app on `http://localhost:3000`

## Seed Sample Data (Optional)

Seed routes are tutor-protected. Use either:
- Tutor dashboard "Load Sample Data", or
- `POST /api/seed` with a tutor bearer token.

You can also run:

```bash
cd server
npm run seed
```

## Production Notes

- Public self-registration is blocked unless `ALLOW_INITIAL_TUTOR_SIGNUP=true` and no tutor exists.
- Railway deployment commands are in `railway.json`:
  - Build: `npm run railway:build`
  - Start: `npm run railway:start`
- For Supabase prelaunch audits, run `npm run audit:deploy:supabase` and follow `SUPABASE_DEPLOY_AUDIT.md`.
