import express from 'express';
import { getDb, get, run } from '../database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeAuditLog } from './audit';

const router = express.Router();

interface StudentAccessRow {
  id: string;
  parent_id: string | null;
  tutor_id: string | null;
  teacher_id: string | null;
}

interface ConsentRow {
  student_id: string;
  parent_consent: number;
  parent_consented_at: string | null;
  parent_consented_by: string | null;
  tutor_consent: number;
  tutor_consented_at: string | null;
  tutor_consented_by: string | null;
  notes: string | null;
  updated_at: string | null;
}

const parseConsent = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  }

  return null;
};

const toConsentPayload = (studentId: string, row: ConsentRow | null) => {
  const parentConsent = row?.parent_consent === 1 ? 1 : 0;
  const tutorConsent = row?.tutor_consent === 1 ? 1 : 0;

  return {
    student_id: studentId,
    parent_consent: parentConsent,
    parent_consented_at: row?.parent_consented_at ?? null,
    parent_consented_by: row?.parent_consented_by ?? null,
    tutor_consent: tutorConsent,
    tutor_consented_at: row?.tutor_consented_at ?? null,
    tutor_consented_by: row?.tutor_consented_by ?? null,
    notes: row?.notes ?? null,
    updated_at: row?.updated_at ?? null,
    can_proceed: parentConsent === 1 && tutorConsent === 1,
  };
};

const canReadConsent = (req: AuthRequest, student: StudentAccessRow): boolean => {
  if (req.userRole === 'parent') return student.parent_id === req.userId;
  if (req.userRole === 'tutor') return true;
  if (req.userRole === 'teacher') return student.teacher_id === req.userId;
  return false;
};

const canUpdateConsent = (req: AuthRequest, student: StudentAccessRow): boolean => {
  if (req.userRole === 'parent') return student.parent_id === req.userId;
  if (req.userRole === 'tutor') return true;
  return false;
};

// GET /api/consent/:studentId
router.get('/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.userRole || (req.userRole !== 'parent' && req.userRole !== 'tutor' && req.userRole !== 'teacher')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const db = getDb();
    const { studentId } = req.params;
    const student = (await get(
      db,
      'SELECT id, parent_id, tutor_id, teacher_id FROM students WHERE id = ?',
      [studentId]
    )) as StudentAccessRow | undefined;

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!canReadConsent(req, student)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const consent = (await get(
      db,
      `SELECT student_id, parent_consent, parent_consented_at, parent_consented_by,
              tutor_consent, tutor_consented_at, tutor_consented_by, notes, updated_at
         FROM student_consents
        WHERE student_id = ?`,
      [studentId]
    )) as ConsentRow | undefined;

    res.json(toConsentPayload(studentId, consent ?? null));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/consent/:studentId
router.put('/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.userRole || (req.userRole !== 'parent' && req.userRole !== 'tutor')) {
      return res.status(403).json({ error: 'Only parent or tutor can update consent' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsedConsent = parseConsent(req.body?.consent);
    if (parsedConsent === null) {
      return res.status(400).json({ error: 'consent must be true or false' });
    }

    const db = getDb();
    const { studentId } = req.params;
    const student = (await get(
      db,
      'SELECT id, parent_id, tutor_id, teacher_id FROM students WHERE id = ?',
      [studentId]
    )) as StudentAccessRow | undefined;

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!canUpdateConsent(req, student)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await run(db, 'INSERT OR IGNORE INTO student_consents (student_id) VALUES (?)', [studentId]);
    const previous = (await get(
      db,
      `SELECT student_id, parent_consent, parent_consented_at, parent_consented_by,
              tutor_consent, tutor_consented_at, tutor_consented_by, notes, updated_at
         FROM student_consents
        WHERE student_id = ?`,
      [studentId]
    )) as ConsentRow | undefined;

    const notesValue =
      typeof req.body?.notes === 'string'
        ? req.body.notes.trim() || null
        : previous?.notes ?? null;
    const nowIso = new Date().toISOString();

    if (req.userRole === 'parent') {
      await run(
        db,
        `UPDATE student_consents
            SET parent_consent = ?,
                parent_consented_at = ?,
                parent_consented_by = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE student_id = ?`,
        [parsedConsent ? 1 : 0, parsedConsent ? nowIso : null, parsedConsent ? req.userId : null, notesValue, studentId]
      );
    } else {
      await run(
        db,
        `UPDATE student_consents
            SET tutor_consent = ?,
                tutor_consented_at = ?,
                tutor_consented_by = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE student_id = ?`,
        [parsedConsent ? 1 : 0, parsedConsent ? nowIso : null, parsedConsent ? req.userId : null, notesValue, studentId]
      );
    }

    const updated = (await get(
      db,
      `SELECT student_id, parent_consent, parent_consented_at, parent_consented_by,
              tutor_consent, tutor_consented_at, tutor_consented_by, notes, updated_at
         FROM student_consents
        WHERE student_id = ?`,
      [studentId]
    )) as ConsentRow | undefined;

    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'consent.update',
      targetType: 'student',
      targetId: studentId,
      metadata: {
        updated_by_role: req.userRole,
        consent_value: parsedConsent,
        previous: toConsentPayload(studentId, previous ?? null),
        current: toConsentPayload(studentId, updated ?? null),
      },
    });

    res.json(toConsentPayload(studentId, updated ?? null));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
