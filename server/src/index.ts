import express from 'express';
import cors from 'cors';
import { initDatabase } from './database';
import { getCorsOrigins, getJwtSecret, jsonBodyLimit } from './config';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import studentRoutes from './routes/students';
import gameRoutes from './routes/games';
import progressRoutes from './routes/progress';
import lessonRoutes from './routes/lessons';
import seedRoutes from './routes/seed';
import schoolRoutes from './routes/schools';
import notesRoutes from './routes/notes';
import scheduleRoutes from './routes/schedule';
import studentLessonRoutes from './routes/student-lessons';
import auditRoutes from './routes/audit';
import feedbackRoutes from './routes/feedback';
import analyticsRoutes from './routes/analytics';
import notificationsRoutes from './routes/notifications';
import consentRoutes from './routes/consent';
import privacyRoutes from './routes/privacy';
import calendarIntegrationsRoutes from './routes/calendar-integrations';
import syncRoutes from './routes/sync';
import { bumpSyncVersion } from './services/sync-version';

const app = express();
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGINS = getCorsOrigins();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json({ limit: jsonBodyLimit }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
});

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SYNC_TRACKED_PREFIXES = [
  '/api/students',
  '/api/games',
  '/api/lessons',
  '/api/progress',
  '/api/schools',
  '/api/notes',
  '/api/schedule',
  '/api/student-lessons',
  '/api/users',
  '/api/seed',
];

app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) {
    next();
    return;
  }

  const isTrackedRoute = SYNC_TRACKED_PREFIXES.some(prefix => req.path.startsWith(prefix));
  if (!isTrackedRoute) {
    next();
    return;
  }

  const syncSource = `${method} ${req.path}`;
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      bumpSyncVersion(syncSource);
    }
  });

  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/student-lessons', studentLessonRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/calendar-integrations', calendarIntegrationsRoutes);
app.use('/api/sync', syncRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LMS API is running' });
});

const startServer = async () => {
  try {
    getJwtSecret();
    await initDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`CORS allowlist: ${ALLOWED_ORIGINS.join(', ')}`);
      console.log(`JSON body limit: ${jsonBodyLimit}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

void startServer();
