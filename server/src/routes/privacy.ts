import express from 'express';
import { all, get, getDb, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { writeAuditLog } from './audit';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

interface StudentAccessRow {
  id: string;
  name: string;
  email: string | null;
  grade: number | null;
  age: number | null;
  school_id: string | null;
  tutor_id: string | null;
  teacher_id: string | null;
  parent_id: string | null;
  created_at: string;
}

const canAccessStudent = (
  req: AuthRequest,
  student: StudentAccessRow,
  options: { allowLearner: boolean; forDelete: boolean } = { allowLearner: false, forDelete: false }
): boolean => {
  if (req.userRole === 'parent') return student.parent_id === req.userId;
  if (req.userRole === 'teacher') return student.teacher_id === req.userId;
  if (req.userRole === 'tutor') {
    if (!options.forDelete) return true;
    if (!student.tutor_id) return true;
    return student.tutor_id === req.userId;
  }
  if (options.allowLearner && req.userRole === 'learner') return req.studentId === student.id;
  return false;
};

// GET /api/privacy/export/:studentId
router.get('/export/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    if (
      !req.userRole ||
      (req.userRole !== 'tutor' &&
        req.userRole !== 'teacher' &&
        req.userRole !== 'parent' &&
        req.userRole !== 'learner')
    ) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (req.userRole !== 'learner' && !req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const { studentId } = req.params;

    const student = (await get(
      db,
      `SELECT id, name, email, grade, age, school_id, tutor_id, teacher_id, parent_id, created_at
         FROM students
        WHERE id = ?`,
      [studentId]
    )) as StudentAccessRow | undefined;

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!canAccessStudent(req, student, { allowLearner: true, forDelete: false })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const progress = await all(
      db,
      `SELECT id, game_id, lesson_id, station_number, score, time_spent, completed, attempts, feedback, created_at, updated_at
         FROM progress
        WHERE student_id = ?
        ORDER BY created_at DESC`,
      [studentId]
    );
    const sessions = await all(
      db,
      `SELECT id, tutor_id, lesson_id, title, session_date, start_time, end_time, status, notes, parent_confirmed, created_at, updated_at
         FROM sessions
        WHERE student_id = ?
        ORDER BY session_date DESC, start_time DESC`,
      [studentId]
    );
    const notes = await all(
      db,
      `SELECT id, tutor_id, session_id, note, session_date, created_at, updated_at
         FROM tutor_notes
        WHERE student_id = ?
        ORDER BY session_date DESC, created_at DESC`,
      [studentId]
    );
    const lessonAssignments = await all(
      db,
      `SELECT id, lesson_id, assigned_by, assigned_at
         FROM student_lessons
        WHERE student_id = ?
        ORDER BY assigned_at DESC`,
      [studentId]
    );
    const feedback = await all(
      db,
      `SELECT id, user_id, role, category, message, page_path, metadata, status, created_at, resolved_at, resolved_by
         FROM feedback
        WHERE student_id = ?
        ORDER BY created_at DESC`,
      [studentId]
    );
    const analyticsEvents = await all(
      db,
      `SELECT id, event_name, user_id, role, page_path, properties, created_at
         FROM analytics_events
        WHERE student_id = ?
        ORDER BY created_at DESC`,
      [studentId]
    );
    const consent = await get(
      db,
      `SELECT student_id, parent_consent, parent_consented_at, parent_consented_by,
              tutor_consent, tutor_consented_at, tutor_consented_by, notes, updated_at
         FROM student_consents
        WHERE student_id = ?`,
      [studentId]
    );

    const exportedAt = new Date().toISOString();
    const payload = {
      exported_at: exportedAt,
      student,
      consent: consent ?? null,
      progress,
      sessions,
      tutor_notes: notes,
      lesson_assignments: lessonAssignments,
      feedback,
      analytics_events: analyticsEvents,
    };

    await writeAuditLog({
      actorUserId: req.userId ?? null,
      actorRole: req.userRole,
      action: 'privacy.export',
      targetType: 'student',
      targetId: studentId,
      metadata: {
        exported_at: exportedAt,
        record_counts: {
          progress: progress.length,
          sessions: sessions.length,
          tutor_notes: notes.length,
          lesson_assignments: lessonAssignments.length,
          feedback: feedback.length,
          analytics_events: analyticsEvents.length,
        },
      },
    });

    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/privacy/student/:studentId
router.delete('/student/:studentId', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const { studentId } = req.params;

    const student = (await get(
      db,
      `SELECT id, name, email, grade, age, school_id, tutor_id, teacher_id, parent_id, created_at
         FROM students
        WHERE id = ?`,
      [studentId]
    )) as StudentAccessRow | undefined;

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!canAccessStudent(req, student, { allowLearner: false, forDelete: true })) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const counts = {
      progress: ((await get(db, 'SELECT COUNT(*) AS count FROM progress WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      sessions: ((await get(db, 'SELECT COUNT(*) AS count FROM sessions WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      tutor_notes: ((await get(db, 'SELECT COUNT(*) AS count FROM tutor_notes WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      lesson_assignments: ((await get(db, 'SELECT COUNT(*) AS count FROM student_lessons WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      feedback: ((await get(db, 'SELECT COUNT(*) AS count FROM feedback WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      analytics_events: ((await get(db, 'SELECT COUNT(*) AS count FROM analytics_events WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
      consents: ((await get(db, 'SELECT COUNT(*) AS count FROM student_consents WHERE student_id = ?', [studentId])) as { count: number } | undefined)?.count ?? 0,
    };

    await run(db, 'BEGIN TRANSACTION');
    try {
      await run(db, 'DELETE FROM progress WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM sessions WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM tutor_notes WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM student_lessons WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM feedback WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM analytics_events WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM student_consents WHERE student_id = ?', [studentId]);
      await run(db, 'DELETE FROM students WHERE id = ?', [studentId]);

      await run(
        db,
        `INSERT INTO audit_logs (id, actor_user_id, actor_role, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.userId,
          req.userRole ?? null,
          'privacy.delete',
          'student',
          studentId,
          JSON.stringify({
            deleted_at: new Date().toISOString(),
            student,
            deleted_record_counts: counts,
          }),
        ]
      );

      await run(db, 'COMMIT');
    } catch (error) {
      try {
        await run(db, 'ROLLBACK');
      } catch {
        // Ignore rollback errors so original failure is returned.
      }
      throw error;
    }

    res.json({
      deleted: true,
      student_id: studentId,
      deleted_record_counts: counts,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
