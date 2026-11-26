import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { MonthlyUsage } from '../models/MonthlyUsage.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { Service } from '../models/Service.js';
import { getCurrentMonthString } from '../services/tokenEngine.js';
import {
  getAvailableProviders,
  initiateExtraTokenCheckout,
  completePaymentAndUnlockQuota,
  constructStripeWebhookEvent,
} from '../services/paymentService.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/providers', (_req, res) => {
  res.json({ providers: getAvailableProviders() });
});

router.get('/quota', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const organizationId = req.query.organizationId as string | undefined;
    const month = getCurrentMonthString();

    if (!organizationId) {
      const transactions = await PaymentTransaction.find({ userId: req.user!.userId })
        .populate('organizationId', 'name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      res.json({ providers: getAvailableProviders(), transactions });
      return;
    }

    const [usage, firstService] = await Promise.all([
      MonthlyUsage.findOne({ userId: req.user!.userId, organizationId, month }).lean(),
      Service.findOne({ organizationId }).lean(),
    ]);

    const baseQuota = firstService?.monthlyQuota ?? 3;
    const paidExtraQuota = usage?.paidExtraQuota ?? 0;
    const remoteUsed = usage?.remoteUsed ?? 0;

    res.json({
      month,
      baseQuota,
      paidExtraQuota,
      effectiveLimit: baseQuota + paidExtraQuota,
      remoteUsed,
      remaining: Math.max(0, baseQuota + paidExtraQuota - remoteUsed),
      providers: getAvailableProviders(),
    });
  } catch (err) {
    next(err);
  }
});

const checkoutSchema = z.object({
  organizationId: z.string(),
  provider: z.enum(['STRIPE', 'SSLCOMMERZ', 'BKASH']),
});

router.post('/checkout', authenticate, validateBody(checkoutSchema), async (req: AuthRequest, res, next) => {
  try {
    const returnBaseUrl = env.FRONTEND_URL.split(',')[0].trim();
    const result = await initiateExtraTokenCheckout({
      userId: req.user!.userId,
      organizationId: req.body.organizationId,
      provider: req.body.provider,
      returnBaseUrl,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const verifySchema = z.object({ sessionId: z.string().min(3) });
router.post('/verify', authenticate, validateBody(verifySchema), async (req: AuthRequest, res, next) => {
  try {
    const result = await completePaymentAndUnlockQuota(req.body.sessionId, req.user!.userId);
    res.json({
      message: result.alreadyCompleted
        ? 'Payment already verified.'
        : `Payment verified! Unlocked +${result.unlocked} extra remote tokens for this month.`,
      ...result,
    });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.startsWith('Forbidden:')) {
      res.status(403).json({ error: msg, code: 'FORBIDDEN' });
      return;
    }
    if (msg.includes('not been completed') || msg.includes('not found') || msg.includes('Sandbox')) {
      res.status(400).json({ error: msg, code: 'PAYMENT_VERIFICATION_FAILED' });
      return;
    }
    next(err);
  }
});

router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }
  try {
    const event = constructStripeWebhookEvent(req.body as Buffer, sig);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { id: string };
      await completePaymentAndUnlockQuota(session.id);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || 'Webhook verification failed' });
  }
});

export default router;
