import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { User } from '../models/User.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(6).max(100),
  role: z.enum(['CUSTOMER', 'ADMIN']).optional().default('CUSTOMER'),
});

const loginSchema = z.object({
  phone: z.string().trim().min(3),
  password: z.string().min(1),
});

function setRefreshCookie(res: import('express').Response, refreshToken: string) {
  res.cookie('vq_refresh', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, phone, email, password, role } = req.body;
    const existing = await User.findOne({ phone }).lean();
    if (existing) {
      res.status(409).json({ error: 'An account with this phone number already exists.', code: 'PHONE_EXISTS' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone,
      email: email || undefined,
      passwordHash,
      role,
    });

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      organizationId: user.organizationId?.toString(),
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = signRefreshToken({ userId: user._id.toString(), tokenVersion: user.tokenVersion });
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid phone number or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }
    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account is suspended.', code: 'ACCOUNT_SUSPENDED' });
      return;
    }

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      organizationId: user.organizationId?.toString(),
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = signRefreshToken({ userId: user._id.toString(), tokenVersion: user.tokenVersion });
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.vq_refresh as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing refresh token', code: 'NO_REFRESH_TOKEN' });
    return;
  }
  try {
    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.userId);
    if (!user || user.tokenVersion !== payload.tokenVersion || user.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Refresh token revoked', code: 'REFRESH_REVOKED' });
      return;
    }

    // Rotate refresh token by incrementing tokenVersion
    user.tokenVersion += 1;
    await user.save();

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      organizationId: user.organizationId?.toString(),
      tokenVersion: user.tokenVersion,
    });
    const nextRefresh = signRefreshToken({ userId: user._id.toString(), tokenVersion: user.tokenVersion });
    setRefreshCookie(res, nextRefresh);

    res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.userId) {
    await User.updateOne({ _id: req.user.userId }, { $inc: { tokenVersion: 1 } });
  }
  res.clearCookie('vq_refresh', { path: '/api/auth' });
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.user?.userId).select('-passwordHash -resetTokenHash').lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: { ...user, id: user._id } });
  } catch (err) {
    next(err);
  }
});

const forgotSchema = z.object({ phone: z.string().trim().min(3) });
router.post('/forgot-password', authLimiter, validateBody(forgotSchema), async (req, res, next) => {
  try {
    const user = await User.findOne({ phone: req.body.phone });
    if (user) {
      const rawToken = crypto.randomBytes(20).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      // In production this is emailed; in dev/test we return a confirmation without leaking if phone exists
      if (env.NODE_ENV !== 'production') {
        res.json({ message: 'If an account exists, a reset code has been generated.', devResetToken: rawToken });
        return;
      }
    }
    res.json({ message: 'If an account exists, password reset instructions have been sent.' });
  } catch (err) {
    next(err);
  }
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6).max(100),
});
router.post('/reset-password', authLimiter, validateBody(resetSchema), async (req, res, next) => {
  try {
    const hash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token.', code: 'INVALID_RESET_TOKEN' });
      return;
    }
    user.passwordHash = await bcrypt.hash(req.body.password, 10);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.tokenVersion += 1;
    await user.save();
    res.json({ message: 'Password reset successful. Please log in.' });
  } catch (err) {
    next(err);
  }
});

export default router;
