import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const canAccessStudent = async (req: AuthRequest, studentId: string): Promise<boolean> => {
  if (req.userRole === 'learner') {
    return req.studentId === studentId;
  }

  if (req.userRole === 'parent') {
    const db = getDb();
    const student = await get(db, 'SELECT parent_id FROM students WHERE id = ?', [studentId]);
    return !!student && student.parent_id === req.userId;
  }

  return req.userRole === 'tutor' || req.userRole === 'teacher';
};

interface StudentInterventionRow {
  student_id: string;
  student_name: string;
  grade: number | null;
  total_sessions: number;
  completed_sessions: number;
  avg_score: number | null;
  last_activity_at: string | null;
  last_session_date: string | null;
}

interface InterventionResult {
  student_id: string;
  student_name: string;
  grade: number | null;
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  avg_score: number;
  days_inactive: number;
  last_activity_at: string | null;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

const parseSqliteDate = (value: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T00:00:00Z`;
  } else if (normalized.includes('T')) {
    normalized = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  } else {
    normalized = `${normalized.replace(' ', 'T')}Z`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getInactiveDays = (referenceDate: Date | null, now: Date): number => {
  if (!referenceDate) return 365;
  const msDiff = now.getTime() - referenceDate.getTime();
  return Math.max(0, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
};

// Get progress for a student
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.params;

    if (!(await canAccessStudent(req, studentId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db = getDb();
    const progress = await all(
      db,
      `SELECT p.*, g.title as game_title, g.category, l.title as lesson_title
       FROM progress p
       LEFT JOIN games g ON p.game_id = g.id
       LEFT JOIN lessons l ON p.lesson_id = l.id
       WHERE p.student_id = ?
       ORDER BY p.created_at DESC`,
      [studentId]
    );

    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get progress for all students (Tutor, Teacher)
router.get('/all', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'tutor' && req.userRole !== 'teacher') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db = getDb();
    const progress = await all(
      db,
      `SELECT p.*, s.name as student_name, s.grade, g.title as game_title, g.category, l.title as lesson_title
       FROM progress p
       JOIN students s ON p.student_id = s.id
       LEFT JOIN games g ON p.game_id = g.id
       LEFT JOIN lessons l ON p.lesson_id = l.id
       ORDER BY p.created_at DESC`
    );

    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get intervention list (low completion / inactivity / low scores)
router.get('/interventions', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'tutor' && req.userRole !== 'teacher') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const scopeWhere = req.userRole === 'teacher' ? 'WHERE st.teacher_id = ?' : 'WHERE st.tutor_id = ?';
    const rows = (await all(
      db,
      `SELECT st.id AS student_id,
              st.name AS student_name,
              st.grade,
              COALESCE(progress_metrics.total_sessions, 0) AS total_sessions,
              COALESCE(progress_metrics.completed_sessions, 0) AS completed_sessions,
              COALESCE(progress_metrics.avg_score, 0) AS avg_score,
              progress_metrics.last_activity_at,
              session_metrics.last_session_date
         FROM students st
         LEFT JOIN (
           SELECT p.student_id,
                  COUNT(*) AS total_sessions,
                  SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) AS completed_sessions,
                  AVG(COALESCE(p.score, 0)) AS avg_score,
                  MAX(p.created_at) AS last_activity_at
             FROM progress p
            GROUP BY p.student_id
         ) AS progress_metrics ON progress_metrics.student_id = st.id
         LEFT JOIN (
           SELECT s.student_id,
                  MAX(s.session_date) AS last_session_date
             FROM sessions s
            GROUP BY s.student_id
         ) AS session_metrics ON session_metrics.student_id = st.id
        ${scopeWhere}
        ORDER BY st.name ASC`,
      [req.userId]
    )) as StudentInterventionRow[];

    const now = new Date();
    const interventions: InterventionResult[] = rows
      .map((row) => {
        const totalSessions = Number(row.total_sessions ?? 0);
        const completedSessions = Number(row.completed_sessions ?? 0);
        const avgScore = Number(row.avg_score ?? 0);
        const completionRate = totalSessions > 0 ? completedSessions / totalSessions : 0;

        const progressDate = parseSqliteDate(row.last_activity_at);
        const sessionDate = parseSqliteDate(row.last_session_date);
        const lastActivityDate = progressDate || sessionDate;
        const daysInactive = getInactiveDays(lastActivityDate, now);

        const lowCompletion = totalSessions >= 3 && completionRate < 0.6;
        const inactive = daysInactive >= 14;
        const lowScore = totalSessions >= 3 && avgScore < 60;

        let riskScore = 0;
        if (lowCompletion) riskScore += 35;
        if (inactive) riskScore += 35;
        if (lowScore) riskScore += 30;
        if (totalSessions === 0) riskScore += 10;
        if (daysInactive >= 30) riskScore += 10;
        riskScore = Math.min(100, riskScore);

        const reasons: string[] = [];
        if (lowCompletion) reasons.push('low_completion');
        if (inactive) reasons.push('inactivity');
        if (lowScore) reasons.push('low_score');

        const riskLevel: 'low' | 'medium' | 'high' =
          riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';

        return {
          student_id: row.student_id,
          student_name: row.student_name,
          grade: row.grade,
          total_sessions: totalSessions,
          completed_sessions: completedSessions,
          completion_rate: Math.round(completionRate * 100),
          avg_score: Math.round(avgScore),
          days_inactive: daysInactive,
          last_activity_at: lastActivityDate ? lastActivityDate.toISOString() : null,
          risk_score: riskScore,
          risk_level: riskLevel,
          reasons,
        };
      })
      .filter((item) => item.reasons.length > 0 || item.risk_score >= 40)
      .sort((a, b) => {
        if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
        return b.days_inactive - a.days_inactive;
      });

    res.json(interventions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Record progress (authenticated)
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const studentId = typeof req.body?.student_id === 'string' ? req.body.student_id.trim() : '';
    const gameId = typeof req.body?.game_id === 'string' ? req.body.game_id.trim() : '';
    const lessonId = typeof req.body?.lesson_id === 'string' && req.body.lesson_id.trim() ? req.body.lesson_id.trim() : null;
    const stationNumber = req.body?.station_number ?? null;
    const score = req.body?.score ?? 0;
    const timeSpent = req.body?.time_spent ?? 0;
    const completed = req.body?.completed ?? false;
    const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : null;

    if (!studentId || !gameId) {
      return res.status(400).json({ error: 'Student ID and Game ID are required' });
    }

    const db = getDb();
    const student = await get(db, 'SELECT id FROM students WHERE id = ?', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!(await canAccessStudent(req, studentId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const existing = await get(
      db,
      `SELECT * FROM progress
       WHERE student_id = ?
         AND game_id = ?
         AND ((lesson_id = ?) OR (lesson_id IS NULL AND ? IS NULL))`,
      [studentId, gameId, lessonId, lessonId]
    );

    let progress;
    if (existing) {
      const attempts = (existing.attempts || 0) + 1;
      await run(
        db,
        `UPDATE progress
         SET score = ?, time_spent = ?, completed = ?, attempts = ?, feedback = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          score !== undefined ? score : existing.score,
          timeSpent !== undefined ? timeSpent : existing.time_spent,
          completed !== undefined ? completed : existing.completed,
          attempts,
          feedback !== null ? feedback : existing.feedback,
          existing.id,
        ]
      );
      progress = await get(db, 'SELECT * FROM progress WHERE id = ?', [existing.id]);
    } else {
      const id = uuidv4();
      await run(
        db,
        `INSERT INTO progress
         (id, student_id, game_id, lesson_id, station_number, score, time_spent, completed, attempts, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, studentId, gameId, lessonId, stationNumber, score, timeSpent, completed, 1, feedback]
      );
      progress = await get(db, 'SELECT * FROM progress WHERE id = ?', [id]);
    }

    res.status(201).json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get aggregated progress statistics
router.get('/stats/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.params;

    if (!(await canAccessStudent(req, studentId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db = getDb();
    const stats = await all(
      db,
      `SELECT 
        g.category,
        COUNT(*) as total_games,
        SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) as completed_games,
        AVG(p.score) as avg_score,
        SUM(p.time_spent) as total_time_spent
       FROM progress p
       JOIN games g ON p.game_id = g.id
       WHERE p.student_id = ?
       GROUP BY g.category`,
      [studentId]
    );

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
