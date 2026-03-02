# Pre-Testing Task List

## Scope
This single checklist covers usability/intuitiveness upgrades and the 1-week ship-before-testing implementation plan.

## Usability and Intuitiveness

### P0 - Must Have Before Testing
- [ ] Add role-specific "Today" panels with top 3 next actions for Tutor, Teacher, Parent, and Learner.
- [ ] Add guided empty states with one-click CTA buttons on all major pages.
- [ ] Add inline form help and real-time validation on login, student creation, lesson assignment, and scheduling forms.
- [ ] Standardize primary action placement across dashboards and modals.
- [ ] Improve mobile usability (larger touch targets, simplified tables, sticky bottom actions where needed).
- [ ] Complete accessibility baseline (keyboard navigation, visible focus states, ARIA labels, color contrast checks).

### P1 - Strongly Recommended Before Testing
- [x] Add step-by-step wizards for high-friction flows (create student, assign lesson, schedule session).
- [x] Add global search and quick-jump for students, lessons, sessions, and users.
- [x] Add undo support for destructive actions (delete, unassign, cancel) with a short grace window.
- [x] Add a unified student profile timeline (sessions, notes, progress, and alerts in one place).
- [x] Add persistent filters and saved views for Tutor and Teacher dashboards.

### P2 - Nice to Have
- [x] Add autosave drafts for long forms and session notes.
- [x] Add lightweight contextual onboarding tips for first-time visits.

## Ship-Before-Testing Checklist (1-week scope)

### Day 1: Security Baseline
- [x] `auth.ts` - Remove open tutor registration; allow tutor bootstrap only behind env gate (`ALLOW_INITIAL_TUTOR_SIGNUP=false` by default).
- [x] `auth.ts` - Remove JWT fallback secret; fail startup if `JWT_SECRET` is missing.
- [x] `index.ts` - Replace `cors()` with env allowlist (`CORS_ORIGIN`), add JSON body size cap, and add request logging middleware.
- [x] `index.ts` - Block server start until `initDatabase()` succeeds (no "continue anyway" path).
- [x] `database.ts` - Disable unconditional default admin creation; gate demo account by `BOOTSTRAP_DEMO_ADMIN=true`.
- [x] `server/.env.example` - Create file with all required env vars.
- [x] `README.md` - Update auth/security setup section to match real behavior.

### Day 2: Learner Auth + Endpoint Lockdown
- [x] `database.ts` - Add `students.learner_pin_hash` migration.
- [x] `students.ts` - Require tutor-provided learner PIN on create/update; hash with `bcrypt`.
- [x] `auth.ts` - Add `POST /api/auth/learner-login` returning learner JWT.
- [x] `progress.ts` - Remove unauthenticated "public" access; allow learner token only for own `student_id`.
- [x] `student-lessons.ts` - Protect learner assignment endpoint with auth + ownership checks.
- [x] `Login.tsx` - Replace student name-only lookup with PIN sign-in flow.
- [x] `LearnerDashboard.tsx` - Use learner JWT in requests; handle unauthorized state.
- [x] `TutorDashboard.tsx` - Add learner PIN field in Add/Edit student forms.

### Day 3: Invite + Password Reset + Audit Trail
- [x] `database.ts` - Add `invites`, `password_resets`, `audit_logs` tables.
- [x] `auth.ts` - Add `POST /invite`, `POST /accept-invite`, `POST /request-password-reset`, `POST /reset-password`.
- [x] `audit.ts` - Add tutor-only endpoint to view audit events.
- [x] `audit.ts` - Add helper to write audit log entries.
- [x] `users.ts` - Log create/update/delete actions to audit table.
- [x] `students.ts` - Log create/update/delete actions to audit table.
- [x] `index.ts` - Register `/api/audit` route.

### Day 4: Feedback + Analytics + Resilience
- [x] `database.ts` - Add `feedback` and `analytics_events` tables.
- [x] `feedback.ts` - Add `POST /api/feedback` and tutor `GET /api/feedback`.
- [x] `analytics.ts` - Add `POST /api/analytics/event`.
- [x] `index.ts` - Register feedback/analytics routes.
- [x] `FeedbackWidget.tsx` - Add floating feedback modal for authenticated users.
- [x] `analytics.ts` - Add event tracking helper.
- [x] `network.ts` - Add offline queue + retry for feedback/progress/analytics POSTs.
- [x] `App.tsx` - Mount `FeedbackWidget` + offline banner.
- [x] `AuthContext.tsx` - Track login success/failure analytics events.

### Day 5: Reminders + Intervention Flags + Consent/Privacy
- [x] `notifications.ts` - Add `GET /api/notifications/reminders` for upcoming sessions by role.
- [x] `progress.ts` - Add `GET /api/progress/interventions` (low completion/inactivity/risk scores).
- [x] `consent.ts` - Add parent/tutor consent update + read endpoints.
- [x] `privacy.ts` - Add student data export and delete endpoints (role-restricted + audited).
- [x] `index.ts` - Register notifications/interventions/consent/privacy routes.
- [x] `TeacherDashboard.tsx` - Show intervention list section.
- [x] `ParentDashboard.tsx` - Add consent toggle + export request action.
- [x] `Navigation.tsx` - Add reminder badge/count.

### Day 6: Role Onboarding + UX Polish
- [x] `OnboardingModal.tsx` - Add first-run role-specific walkthrough.
- [x] `TutorDashboard.tsx` - Trigger tutor onboarding and mark completion.
- [x] `TeacherDashboard.tsx` - Trigger teacher onboarding and mark completion.
- [x] `ParentDashboard.tsx` - Trigger parent onboarding and mark completion.
- [x] `LearnerDashboard.tsx` - Add learner quick-start hints.
- [x] `Login.css` - Add UI styles for new PIN/reset/invite states.
- [x] `SplashScreen.tsx` - Ensure skip/fast path on repeat visits.

### Day 7: Railway Readiness + Validation
- [x] `package.json` - Add production start script suitable for Railway.
- [x] `railway.json` - Add explicit build/start commands.
- [x] `README.md` - Add Railway deploy section + required env list.
- [x] `SETUP.md` - Replace outdated seed/account instructions.
- [x] `QUICK_CHECK.md` - Update acceptance smoke test flow.
- [x] `TROUBLESHOOTING.md` - Add auth/token/cors/railway failure cases.

## Must-pass before user testing
- [x] `cd server && npx tsc --noEmit` passes.
- [x] `cd client && npx tsc --noEmit` passes.
- [ ] Tutor cannot be self-registered publicly.
- [ ] Learner endpoints require learner JWT and reject cross-student access.
- [ ] Password reset and invite acceptance work end-to-end.
- [ ] Feedback, analytics, consent update, and audit log entries are visible via API.
- [ ] Railway preview deploy starts cleanly with documented env vars.

## General Test Readiness
- [ ] All P0 usability items are implemented and manually verified.
- [ ] At least one end-to-end smoke test per role is completed.
- [ ] No blocking UX issues remain in login, navigation, core CRUD, and session workflows.
- [ ] Mobile and desktop layouts are verified for core flows.
