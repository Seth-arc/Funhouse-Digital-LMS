import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { syncSessionCalendars } from '../services/calendar-sync';

const router = express.Router();

// GET /api/schedule  — all sessions, tutor / teacher
router.get('/', authenticate, requireRole('tutor', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const sessions = await all(db,
      `SELECT se.*,
              st.name  AS student_name,
              st.grade AS student_grade,
              u.name   AS tutor_name,
              l.title  AS lesson_title
         FROM sessions se
         LEFT JOIN students st ON se.student_id = st.id
         LEFT JOIN users    u  ON se.tutor_id   = u.id
         LEFT JOIN lessons  l  ON se.lesson_id  = l.id
        ORDER BY se.session_date ASC, se.start_time ASC`,
      []
    );
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedule/student/:studentId  — sessions for one student
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { studentId } = req.params;

    if (req.userRole === 'parent') {
      const student = await get(db,
        'SELECT id FROM students WHERE id = ? AND parent_id = ?',
        [studentId, req.userId]
      );
      if (!student) return res.status(403).json({ error: 'Not authorised' });
    }

    const sessions = await all(db,
      `SELECT se.*,
              st.name  AS student_name,
              st.grade AS student_grade,
              u.name   AS tutor_name,
              l.title  AS lesson_title
         FROM sessions se
         LEFT JOIN students st ON se.student_id = st.id
         LEFT JOIN users    u  ON se.tutor_id   = u.id
         LEFT JOIN lessons  l  ON se.lesson_id  = l.id
        WHERE se.student_id = ?
        ORDER BY se.session_date ASC, se.start_time ASC`,
      [studentId]
    );
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedule  — create session (tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { student_id, lesson_id, title, session_date, start_time, end_time, notes, recur_weeks } = req.body;
    if (!student_id || !session_date || !start_time) {
      return res.status(400).json({ error: 'student_id, session_date and start_time are required' });
    }
    const weeks = Math.min(parseInt(recur_weeks) || 0, 11); // max 12 total (0-11 extra)
    const created: any[] = [];
    const syncWarnings: string[] = [];
    for (let w = 0; w <= weeks; w++) {
      const date = new Date(session_date);
      date.setDate(date.getDate() + w * 7);
      const dateStr = date.toISOString().split('T')[0];
      const id = uuidv4();
      await run(db,
        `INSERT INTO sessions (id, student_id, tutor_id, lesson_id, title, session_date, start_time, end_time, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        [id, student_id, req.userId, lesson_id || null, title || null, dateStr, start_time, end_time || null, notes || null]
      );
      const c = await get(db,
        `SELECT se.*, st.name AS student_name, st.grade AS student_grade, u.name AS tutor_name, l.title AS lesson_title
           FROM sessions se
           LEFT JOIN students st ON se.student_id = st.id
           LEFT JOIN users    u  ON se.tutor_id   = u.id
           LEFT JOIN lessons  l  ON se.lesson_id  = l.id
          WHERE se.id = ?`,
        [id]
      );
      created.push(c);

      const warnings = await syncSessionCalendars(req.userId as string, id, 'upsert');
      warnings.forEach(warning => {
        syncWarnings.push(`${id} [${warning.provider}] ${warning.message}`);
      });
    }
    if (syncWarnings.length > 0) {
      console.warn('Session create calendar sync warnings:', syncWarnings);
    }
    res.status(201).json(weeks > 0 ? created : created[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schedule/:id  — update session (tutor only, own sessions)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const session = await get(db, 'SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.tutor_id !== req.userId) return res.status(403).json({ error: 'Not authorised' });

    const { student_id, lesson_id, title, session_date, start_time, end_time, status, notes, parent_confirmed } = req.body;
    await run(db,
      `UPDATE sessions SET student_id=?, lesson_id=?, title=?, session_date=?, start_time=?, end_time=?, status=?, notes=?, parent_confirmed=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      [
        student_id   ?? session.student_id,
        lesson_id    !== undefined ? lesson_id    : session.lesson_id,
        title        !== undefined ? title        : session.title,
        session_date ?? session.session_date,
        start_time   ?? session.start_time,
        end_time     !== undefined ? end_time     : session.end_time,
        status       ?? session.status,
        notes        !== undefined ? notes        : session.notes,
        parent_confirmed !== undefined ? (parent_confirmed ? 1 : 0) : session.parent_confirmed,
        req.params.id,
      ]
    );
    const updated = await get(db,
      `SELECT se.*, st.name AS student_name, st.grade AS student_grade, u.name AS tutor_name, l.title AS lesson_title
         FROM sessions se
         LEFT JOIN students st ON se.student_id = st.id
         LEFT JOIN users    u  ON se.tutor_id   = u.id
         LEFT JOIN lessons  l  ON se.lesson_id  = l.id
        WHERE se.id = ?`,
      [req.params.id]
    );
    const warnings = await syncSessionCalendars(req.userId as string, req.params.id, 'upsert');
    if (warnings.length > 0) {
      console.warn('Session update calendar sync warnings:', warnings);
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schedule/:id/confirm — parent confirms session
router.put('/:id/confirm', authenticate, requireRole('parent'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const session = await get(db, 'SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const student = await get(db, 'SELECT parent_id FROM students WHERE id = ?', [session.student_id]);
    if (!student || student.parent_id !== req.userId) return res.status(403).json({ error: 'Not authorised' });
    await run(db, 'UPDATE sessions SET parent_confirmed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const session = await get(db, 'SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.tutor_id !== req.userId) return res.status(403).json({ error: 'Not authorised' });
    const warnings = await syncSessionCalendars(req.userId as string, req.params.id, 'delete');
    if (warnings.length > 0) {
      console.warn('Session delete calendar sync warnings:', warnings);
    }
    await run(db, 'DELETE FROM sessions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
