import express from 'express';
import { all, getDb } from '../database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

const parseBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
};

interface ReminderRow {
  id: string;
  student_id: string;
  student_name: string;
  student_grade: number | null;
  tutor_id: string;
  tutor_name: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  title: string | null;
  session_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
  parent_confirmed: number;
}

router.get('/reminders', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.userRole) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.userRole !== 'learner' && !req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.userRole === 'learner' && !req.studentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseBoundedInt(req.query.days, 7, 1, 30);
    const limit = parseBoundedInt(req.query.limit, 30, 1, 200);
    const db = getDb();

    const params: any[] = [`+${days} day`];
    let roleWhere = '';

    if (req.userRole === 'tutor') {
      roleWhere = 'AND se.tutor_id = ?';
      params.push(req.userId);
    } else if (req.userRole === 'teacher') {
      roleWhere = 'AND st.teacher_id = ?';
      params.push(req.userId);
    } else if (req.userRole === 'parent') {
      roleWhere = 'AND st.parent_id = ?';
      params.push(req.userId);
    } else if (req.userRole === 'learner') {
      roleWhere = 'AND se.student_id = ?';
      params.push(req.studentId);
    } else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    params.push(limit);

    const rows = (await all(
      db,
      `SELECT se.id,
              se.student_id,
              st.name AS student_name,
              st.grade AS student_grade,
              se.tutor_id,
              u.name AS tutor_name,
              se.lesson_id,
              l.title AS lesson_title,
              se.title,
              se.session_date,
              se.start_time,
              se.end_time,
              se.status,
              se.parent_confirmed
         FROM sessions se
         JOIN students st ON st.id = se.student_id
         LEFT JOIN users u ON u.id = se.tutor_id
         LEFT JOIN lessons l ON l.id = se.lesson_id
        WHERE se.status = 'scheduled'
          AND se.session_date >= date('now')
          AND se.session_date <= date('now', ?)
          ${roleWhere}
        ORDER BY se.session_date ASC, se.start_time ASC
        LIMIT ?`,
      params
    )) as ReminderRow[];

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];

    const reminders = rows.map((row) => {
      let reminderType = 'upcoming';
      if (row.session_date === today) {
        reminderType = 'today';
      } else if (row.session_date === tomorrow) {
        reminderType = 'tomorrow';
      } else if (row.parent_confirmed !== 1) {
        reminderType = 'needs_confirmation';
      }

      return {
        ...row,
        reminder_type: reminderType,
      };
    });

    const pendingConfirmationCount = reminders.filter(
      (reminder) => reminder.parent_confirmed !== 1
    ).length;

    res.json({
      count: reminders.length,
      pending_confirmation_count: pendingConfirmationCount,
      reminders,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
