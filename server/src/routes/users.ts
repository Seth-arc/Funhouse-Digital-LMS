import express from 'express';
import bcrypt from 'bcryptjs';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { writeAuditLog } from './audit';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all users (Tutor only)
router.get('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    
    // Check if school_id column exists, if not use simpler query
    let users;
    try {
      users = await all(db,
        `SELECT u.id, u.email, u.name, u.role, u.school_id, u.created_at, s.name as school_name
         FROM users u
         LEFT JOIN schools s ON u.school_id = s.id
         ORDER BY u.created_at DESC`
      );
    } catch (e: any) {
      // Fallback if school_id doesn't exist yet
      users = await all(db,
        `SELECT u.id, u.email, u.name, u.role, u.created_at
         FROM users u
         ORDER BY u.created_at DESC`
      );
      // Add school_name as null for compatibility
      users = users.map((u: any) => ({ ...u, school_id: null, school_name: null }));
    }
    
    res.json(users);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get parents list (for assigning to students)
router.get('/parents', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const parents = await all(db,
      'SELECT id, email, name FROM users WHERE role = ?',
      ['parent']
    );
    res.json(parents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get teachers list
router.get('/teachers', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const teachers = await all(db,
      `SELECT u.id, u.email, u.name, u.school_id, s.name as school_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.role = ?`,
      ['teacher']
    );
    res.json(teachers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (Tutor only - for teachers and parents)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { email, password, name, role, school_id } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }

    if (!['teacher', 'parent'].includes(role)) {
      return res.status(400).json({ error: 'Role must be teacher or parent' });
    }

    const db = getDb();
    const existingUser = await get(db, 'SELECT id FROM users WHERE email = ?', [email]);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await run(db,
      'INSERT INTO users (id, email, password, name, role, school_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, email, hashedPassword, name, role, school_id || null, req.userId]
    );

    const user = await get(db,
      `SELECT u.id, u.email, u.name, u.role, u.school_id, s.name as school_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = ?`,
      [id]
    );

    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'user.create',
      targetType: 'user',
      targetId: id,
      metadata: {
        email: user?.email ?? email,
        name: user?.name ?? name,
        role: user?.role ?? role,
        school_id: user?.school_id ?? school_id ?? null,
      },
    });

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (Tutor only)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { email, name, school_id } = req.body;
    const db = getDb();
    const existingUser = await get(
      db,
      'SELECT id, email, name, role, school_id FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (school_id !== undefined) { updates.push('school_id = ?'); values.push(school_id); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(db,
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const user = await get(db,
      `SELECT u.id, u.email, u.name, u.role, u.school_id, s.name as school_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = ?`,
      [req.params.id]
    );

    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'user.update',
      targetType: 'user',
      targetId: req.params.id,
      metadata: {
        before: existingUser,
        after: user,
      },
    });

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (Tutor only)
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const existingUser = await get(
      db,
      'SELECT id, email, name, role, school_id FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await run(db, 'DELETE FROM users WHERE id = ?', [req.params.id]);

    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'user.delete',
      targetType: 'user',
      targetId: req.params.id,
      metadata: existingUser,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
