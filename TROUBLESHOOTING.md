# Troubleshooting Guide

## Auth and Signup Issues

### Error: "Initial tutor signup is disabled by configuration."
- Cause: `ALLOW_INITIAL_TUTOR_SIGNUP` is `false`.
- Fix: Set `ALLOW_INITIAL_TUTOR_SIGNUP=true` temporarily only for first tutor creation, then set it back to `false`.

### Error: "Initial tutor already exists. Contact your system administrator."
- Cause: A tutor account is already present.
- Fix: Use tutor-managed account creation/invite flow instead of `/api/auth/register`.

### Error: "Invalid learner credentials"
- Cause: Wrong PIN or student lookup mismatch.
- Fix:
  - Confirm learner PIN is 4-8 digits.
  - Verify `student_id` or name/grade combination matches an existing student.
  - Reset learner PIN from tutor flow if needed.

## Token and Authorization Issues

### Error: "No token provided"
- Cause: Missing `Authorization` header.
- Fix: Send `Authorization: Bearer <jwt>`.

### Error: "Invalid token"
- Cause: Expired/malformed token or wrong secret.
- Fix:
  - Re-login to get a fresh token.
  - Confirm backend `JWT_SECRET` has not changed unexpectedly.
  - Ensure token is passed without extra quotes.

### Error: "Insufficient permissions"
- Cause: Role mismatch for route.
- Fix:
  - Tutor-only routes require tutor JWT.
  - Learner JWT can only access learner-allowed endpoints and own student data.

## CORS Issues

### Error: "CORS origin not allowed"
- Cause: Request origin is not in `CORS_ORIGIN`.
- Fix:
  - Set `CORS_ORIGIN` to exact allowed origin(s), including protocol and port.
  - For multiple origins, use comma-separated values.
  - Restart backend after changing environment variables.

Example:
```env
CORS_ORIGIN=http://localhost:3000,https://your-frontend-domain.com
```

## Railway Deployment Issues

### Build fails on Railway
- Cause: Missing build command or dependency install/build mismatch.
- Fix:
  - Use `railway.json` with build command `npm run railway:build`.
  - Confirm `server/package-lock.json` exists and is committed.

### Service exits immediately after deploy
- Cause: Missing required env vars (`JWT_SECRET`) or startup failure.
- Fix:
  - Set `JWT_SECRET` in Railway variables.
  - Review Railway logs for startup exception details.

### 502/503 or unhealthy deployment
- Cause: App did not bind to Railway-assigned port.
- Fix:
  - Keep server listening on `process.env.PORT`.
  - Use start command `npm run railway:start`.

### Frontend cannot call deployed API
- Cause: API base URL or CORS not aligned.
- Fix:
  - Set frontend `REACT_APP_API_URL=https://<railway-service-domain>/api`.
  - Add frontend origin to backend `CORS_ORIGIN`.

## Data Persistence Note

- The default SQLite file (`server/data/lms.db`) is local filesystem storage.
- On cloud redeploys without persistent volume, data can be lost.
- For durable production data, attach persistent storage or migrate to a managed database.
