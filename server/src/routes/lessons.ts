import express from 'express';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const MAX_LESSON_THUMBNAIL_BYTES = 3 * 1024 * 1024;
const MAX_THUMBNAIL_URL_LENGTH = Math.ceil((MAX_LESSON_THUMBNAIL_BYTES * 4) / 3) + 256;
const MAX_LESSON_CONTENT_LENGTH = 40_000;
const THUMBNAIL_DATA_URL_REGEX = /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+.-]+)*;base64,[a-zA-Z0-9+/=\s]+$/i;
const THUMBNAIL_HTTP_URL_REGEX = /^https?:\/\//i;
const THUMBNAIL_RELATIVE_URL_REGEX = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]+$/;

const isValidThumbnailUrl = (value: string): boolean =>
  THUMBNAIL_DATA_URL_REGEX.test(value) ||
  THUMBNAIL_HTTP_URL_REGEX.test(value) ||
  THUMBNAIL_RELATIVE_URL_REGEX.test(value);

const sanitizeLessonContentJson = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('Invalid lesson content format');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_LESSON_CONTENT_LENGTH) {
    throw new Error('Lesson content is too large');
  }
  try {
    JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid lesson content format');
  }
  return trimmed;
};

const LESSON_SELECT_WITH_STATIONS = `
  SELECT l.*,
         g1.title as station_1_title, g1.category as station_1_category, g1.game_url as station_1_url,
         g2.title as station_2_title, g2.category as station_2_category, g2.game_url as station_2_url,
         g3.title as station_3_title, g3.category as station_3_category, g3.game_url as station_3_url
    FROM lessons l
    LEFT JOIN games g1 ON l.station_1_game_id = g1.id
    LEFT JOIN games g2 ON l.station_2_game_id = g2.id
    LEFT JOIN games g3 ON l.station_3_game_id = g3.id
`;

// Get all lessons
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const lessons = await all(db,
      `${LESSON_SELECT_WITH_STATIONS}
       ORDER BY l.created_at DESC`
    );
    res.json(lessons);
  } catch (error: any) {
    if (error.message === 'Invalid lesson content format' || error.message === 'Lesson content is too large') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get single lesson
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const lesson = await get(db,
      `${LESSON_SELECT_WITH_STATIONS}
       WHERE l.id = ?`,
      [req.params.id]
    );

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.json(lesson);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create lesson (Tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { title, description, thumbnail_url, lesson_content_json, station_1_game_id, station_2_game_id, station_3_game_id } = req.body;
    const thumbnailUrl = typeof thumbnail_url === 'string' ? thumbnail_url.trim() : '';
    const lessonContentJson = sanitizeLessonContentJson(lesson_content_json);

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
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

    const db = getDb();
    const id = uuidv4();

    await run(db,
      'INSERT INTO lessons (id, title, description, thumbnail_url, lesson_content_json, station_1_game_id, station_2_game_id, station_3_game_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || null, thumbnailUrl, lessonContentJson, station_1_game_id || null, station_2_game_id || null, station_3_game_id || null, req.userId]
    );

    const lesson = await get(db, `${LESSON_SELECT_WITH_STATIONS} WHERE l.id = ?`, [id]);
    res.status(201).json(lesson);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update lesson (Tutor only)
router.put('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { title, description, thumbnail_url, lesson_content_json, station_1_game_id, station_2_game_id, station_3_game_id } = req.body;
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
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
    if (lesson_content_json !== undefined) {
      const lessonContentJson = sanitizeLessonContentJson(lesson_content_json);
      updates.push('lesson_content_json = ?');
      values.push(lessonContentJson);
    }
    if (station_1_game_id !== undefined) { updates.push('station_1_game_id = ?'); values.push(station_1_game_id); }
    if (station_2_game_id !== undefined) { updates.push('station_2_game_id = ?'); values.push(station_2_game_id); }
    if (station_3_game_id !== undefined) { updates.push('station_3_game_id = ?'); values.push(station_3_game_id); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(db,
      `UPDATE lessons SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const lesson = await get(db, `${LESSON_SELECT_WITH_STATIONS} WHERE l.id = ?`, [req.params.id]);
    res.json(lesson);
  } catch (error: any) {
    if (error.message === 'Invalid lesson content format' || error.message === 'Lesson content is too large') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete lesson (Tutor only)
router.delete('/:id', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await run(db, 'DELETE FROM lessons WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
