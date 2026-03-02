import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getSyncVersionSnapshot } from '../services/sync-version';

const router = express.Router();

router.get('/version', authenticate, (_req: AuthRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getSyncVersionSnapshot());
});

export default router;
