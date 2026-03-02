import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const canAccessStudentAssignments = async (req: AuthRequest, studentId: string): Promise<boolean> => {
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

// GET /api/student-lessons/student/:studentId
// Returns assigned lessons for learner, parent, tutor, and teacher views with ownership checks.
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.params;
    if (!(await canAccessStudentAssignments(req, studentId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db = getDb();
    const rows = await all(
      db,
      `SELECT sl.id as assignment_id, sl.assigned_at,
              l.id, l.title, l.description, l.thumbnail_url, l.lesson_content_json,
              l.station_1_game_id, l.station_2_game_id, l.station_3_game_id,
              g1.title as station_1_title, g1.category as station_1_category, g1.game_url as station_1_url,
              g2.title as station_2_title, g2.category as station_2_category, g2.game_url as station_2_url,
              g3.title as station_3_title, g3.category as station_3_category, g3.game_url as station_3_url
         FROM student_lessons sl
         JOIN lessons l ON sl.lesson_id = l.id
         LEFT JOIN games g1 ON l.station_1_game_id = g1.id
         LEFT JOIN games g2 ON l.station_2_game_id = g2.id
         LEFT JOIN games g3 ON l.station_3_game_id = g3.id
        WHERE sl.student_id = ?
        ORDER BY sl.assigned_at DESC`,
      [studentId]
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student-lessons
// Returns all assignments (tutor/teacher only).
router.get('/', authenticate, requireRole('tutor', 'teacher'), async (_req: AuthRequest, res) => {
  try {
    const db = getDb();
    const rows = await all(
      db,
      `SELECT sl.id, sl.student_id, sl.lesson_id, sl.assigned_at,
              l.title as lesson_title,
              s.name as student_name, s.grade as student_grade
         FROM student_lessons sl
         JOIN lessons l ON sl.lesson_id = l.id
         JOIN students s ON sl.student_id = s.id
        ORDER BY s.grade ASC, s.name ASC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/student-lessons
// Assign lesson to student (tutor only).
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { student_id, lesson_id } = req.body;
    if (!student_id || !lesson_id) {
      return res.status(400).json({ error: 'student_id and lesson_id are required' });
    }

    // Remove existing assignment for same student and lesson.
    await run(db, 'DELETE FROM student_lessons WHERE student_id = ? AND lesson_id = ?', [student_id, lesson_id]);

    const id = uuidv4();
    await run(
      db,
      'INSERT INTO student_lessons (id, student_id, lesson_id, assigned_by) VALUES (?, ?, ?, ?)',
      [id, student_id, lesson_id, req.userId]
    );
    res.status(201).json({ id, student_id, lesson_id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/student-lessons
// Unassign lesson from student (tutor only).
router.delete('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { student_id, lesson_id } = req.body;
    if (!student_id || !lesson_id) {
      return res.status(400).json({ error: 'student_id and lesson_id are required' });
    }
    await run(db, 'DELETE FROM student_lessons WHERE student_id = ? AND lesson_id = ?', [student_id, lesson_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
