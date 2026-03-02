import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { bootstrapDemoAdmin } from './config';

const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'lms.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: sqlite3.Database;

export const getDb = () => {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
};

const run = (db: sqlite3.Database, query: string, params: any[] = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const all = (db: sqlite3.Database, query: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (db: sqlite3.Database, query: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const initDatabase = async () => {
  const database = getDb();
  
  // Schools table
  await run(database, `
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  
  // Users table (Tutors, Teachers, Parents) - Check if exists first, then alter if needed
  await run(database, `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('tutor', 'teacher', 'parent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add new columns to users table if they don't exist (for existing databases)
  try {
    await run(database, `ALTER TABLE users ADD COLUMN school_id TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message.includes('duplicate column')) {
      console.log('Note: school_id column may already exist');
    }
  }

  try {
    await run(database, `ALTER TABLE users ADD COLUMN created_by TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message.includes('duplicate column')) {
      console.log('Note: created_by column may already exist');
    }
  }

  // Invitations table (for teacher/parent account onboarding)
  await run(database, `
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('teacher', 'parent')),
      invited_name TEXT,
      school_id TEXT,
      invited_by TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (invited_by) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at)`);

  // Password reset table
  await run(database, `
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at)`);

  // Audit log table
  await run(database, `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);

  // Add foreign keys if they don't exist (SQLite doesn't support ADD CONSTRAINT, so we recreate if needed)
  // For now, we'll just ensure the columns exist

  // Students table (Learners)
  await run(database, `
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      grade INTEGER CHECK(grade >= 4 AND grade <= 9),
      age INTEGER CHECK(age >= 9 AND age <= 16),
      school_id TEXT,
      tutor_id TEXT,
      teacher_id TEXT,
      parent_id TEXT,
      learner_pin_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (tutor_id) REFERENCES users(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES users(id)
    )
  `);

  // Add school_id / teacher_id to students if missing (for existing databases)
  try {
    await run(database, `ALTER TABLE students ADD COLUMN school_id TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
  }
  try {
    await run(database, `ALTER TABLE students ADD COLUMN teacher_id TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
  }
  try {
    await run(database, `ALTER TABLE students ADD COLUMN learner_pin_hash TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
  }

  // Student consent table
  await run(database, `
    CREATE TABLE IF NOT EXISTS student_consents (
      student_id TEXT PRIMARY KEY,
      parent_consent INTEGER DEFAULT 0,
      parent_consented_at TEXT,
      parent_consented_by TEXT,
      tutor_consent INTEGER DEFAULT 0,
      tutor_consented_at TEXT,
      tutor_consented_by TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (parent_consented_by) REFERENCES users(id),
      FOREIGN KEY (tutor_consented_by) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_student_consents_updated_at ON student_consents(updated_at)`);

  // Games table
  await run(database, `
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('computational_thinking', 'typing', 'purposeful_gaming')),
      difficulty_level INTEGER DEFAULT 1,
      game_url TEXT,
      thumbnail_url TEXT,
      instructions TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Add thumbnail_url to games if it doesn't exist (for existing databases)
  try {
    await run(database, `ALTER TABLE games ADD COLUMN thumbnail_url TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column') && !e.message?.includes('no such column')) {
      // Try to verify column exists
      try {
        await get(database, 'SELECT thumbnail_url FROM games LIMIT 1');
      } catch {
        // Column doesn't exist - will be added on table recreation
      }
    }
  }

  // Add tracking_enabled to games if it doesn't exist (for existing databases)
  try {
    await run(database, `ALTER TABLE games ADD COLUMN tracking_enabled BOOLEAN DEFAULT 1`);
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column') && !e.message?.includes('no such column')) {
      // Try to verify column exists
      try {
        await get(database, 'SELECT tracking_enabled FROM games LIMIT 1');
      } catch {
        // Column doesn't exist - will be added on table recreation
      }
    }
  }

  // Lessons table (3-station model)
  await run(database, `
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      lesson_content_json TEXT,
      station_1_game_id TEXT,
      station_2_game_id TEXT,
      station_3_game_id TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (station_1_game_id) REFERENCES games(id),
      FOREIGN KEY (station_2_game_id) REFERENCES games(id),
      FOREIGN KEY (station_3_game_id) REFERENCES games(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Add thumbnail_url to lessons if it doesn't exist (for existing databases)
  try {
    await run(database, `ALTER TABLE lessons ADD COLUMN thumbnail_url TEXT`);
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column') && !e.message?.includes('no such column')) {
      // Try to verify column exists
      try {
        await get(database, 'SELECT thumbnail_url FROM lessons LIMIT 1');
      } catch {
        // Column doesn't exist - will be added on table recreation
      }
    }
  }

  // Add lesson_content_json to lessons if it doesn't exist (for existing databases)
  try {
    await run(database, `ALTER TABLE lessons ADD COLUMN lesson_content_json TEXT`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column') && !e.message?.includes('no such column')) {
      try {
        await get(database, 'SELECT lesson_content_json FROM lessons LIMIT 1');
      } catch {
        // Column doesn't exist - will be added on table recreation
      }
    }
  }

  // Progress table
  await run(database, `
    CREATE TABLE IF NOT EXISTS progress (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      lesson_id TEXT,
      station_number INTEGER,
      score INTEGER,
      time_spent INTEGER,
      completed BOOLEAN DEFAULT 0,
      attempts INTEGER DEFAULT 1,
      feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id)
    )
  `);

  // Sessions / schedule table
  await run(database, `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      tutor_id TEXT NOT NULL,
      lesson_id TEXT,
      title TEXT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      parent_confirmed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (tutor_id) REFERENCES users(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id)
    )
  `);
  try { await run(database, `ALTER TABLE sessions ADD COLUMN parent_confirmed INTEGER DEFAULT 0`); } catch {}

  // Tutor calendar integrations (Google / Microsoft)
  await run(database, `
    CREATE TABLE IF NOT EXISTS calendar_integrations (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('google', 'microsoft')),
      external_email TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at TEXT,
      scope TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tutor_id, provider),
      FOREIGN KEY (tutor_id) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_calendar_integrations_tutor_id ON calendar_integrations(tutor_id)`);

  // Short-lived OAuth states for provider callbacks
  await run(database, `
    CREATE TABLE IF NOT EXISTS calendar_oauth_states (
      id TEXT PRIMARY KEY,
      state_token TEXT NOT NULL UNIQUE,
      tutor_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('google', 'microsoft')),
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tutor_id) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_calendar_oauth_states_expires_at ON calendar_oauth_states(expires_at)`);

  // Mapping between LMS sessions and external provider event IDs
  await run(database, `
    CREATE TABLE IF NOT EXISTS calendar_session_events (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('google', 'microsoft')),
      session_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tutor_id, provider, session_id),
      FOREIGN KEY (tutor_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_calendar_session_events_session_id ON calendar_session_events(session_id)`);

  // Tutor notes table
  await run(database, `
    CREATE TABLE IF NOT EXISTS tutor_notes (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      tutor_id TEXT NOT NULL,
      session_id TEXT,
      note TEXT NOT NULL,
      session_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (tutor_id) REFERENCES users(id)
    )
  `);
  try { await run(database, `ALTER TABLE tutor_notes ADD COLUMN session_id TEXT`); } catch {}

  // Student-lesson assignments
  await run(database, `
    CREATE TABLE IF NOT EXISTS student_lessons (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, lesson_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id)
    )
  `);

  // User and learner feedback table
  await run(database, `
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      student_id TEXT,
      role TEXT NOT NULL,
      category TEXT,
      message TEXT NOT NULL,
      page_path TEXT,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      resolved_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)`);

  // Product analytics event table
  await run(database, `
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      user_id TEXT,
      student_id TEXT,
      role TEXT NOT NULL,
      page_path TEXT,
      properties TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name)`);

  // Optional demo admin bootstrap (disabled by default)
  if (bootstrapDemoAdmin) {
    const adminExists = await get(database, 'SELECT id FROM users WHERE email = ?', ['admin@lms.com']);
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await run(database,
        'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
        ['admin-001', 'admin@lms.com', hashedPassword, 'Admin Tutor', 'tutor']
      );
      console.log('Bootstrapped demo admin account (admin@lms.com)');
    }
  }

  console.log('Database tables created/verified');
};

export { run, all, get };
