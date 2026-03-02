import express from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import seedDatabase from '../seed';

const router = express.Router();

// Seed database (Tutor only)
router.post('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    await seedDatabase();
    res.json({ message: 'Database seeded successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
