# Game-Based Learning Management System (LMS)

A comprehensive Learning Management System designed for digital literacy education, specifically targeting Grades 4-9 (ages 9-16) in rural South African communities. The system implements a 3-station lesson model: Computational Thinking, Typing, and Purposeful Gaming.

![Application Screenshot](Screenshot.PNG)

## GitHub Page

This repo includes an automated GitHub Pages workflow at `.github/workflows/deploy-pages.yml` that builds and deploys the actual React frontend from `client/`.

1. Push these changes to your GitHub repository.
2. In GitHub, go to **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. In **Settings -> Secrets and variables -> Actions -> Variables**, add:
   - `REACT_APP_API_URL` = your deployed backend API base URL (for example, your Railway URL ending in `/api`).
4. The workflow deploys the React app on pushes to `main` or `master`.
5. Your site URL will be:
   - `https://<your-github-username>.github.io/<repo-name>/`

## Features

### User Roles

1. **Tutor (Admin)**
   - Add and manage students
   - Create and manage games
   - Create lessons with 3-station model
   - View all student progress
   - Full system access

2. **Teacher**
   - View all student progress
   - Access performance analytics
   - AI-driven suggestions for student support

3. **Parent**
   - View their child's progress
   - Track performance across all game categories
   - Monitor completion rates and scores

4. **Learner (Student)**
   - Play games across three categories
   - Track personal progress
   - Access 3-station lessons
   - View achievements and statistics

### Core Functionality

- **3-Station Lesson Model**: Each lesson includes three stations:
  - Station 1: Computational Thinking
  - Station 2: Typing
  - Station 3: Purposeful Gaming

- **Progress Tracking**: Comprehensive tracking of:
  - Game completion status
  - Scores and attempts
  - Time spent on activities
  - Category-wise performance

- **AI-Driven Insights**: Teachers receive suggestions based on:
  - Student performance patterns
  - Engagement levels
  - Growth opportunities

## Technology Stack

### Backend
- Node.js with Express
- TypeScript
- SQLite database
- JWT authentication
- RESTful API

### Frontend
- React with TypeScript
- React Router for navigation
- Axios for API calls
- Modern, responsive UI

## Installation

1. **Install dependencies for all projects:**
   ```bash
   npm run install-all
   ```

2. **Set up environment variables:**
   - Copy `server/.env.example` to `server/.env`
   - Set `JWT_SECRET` to a secure random string (required)
   - Set `CORS_ORIGIN` to a comma-separated allowlist of trusted frontend origins
   - Keep `ALLOW_INITIAL_TUTOR_SIGNUP=false` in normal operation
   - Keep `BOOTSTRAP_DEMO_ADMIN=false` unless you explicitly want demo credentials

3. **Start the development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend server on `http://localhost:5000`
   - Frontend app on `http://localhost:3000`

## Auth Bootstrap

- Public registration is restricted. Only initial tutor signup is allowed when `ALLOW_INITIAL_TUTOR_SIGNUP=true`.
- Once a tutor account exists, `/api/auth/register` is blocked and tutor-created accounts should be provisioned via tutor workflows.
- Optional demo bootstrap account can be enabled with `BOOTSTRAP_DEMO_ADMIN=true`:
  - Email: `admin@lms.com`
  - Password: `admin123`

## Sample Data

To populate the database with realistic sample data (10 students, 15 games, 3 lessons, and progress records):

1. **Via API** (after logging in as tutor):
   - Use the "Load Sample Data" button in the Tutor Dashboard, or
   - POST to `/api/seed` with tutor authentication

2. **Via Command Line**:
   ```bash
   cd server
   npm run seed
   ```

This will create:
- 10 students across grades 4-9
- 15 educational games across all three categories
- 3 complete lesson plans with 3-station models
- Realistic progress data for demonstration
- Additional teacher and parent accounts

## Project Structure

```
.
├── server/                 # Backend API
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth middleware
│   │   └── database.ts    # Database setup
│   └── data/              # SQLite database (created on first run)
├── client/                # Frontend React app
│   ├── src/
│   │   ├── pages/         # Dashboard pages
│   │   ├── components/    # Reusable components
│   │   └── contexts/      # React contexts
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Initial tutor bootstrap only (requires `ALLOW_INITIAL_TUTOR_SIGNUP=true` and no existing tutor)
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Students
- `GET /api/students` - Get all students (role-based)
- `POST /api/students` - Create student (Tutor only)
- `GET /api/students/:id` - Get student details
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Games
- `GET /api/games` - Get all games
- `POST /api/games` - Create game (Tutor only)
- `GET /api/games/:id` - Get game details
- `PUT /api/games/:id` - Update game
- `DELETE /api/games/:id` - Delete game

### Lessons
- `GET /api/lessons` - Get all lessons
- `POST /api/lessons` - Create lesson (Tutor only)
- `GET /api/lessons/:id` - Get lesson details
- `PUT /api/lessons/:id` - Update lesson
- `DELETE /api/lessons/:id` - Delete lesson

### Progress
- `GET /api/progress/student/:studentId` - Get student progress
- `GET /api/progress/all` - Get all progress (Tutor/Teacher)
- `POST /api/progress` - Record game progress
- `GET /api/progress/stats/:studentId` - Get aggregated statistics

## Development Notes

- The database is automatically initialized on first server start
- Server startup fails fast if `JWT_SECRET` is missing or database initialization fails
- Default demo admin account is only created when `BOOTSTRAP_DEMO_ADMIN=true`
- SQLite database file is stored in `server/data/lms.db`
- Frontend expects backend API at `http://localhost:5000/api` (configurable via `REACT_APP_API_URL`)

## Railway Deployment (Backend API)

This repository deploys to Railway from the repo root with `railway.json`.

### Build and start commands

- Build command: `npm run railway:build`
- Start command: `npm run railway:start`

### Required environment variables

- `JWT_SECRET` - required, long random secret used for JWT signing
- `CORS_ORIGIN` - required in production, comma-separated list of allowed frontend origins

### Recommended environment variables

- `ALLOW_INITIAL_TUTOR_SIGNUP=false`
- `BOOTSTRAP_DEMO_ADMIN=false`
- `JSON_BODY_LIMIT=6mb`
- `PORT` is provided by Railway automatically; do not hardcode it

### First deploy checklist

1. If no tutor exists yet, temporarily set `ALLOW_INITIAL_TUTOR_SIGNUP=true`.
2. Create the first tutor via `POST /api/auth/register`.
3. Set `ALLOW_INITIAL_TUTOR_SIGNUP=false` and redeploy.
4. Verify health at `/api/health`.

If the React app is hosted separately, set `REACT_APP_API_URL` to your Railway service URL with `/api` appended.

## Supabase Pre-Deployment Audit (Initial User Testing)

Before a Supabase-based rollout, run the release gate:

```bash
npm run audit:deploy:supabase
```

Fast run (skip production builds):

```bash
npm run audit:deploy:supabase -- --skip-build
```

Strict run (warnings fail):

```bash
npm run audit:deploy:supabase:strict
```

Then run SQL checks in Supabase SQL editor:

- `supabase/audit/predeploy_audit.sql`

Detailed runbook:

- `SUPABASE_DEPLOY_AUDIT.md`

## Future Enhancements

- Migration to PostgreSQL for production
- Real-time progress updates
- Advanced analytics dashboard
- Gamification features (badges, leaderboards)
- Mobile app support
- Offline mode for rural connectivity challenges

## License

MIT
