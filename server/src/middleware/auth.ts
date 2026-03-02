import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config';

const JWT_SECRET = getJwtSecret();

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  studentId?: string;
  isPreviewSession?: boolean;
  impersonatedByUserId?: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId?: string;
      studentId?: string;
      role: string;
      preview?: boolean;
      impersonatedBy?: string;
    };

    if (decoded.role === 'learner') {
      if (!decoded.studentId) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.studentId = decoded.studentId;
      req.userRole = 'learner';
      req.isPreviewSession = decoded.preview === true;
      req.impersonatedByUserId =
        typeof decoded.impersonatedBy === 'string' && decoded.impersonatedBy.trim()
          ? decoded.impersonatedBy.trim()
          : undefined;
      next();
      return;
    }

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.isPreviewSession = false;
    req.impersonatedByUserId = undefined;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
