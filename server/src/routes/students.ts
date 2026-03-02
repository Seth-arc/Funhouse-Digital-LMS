import express from 'express';
import bcrypt from 'bcryptjs';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { writeAuditLog } from './audit';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const LEARNER_PIN_PATTERN = /^\d{4,8}$/;

const sanitizeStudent = (student: any) => {
  if (!student) return student;
  const { learner_pin_hash, ...safeStudent } = student;
  return safeStudent;
};

const parseLearnerPin = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

// Get all students (Tutor, Teacher can see all; Parent sees only their children)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    let students;

    if (req.userRole === 'parent') {
      students = await all(db,
        'SELECT * FROM students WHERE parent_id = ? ORDER BY created_at DESC',
        [req.userId]
      );
    } else if (req.userRole === 'tutor' || req.userRole === 'teacher') {
      students = await all(db,
        'SELECT * FROM students ORDER BY created_at DESC'
      );
    } else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    res.json(students.map(sanitizeStudent));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Public: student self-service lookup by name / grade (no JWT required)
// Used by the student login tab so learners can find their dashboard link.
router.get('/lookup', async (req: any, res) => {
  try {
    const { name, grade } = req.query;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    const db = getDb();
    const params: any[] = [`%${name.trim()}%`];
    let query = "SELECT id, name, grade FROM students WHERE name LIKE ? COLLATE NOCASE";

    if (grade && !isNaN(parseInt(grade as string))) {
      query += ' AND grade = ?';
      params.push(parseInt(grade as string));
    }

    query += ' ORDER BY name ASC LIMIT 10';
    const students = await all(db, query, params);
    res.json(students);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Public: learner self-lookup by ID — returns only safe fields, no auth required
router.get('/public/:id', async (req: any, res) => {
  try {
    const db = getDb();
    const student = await get(db,
      'SELECT id, name, grade, age FROM students WHERE id = ?',
      [req.params.id]
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single student
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const student = await get(db,
      `SELECT st.*, u.name AS tutor_name, u.email AS tutor_email
         FROM students st
         LEFT JOIN users u ON st.tutor_id = u.id
        WHERE st.id = ?`,
      [req.params.id]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Parents can only see their own children
    if (req.userRole === 'parent' && student.parent_id !== req.userId) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Learners can only see their own profile
    if (req.userRole === 'learner' && req.studentId !== req.params.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    res.json(sanitizeStudent(student));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create student (Tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { name, email, grade, age, parent_id, teacher_id, school_id, learner_pin } = req.body;
    const parsedLearnerPin = parseLearnerPin(learner_pin);

    if (!name || grade === undefined || age === undefined || !parsedLearnerPin) {
      return res.status(400).json({ error: 'Name, grade, age, and learner PIN are required' });
    }

    if (!LEARNER_PIN_PATTERN.test(parsedLearnerPin)) {
      return res.status(400).json({ error: 'Learner PIN must be 4-8 digits' });
    }

    const numericGrade = Number(grade);
    const numericAge = Number(age);

    if (!Number.isInteger(numericGrade) || numericGrade < 4 || numericGrade > 9) {
      return res.status(400).json({ error: 'Grade must be between 4 and 9' });
    }

    if (!Number.isInteger(numericAge) || numericAge < 9 || numericAge > 16) {
      return res.status(400).json({ error: 'Age must be between 9 and 16' });
    }

    const db = getDb();
    const id = uuidv4();
    const learnerPinHash = await bcrypt.hash(parsedLearnerPin, 10);

    await run(db,
      `INSERT INTO students (id, name, email, grade, age, tutor_id, parent_id, teacher_id, school_id, learner_pin_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name.trim(), email?.trim() || null, numericGrade, numericAge, req.userId, parent_id || null, teacher_id || null, school_id || null, learnerPinHash]
    );

    const student = await get(db, 'SELECT * FROM students WHERE id = ?', [id]);
    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'student.create',
      targetType: 'student',
      targetId: id,
      metadata: sanitizeStudent(student),
    });
    res.status(201).json(sanitizeStudent(student));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update student (Tutor only)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { name, email, grade, age, parent_id, teacher_id, school_id, learner_pin } = req.body;
    const parsedLearnerPin = parseLearnerPin(learner_pin);

    if (parsedLearnerPin && !LEARNER_PIN_PATTERN.test(parsedLearnerPin)) {
      return res.status(400).json({ error: 'Learner PIN must be 4-8 digits' });
    }

    const db = getDb();
    const existingStudent = await get(db, 'SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!existingStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      updates.push('name = ?');
      values.push(trimmedName);
    }

    if (email !== undefined) {
      const normalizedEmail = typeof email === 'string' ? email.trim() : '';
      updates.push('email = ?');
      values.push(normalizedEmail || null);
    }

    if (grade !== undefined) {
      const numericGrade = Number(grade);
      if (!Number.isInteger(numericGrade) || numericGrade < 4 || numericGrade > 9) {
        return res.status(400).json({ error: 'Grade must be between 4 and 9' });
      }
      updates.push('grade = ?');
      values.push(numericGrade);
    }

    if (age !== undefined) {
      const numericAge = Number(age);
      if (!Number.isInteger(numericAge) || numericAge < 9 || numericAge > 16) {
        return res.status(400).json({ error: 'Age must be between 9 and 16' });
      }
      updates.push('age = ?');
      values.push(numericAge);
    }

    if (parent_id !== undefined) { updates.push('parent_id = ?'); values.push(parent_id); }
    if (teacher_id !== undefined) { updates.push('teacher_id = ?'); values.push(teacher_id); }
    if (school_id !== undefined) { updates.push('school_id = ?'); values.push(school_id); }

    if (parsedLearnerPin) {
      const learnerPinHash = await bcrypt.hash(parsedLearnerPin, 10);
      updates.push('learner_pin_hash = ?');
      values.push(learnerPinHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(db,
      `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const student = await get(db, 'SELECT * FROM students WHERE id = ?', [req.params.id]);
    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'student.update',
      targetType: 'student',
      targetId: req.params.id,
      metadata: {
        before: sanitizeStudent(existingStudent),
        after: sanitizeStudent(student),
      },
    });
    res.json(sanitizeStudent(student));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete student (Tutor only)
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const existingStudent = await get(db, 'SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!existingStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await run(db, 'DELETE FROM students WHERE id = ?', [req.params.id]);
    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'student.delete',
      targetType: 'student',
      targetId: req.params.id,
      metadata: sanitizeStudent(existingStudent),
    });
    res.json({ message: 'Student deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
