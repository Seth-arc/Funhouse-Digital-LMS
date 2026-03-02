import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// GET /api/notes/student/:studentId — tutor / teacher / parent
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { studentId } = req.params;

    // Parents can only see notes for their own children
    if (req.userRole === 'parent') {
      const student = await get(db,
        'SELECT id FROM students WHERE id = ? AND parent_id = ?',
        [studentId, req.userId]
      );
      if (!student) return res.status(403).json({ error: 'Not authorised' });
    }

    const notes = await all(db,
      `SELECT tn.*, u.name AS tutor_name
         FROM tutor_notes tn
         LEFT JOIN users u ON tn.tutor_id = u.id
        WHERE tn.student_id = ?
        ORDER BY tn.session_date DESC, tn.created_at DESC`,
      [studentId]
    );
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notes — all notes (tutor/teacher only)
router.get('/', authenticate, requireRole('tutor', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const notes = await all(db,
      `SELECT tn.*, u.name AS tutor_name, s.name AS student_name, s.grade
         FROM tutor_notes tn
         LEFT JOIN users u    ON tn.tutor_id   = u.id
         LEFT JOIN students s ON tn.student_id = s.id
        ORDER BY tn.session_date DESC, tn.created_at DESC`
    );
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes — tutor creates a note
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { student_id, note, session_date } = req.body;

    if (!student_id || !note?.trim()) {
      return res.status(400).json({ error: 'student_id and note are required' });
    }

    const id = uuidv4();
    const date = session_date || new Date().toISOString().split('T')[0];
    await run(db,
      'INSERT INTO tutor_notes (id, student_id, tutor_id, note, session_date) VALUES (?, ?, ?, ?, ?)',
      [id, student_id, req.userId, note.trim(), date]
    );
    const created = await get(db, 'SELECT * FROM tutor_notes WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notes/:id — tutor edits their own note
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const existing = await get(db,
      'SELECT * FROM tutor_notes WHERE id = ? AND tutor_id = ?',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const { note, session_date } = req.body;
    await run(db,
      'UPDATE tutor_notes SET note = ?, session_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [note?.trim() ?? existing.note, session_date ?? existing.session_date, req.params.id]
    );
    const updated = await get(db, 'SELECT * FROM tutor_notes WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/:id — tutor deletes their own note
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const existing = await get(db,
      'SELECT * FROM tutor_notes WHERE id = ? AND tutor_id = ?',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    await run(db, 'DELETE FROM tutor_notes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
