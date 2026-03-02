import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb, all, get, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { allowInitialTutorSignup, getJwtSecret } from '../config';
import { writeAuditLog } from './audit';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const JWT_SECRET = getJwtSecret();
const ALLOW_INITIAL_TUTOR_SIGNUP = allowInitialTutorSignup;
const LEARNER_PIN_PATTERN = /^\d{4,8}$/;
const STAFF_INVITE_ROLES = ['teacher', 'parent'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const INVITE_TTL_MS = 1000 * 60 * 60 * 72;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

const hashOpaqueToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'tutor') {
      return res.status(403).json({ error: 'Public registration is restricted. Ask a tutor to create your account.' });
    }

    if (!ALLOW_INITIAL_TUTOR_SIGNUP) {
      return res.status(403).json({ error: 'Initial tutor signup is disabled by configuration.' });
    }

    const db = getDb();
    const existingTutor = await get(db, 'SELECT id FROM users WHERE role = ?', ['tutor']);
    if (existingTutor) {
      return res.status(403).json({ error: 'Initial tutor already exists. Contact your system administrator.' });
    }

    const existingUser = await get(db, 'SELECT id FROM users WHERE email = ?', [email]);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await run(db,
      'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
      [id, email, hashedPassword, name, role]
    );

    const token = jwt.sign({ userId: id, role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id, email, name, role }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const user = await get(db,
      `SELECT u.*, s.name AS school_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.email = ?`,
      [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, school_name: user.school_name || null }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Learner login
router.post('/learner-login', async (req, res) => {
  try {
    const { student_id, name, grade, learner_pin, pin } = req.body ?? {};
    const normalizedPin =
      typeof learner_pin === 'string'
        ? learner_pin.trim()
        : typeof pin === 'string'
          ? pin.trim()
          : '';

    if (!normalizedPin) {
      return res.status(400).json({ error: 'Learner PIN is required' });
    }

    if (!LEARNER_PIN_PATTERN.test(normalizedPin)) {
      return res.status(400).json({ error: 'Learner PIN must be 4-8 digits' });
    }

    const db = getDb();
    let candidates: Array<{ id: string; name: string; grade: number; age: number; learner_pin_hash: string | null }> = [];

    if (typeof student_id === 'string' && student_id.trim()) {
      const student = await get(
        db,
        'SELECT id, name, grade, age, learner_pin_hash FROM students WHERE id = ?',
        [student_id.trim()]
      );
      if (student) candidates = [student];
    } else {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Student name is required when student_id is not provided' });
      }

      const params: any[] = [name.trim()];
      let query = 'SELECT id, name, grade, age, learner_pin_hash FROM students WHERE LOWER(name) = LOWER(?)';

      if (grade !== undefined && grade !== null && String(grade).trim() !== '') {
        const numericGrade = Number(grade);
        if (!Number.isInteger(numericGrade) || numericGrade < 4 || numericGrade > 9) {
          return res.status(400).json({ error: 'Grade must be between 4 and 9' });
        }
        query += ' AND grade = ?';
        params.push(numericGrade);
      }

      candidates = await all(db, query, params);
    }

    let matchedStudent: { id: string; name: string; grade: number; age: number } | null = null;

    for (const student of candidates) {
      if (!student.learner_pin_hash) continue;
      const pinMatches = await bcrypt.compare(normalizedPin, student.learner_pin_hash);
      if (pinMatches) {
        matchedStudent = {
          id: student.id,
          name: student.name,
          grade: student.grade,
          age: student.age,
        };
        break;
      }
    }

    if (!matchedStudent) {
      return res.status(401).json({ error: 'Invalid learner credentials' });
    }

    const token = jwt.sign({ studentId: matchedStudent.id, role: 'learner' }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      learner: matchedStudent,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Learner preview token (Tutor only, read-only session)
router.post('/learner-preview', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const studentId = typeof req.body?.student_id === 'string' ? req.body.student_id.trim() : '';
    if (!studentId) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    const db = getDb();
    const student = await get(
      db,
      'SELECT id, name, grade, age FROM students WHERE id = ?',
      [studentId]
    ) as { id: string; name: string; grade: number; age: number } | undefined;

    if (!student) {
      return res.status(404).json({ error: 'Learner not found' });
    }

    const previewExpiry = '1h';
    const token = jwt.sign(
      {
        studentId: student.id,
        role: 'learner',
        preview: true,
        impersonatedBy: req.userId,
      },
      JWT_SECRET,
      { expiresIn: previewExpiry }
    );

    await writeAuditLog({
      actorUserId: req.userId || null,
      actorRole: req.userRole || null,
      action: 'learner.preview.start',
      targetType: 'student',
      targetId: student.id,
      metadata: {
        student_name: student.name,
        read_only: true,
        expires_in: previewExpiry,
      },
    });

    res.json({
      token,
      learner: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        age: student.age,
      },
      preview: {
        read_only: true,
        expires_in: previewExpiry,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create invite (Tutor only)
router.post('/invite', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const { email, role, name, school_id } = req.body ?? {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const invitedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedEmail || !normalizedRole) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!STAFF_INVITE_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invite role must be teacher or parent' });
    }

    const db = getDb();
    const existingUser = await get(db, 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
    if (existingUser) {
      return res.status(400).json({ error: 'A user with that email already exists' });
    }

    if (school_id) {
      const school = await get(db, 'SELECT id FROM schools WHERE id = ?', [school_id]);
      if (!school) {
        return res.status(400).json({ error: 'School not found' });
      }
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenHash = hashOpaqueToken(inviteToken);
    const inviteId = uuidv4();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    await run(
      db,
      `INSERT INTO invites (id, email, role, invited_name, school_id, invited_by, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inviteId,
        normalizedEmail,
        normalizedRole,
        invitedName || null,
        school_id || null,
        req.userId,
        inviteTokenHash,
        expiresAt,
      ]
    );

    await writeAuditLog({
      actorUserId: req.userId,
      actorRole: req.userRole,
      action: 'invite.create',
      targetType: 'invite',
      targetId: inviteId,
      metadata: {
        email: normalizedEmail,
        role: normalizedRole,
        school_id: school_id || null,
      },
    });

    res.status(201).json({
      id: inviteId,
      email: normalizedEmail,
      role: normalizedRole,
      invited_name: invitedName || null,
      school_id: school_id || null,
      expires_at: expiresAt,
      invite_token: inviteToken,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Accept invite (public)
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password, name } = req.body ?? {};
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';
    const providedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedToken || !normalizedPassword) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = getDb();
    const invite = await get(
      db,
      `SELECT id, email, role, invited_name, school_id, invited_by, expires_at, accepted_at
       FROM invites
       WHERE token_hash = ?`,
      [hashOpaqueToken(normalizedToken)]
    );

    if (!invite) {
      return res.status(400).json({ error: 'Invalid invite token' });
    }

    if (invite.accepted_at) {
      return res.status(400).json({ error: 'Invite has already been accepted' });
    }

    if (invite.expires_at <= new Date().toISOString()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    const existingUser = await get(db, 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [invite.email]);
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this invite email already exists' });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const finalName = providedName || invite.invited_name || invite.email.split('@')[0];

    await run(
      db,
      `INSERT INTO users (id, email, password, name, role, school_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, invite.email, hashedPassword, finalName, invite.role, invite.school_id || null, invite.invited_by || null]
    );

    const acceptedAt = new Date().toISOString();
    await run(db, 'UPDATE invites SET accepted_at = ? WHERE id = ?', [acceptedAt, invite.id]);

    const tokenValue = jwt.sign({ userId, role: invite.role }, JWT_SECRET, { expiresIn: '7d' });
    const createdUser = await get(
      db,
      `SELECT u.id, u.email, u.name, u.role, u.school_id, s.name AS school_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.id = ?`,
      [userId]
    );

    await writeAuditLog({
      actorUserId: userId,
      actorRole: invite.role,
      action: 'invite.accept',
      targetType: 'invite',
      targetId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    res.json({
      token: tokenValue,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        school_name: createdUser.school_name || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Request password reset (public)
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDb();
    const user = await get(db, 'SELECT id, email, role FROM users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);

    const payload: Record<string, string> = {
      message: 'If an account exists for that email, password reset instructions have been generated.',
    };

    if (!user) {
      return res.json(payload);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashOpaqueToken(resetToken);
    const resetId = uuidv4();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
    const now = new Date().toISOString();

    await run(
      db,
      'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
      [now, user.id]
    );

    await run(
      db,
      `INSERT INTO password_resets (id, user_id, email, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [resetId, user.id, user.email, resetTokenHash, expiresAt]
    );

    await writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'password_reset.request',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        email: user.email,
        expires_at: expiresAt,
      },
    });

    payload.reset_token = resetToken;
    payload.expires_at = expiresAt;
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password (public)
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, new_password } = req.body ?? {};
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    const normalizedPassword =
      typeof new_password === 'string'
        ? new_password
        : typeof password === 'string'
          ? password
          : '';

    if (!normalizedToken || !normalizedPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const resetEntry = await get(
      db,
      `SELECT pr.id, pr.user_id, u.role, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = ?
         AND pr.used_at IS NULL
         AND pr.expires_at > ?
       ORDER BY pr.created_at DESC
       LIMIT 1`,
      [hashOpaqueToken(normalizedToken), now]
    );

    if (!resetEntry) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    await run(db, 'UPDATE users SET password = ? WHERE id = ?', [hashedPassword, resetEntry.user_id]);
    await run(db, 'UPDATE password_resets SET used_at = ? WHERE id = ?', [now, resetEntry.id]);

    await writeAuditLog({
      actorUserId: resetEntry.user_id,
      actorRole: resetEntry.role,
      action: 'password_reset.complete',
      targetType: 'user',
      targetId: resetEntry.user_id,
      metadata: {
        email: resetEntry.email,
      },
    });

    res.json({ message: 'Password reset successful' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const user = await get(db, 'SELECT id, email, name, role, created_at FROM users WHERE id = ?', [req.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
