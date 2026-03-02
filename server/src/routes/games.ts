import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const MAX_THUMBNAIL_URL_LENGTH = 950_000;
const THUMBNAIL_DATA_URL_REGEX = /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+.-]+)*;base64,[a-zA-Z0-9+/=\s]+$/i;
const THUMBNAIL_HTTP_URL_REGEX = /^https?:\/\//i;
const THUMBNAIL_RELATIVE_URL_REGEX = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]+$/;

const isValidThumbnailUrl = (value: string): boolean =>
  THUMBNAIL_DATA_URL_REGEX.test(value) ||
  THUMBNAIL_HTTP_URL_REGEX.test(value) ||
  THUMBNAIL_RELATIVE_URL_REGEX.test(value);

// Get all games
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const games = await all(db,
      'SELECT * FROM games ORDER BY created_at DESC'
    );
    res.json(games);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single game
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const game = await get(db, 'SELECT * FROM games WHERE id = ?', [req.params.id]);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(game);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create game (Tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { title, description, category, difficulty_level, game_url, thumbnail_url, instructions, tracking_enabled } = req.body;
    const thumbnailUrl = typeof thumbnail_url === 'string' ? thumbnail_url.trim() : '';

    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required' });
    }

    if (!thumbnailUrl) {
      return res.status(400).json({ error: 'Thumbnail image is required' });
    }

    if (thumbnailUrl.length > MAX_THUMBNAIL_URL_LENGTH) {
      return res.status(400).json({ error: 'Thumbnail image is too large' });
    }

    if (!isValidThumbnailUrl(thumbnailUrl)) {
      return res.status(400).json({ error: 'Invalid thumbnail image format' });
    }

    if (!['computational_thinking', 'typing', 'purposeful_gaming'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const db = getDb();
    const id = uuidv4();

    await run(db,
      'INSERT INTO games (id, title, description, category, difficulty_level, game_url, thumbnail_url, instructions, tracking_enabled, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || null, category, difficulty_level || 1, game_url || null, thumbnailUrl, instructions || null, tracking_enabled !== undefined ? tracking_enabled : true, req.userId]
    );

    const game = await get(db, 'SELECT * FROM games WHERE id = ?', [id]);
    res.status(201).json(game);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update game (Tutor only)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { title, description, category, difficulty_level, game_url, thumbnail_url, instructions, tracking_enabled } = req.body;
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (category) { updates.push('category = ?'); values.push(category); }
    if (difficulty_level) { updates.push('difficulty_level = ?'); values.push(difficulty_level); }
    if (game_url !== undefined) { updates.push('game_url = ?'); values.push(game_url); }
    if (thumbnail_url !== undefined) {
      const thumbnailUrl = typeof thumbnail_url === 'string' ? thumbnail_url.trim() : '';
      if (thumbnailUrl.length > MAX_THUMBNAIL_URL_LENGTH) {
        return res.status(400).json({ error: 'Thumbnail image is too large' });
      }
      if (thumbnailUrl && !isValidThumbnailUrl(thumbnailUrl)) {
        return res.status(400).json({ error: 'Invalid thumbnail image format' });
      }
      updates.push('thumbnail_url = ?');
      values.push(thumbnailUrl || null);
    }
    if (instructions !== undefined) { updates.push('instructions = ?'); values.push(instructions); }
    if (tracking_enabled !== undefined) { updates.push('tracking_enabled = ?'); values.push(tracking_enabled); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(db,
      `UPDATE games SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const game = await get(db, 'SELECT * FROM games WHERE id = ?', [req.params.id]);
    res.json(game);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete game (Tutor only)
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await run(db, 'DELETE FROM games WHERE id = ?', [req.params.id]);
    res.json({ message: 'Game deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
