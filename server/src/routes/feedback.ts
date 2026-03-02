import express from 'express';
import { all, get, getDb, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const parseMetadata = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

// POST /api/feedback
// Accept feedback from authenticated staff or learners.
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim().toLowerCase() : '';
    const pagePath = typeof req.body?.page_path === 'string' ? req.body.page_path.trim() : '';

    if (!message || message.length < 5) {
      return res.status(400).json({ error: 'Feedback message must be at least 5 characters' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Feedback message is too long (max 2000 characters)' });
    }

    const db = getDb();
    const id = uuidv4();
    const role = req.userRole || 'unknown';
    const userId = req.userId || null;
    const studentId = req.studentId || null;
    const metadata = req.body?.metadata === undefined ? null : JSON.stringify(req.body.metadata);

    await run(
      db,
      `INSERT INTO feedback (id, user_id, student_id, role, category, message, page_path, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, studentId, role, category || null, message, pagePath || null, metadata]
    );

    const created = await get(
      db,
      `SELECT id, user_id, student_id, role, category, message, page_path, status, created_at
       FROM feedback
       WHERE id = ?`,
      [id]
    );

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/feedback
// Tutor-only feedback inbox.
router.get('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];
    const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';

    if (status) {
      where.push('f.status = ?');
      params.push(status);
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 100;
    params.push(limit);

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await all(
      db,
      `SELECT f.*,
              u.name AS user_name,
              u.email AS user_email,
              s.name AS student_name,
              rb.name AS resolved_by_name
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN students s ON s.id = f.student_id
       LEFT JOIN users rb ON rb.id = f.resolved_by
       ${whereSql}
       ORDER BY f.created_at DESC
       LIMIT ?`,
      params
    );

    res.json(
      rows.map((row: any) => ({
        ...row,
        metadata: parseMetadata(row.metadata ?? null),
      }))
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
