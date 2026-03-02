import express from 'express';
import { all, getDb, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

export interface WriteAuditLogInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
}

const parseMetadata = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const writeAuditLog = async (input: WriteAuditLogInput): Promise<void> => {
  const db = getDb();
  await run(
    db,
    `INSERT INTO audit_logs (id, actor_user_id, actor_role, action, target_type, target_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ]
  );
};

// Tutor-only audit stream
router.get('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const params: any[] = [];
    const where: string[] = [];
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const targetType = typeof req.query.target_type === 'string' ? req.query.target_type.trim() : '';
    const targetId = typeof req.query.target_id === 'string' ? req.query.target_id.trim() : '';

    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }

    if (targetType) {
      where.push('a.target_type = ?');
      params.push(targetType);
    }

    if (targetId) {
      where.push('a.target_id = ?');
      params.push(targetId);
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 100;
    params.push(limit);

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await all(
      db,
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}
       ORDER BY a.created_at DESC
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
