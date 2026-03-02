import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all schools (Tutor only)
router.get('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    // Check if schools table exists
    const tableExists = await get(db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schools'"
    );
    
    if (!tableExists) {
      // Initialize database if table doesn't exist
      const { initDatabase } = require('../database');
      await initDatabase();
    }
    
    try {
      const schools = await all(db,
        'SELECT * FROM schools ORDER BY created_at DESC'
      );
      res.json(schools);
    } catch (queryError: any) {
      // If query fails, return empty array (table might not be fully initialized)
      console.warn('Schools table query failed, returning empty array:', queryError.message);
      res.json([]);
    }
  } catch (error: any) {
    console.error('Error fetching schools:', error);
    // Return empty array instead of error to prevent frontend crashes
    res.json([]);
  }
});

// Get single school
router.get('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const school = await get(db, 'SELECT * FROM schools WHERE id = ?', [req.params.id]);

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(school);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create school (Tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { name, address, contact_email, contact_phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'School name is required' });
    }

    const db = getDb();
    const id = uuidv4();

    await run(db,
      'INSERT INTO schools (id, name, address, contact_email, contact_phone, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, address || null, contact_email || null, contact_phone || null, req.userId]
    );

    const school = await get(db, 'SELECT * FROM schools WHERE id = ?', [id]);
    res.status(201).json(school);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update school (Tutor only)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { name, address, contact_email, contact_phone } = req.body;
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }
    if (contact_email !== undefined) { updates.push('contact_email = ?'); values.push(contact_email); }
    if (contact_phone !== undefined) { updates.push('contact_phone = ?'); values.push(contact_phone); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(db,
      `UPDATE schools SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const school = await get(db, 'SELECT * FROM schools WHERE id = ?', [req.params.id]);
    res.json(school);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete school (Tutor only)
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await run(db, 'DELETE FROM schools WHERE id = ?', [req.params.id]);
    res.json({ message: 'School deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
