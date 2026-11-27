import { Router } from 'express';
import { z } from 'zod';
import { Token } from '../models/Token.js';
import { Organization } from '../models/Organization.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  issueToken,
  checkInToken,
  cancelToken,
  snoozeToken,
  applyLatePass,
} from '../services/tokenEngine.js';
import { getServiceEta } from '../services/etaService.js';
import { verifySignedQrToken, markQrNonceUsed } from '../services/qrService.js';
import { emitQueueEvent } from '../services/socketService.js';
import { sendNotification } from '../services/notificationService.js';
import { estimateTravelTime } from '../services/travelService.js';

const router = Router();

const createTokenSchema = z.object({
  organizationId: z.string(),
  serviceId: z.string(),
  priority: z.number().int().min(0).max(3).optional().default(0),
});

router.post('/', authenticate, validateBody(createTokenSchema), async (req: AuthRequest, res, next) => {
  try {
    const token = await issueToken({
      organizationId: req.body.organizationId,
      serviceId: req.body.serviceId,
      userId: req.user!.userId,
      source: 'REMOTE',
      priority: req.body.priority,
      actorId: req.user!.userId,
      actorRole: req.user!.role,
    });

    const eta = await getServiceEta(token.serviceId.toString(), token.queueOrderScore);

    emitQueueEvent('token:created', [`organization:${token.organizationId}`, `service:${token.serviceId}`, `user:${req.user!.userId}`], {
      tokenId: token._id,
      tokenNumber: token.tokenNumber,
      serviceId: token.serviceId,
      status: token.status,
    });
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], {
      serviceId: token.serviceId,
    });

    await sendNotification({
      userId: req.user!.userId,
      tokenId: token._id.toString(),
      organizationId: token.organizationId.toString(),
      type: 'TOKEN_CREATED',
      title: `Token ${token.tokenNumber} Confirmed`,
      message: `You are #${eta.peopleAhead + 1} in queue. Approximate wait: ~${eta.estimatedWaitMinutes} min.`,
      dedupeKey: `created:${token._id.toString()}`,
    });

    res.status(201).json({ token, eta });
  } catch (err) {
    next(err);
  }
});

router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tokens = await Token.find({ userId: req.user!.userId })
      .populate('organizationId', 'name type location')
      .populate('serviceId', 'name codePrefix avgServiceTimeSec')
      .populate('counterId', 'name counterNumber')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const active = tokens.find((t) => ['WAITING', 'CHECKED_IN', 'CALLED', 'SERVING'].includes(t.status));
    let activeEta = null;
    if (active) {
      activeEta = await getServiceEta(active.serviceId._id.toString(), active.queueOrderScore);
    }

    res.json({ tokens, activeToken: active || null, activeEta });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const token = await Token.findById(req.params.id)
      .populate('organizationId', 'name type location')
      .populate('serviceId', 'name codePrefix avgServiceTimeSec maxSnoozes snoozeDelayMinutes')
      .populate('counterId', 'name counterNumber')
      .lean();

    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    if (req.user!.role === 'CUSTOMER' && token.userId?.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const [eta, currentServing] = await Promise.all([
      getServiceEta(token.serviceId._id.toString(), token.queueOrderScore),
      Token.findOne({ serviceId: token.serviceId._id, status: 'SERVING' }).select('tokenNumber').lean(),
    ]);

    res.json({ token, eta, currentServingToken: currentServing?.tokenNumber || null });
  } catch (err) {
    next(err);
  }
});

const checkInSchema = z.object({ qrPayload: z.string().min(10) });
router.post('/:id/check-in', authenticate, validateBody(checkInSchema), async (req: AuthRequest, res, next) => {
  try {
    const verification = verifySignedQrToken(req.body.qrPayload);
    if (!verification.valid || !verification.payload) {
      res.status(400).json({ error: verification.reason || 'Invalid QR code', code: 'INVALID_QR' });
      return;
    }
    if (!markQrNonceUsed(verification.payload.nonce, verification.payload.exp)) {
      res.status(409).json({ error: 'QR code has already been used (replay blocked).', code: 'QR_REPLAY' });
      return;
    }
    const token = await checkInToken(String(req.params.id), verification.payload.organizationId, req.user!.userId);
    emitQueueEvent('token:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`, `user:${req.user!.userId}`], {
      tokenId: token._id,
      status: token.status,
    });
    res.json({ token, message: 'Checked in successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const token = await cancelToken(String(req.params.id), req.user!.userId);
    emitQueueEvent('token:cancelled', [`organization:${token.organizationId}`, `service:${token.serviceId}`, `user:${req.user!.userId}`], {
      tokenId: token._id,
      tokenNumber: token.tokenNumber,
      status: token.status,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/snooze', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const token = await snoozeToken(String(req.params.id), req.user!.userId);
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`, `user:${req.user!.userId}`], {
      tokenId: token._id,
      snoozedUntil: token.snoozedUntil,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/late-pass', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const token = await applyLatePass(String(req.params.id), req.user!.userId);
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`, `user:${req.user!.userId}`], {
      tokenId: token._id,
      status: token.status,
    });
    res.json({ token, message: 'Late Pass applied. You rejoined the queue 5 places back.' });
  } catch (err) {
    next(err);
  }
});

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
router.post('/:id/rate', authenticate, validateBody(rateSchema), async (req: AuthRequest, res, next) => {
  try {
    const token = await Token.findById(req.params.id);
    if (!token || token.userId?.toString() !== req.user!.userId) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    if (token.status !== 'COMPLETED') {
      res.status(400).json({ error: 'Only completed services can be rated.' });
      return;
    }
    if (typeof token.rating === 'number') {
      res.status(409).json({ error: 'Token has already been rated.' });
      return;
    }
    token.rating = req.body.rating;
    token.ratingComment = req.body.comment ? req.body.comment.replace(/[<>]/g, '') : undefined;
    await token.save();
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

const travelSchema = z.object({
  originLat: z.number(),
  originLng: z.number(),
  mode: z.enum(['driving-car', 'foot-walking', 'cycling-regular']).optional(),
  bufferMinutes: z.number().min(0).max(30).optional().default(5),
});
router.post('/:id/leave-alert', authenticate, validateBody(travelSchema), async (req: AuthRequest, res, next) => {
  try {
    const token = await Token.findById(req.params.id);
    if (!token || token.userId?.toString() !== req.user!.userId) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    const org = await Organization.findById(token.organizationId).lean();
    const destLat = org?.location?.lat ?? req.body.originLat + 0.015;
    const destLng = org?.location?.lng ?? req.body.originLng + 0.015;

    const [travel, eta] = await Promise.all([
      estimateTravelTime({
        originLat: req.body.originLat,
        originLng: req.body.originLng,
        destLat,
        destLng,
        mode: req.body.mode,
      }),
      getServiceEta(token.serviceId.toString(), token.queueOrderScore),
    ]);

    const waitMinutes = eta.estimatedWaitMinutes ?? 0;
    const leaveInMinutes = waitMinutes - travel.durationMinutes - req.body.bufferMinutes;
    const shouldLeaveNow = eta.estimatedWaitMinutes !== null && leaveInMinutes <= 2;

    if (shouldLeaveNow) {
      await sendNotification({
        userId: req.user!.userId,
        tokenId: token._id.toString(),
        organizationId: token.organizationId.toString(),
        type: 'LEAVE_ALERT',
        title: `Time to leave for ${org?.name || 'your appointment'}`,
        message: `Estimated travel: ~${travel.durationMinutes} min. Estimated queue wait: ~${eta.estimatedWaitMinutes} min.`,
        dedupeKey: `leave:${token._id.toString()}:${Math.floor(Date.now() / 300000)}`,
      });
    }

    res.json({
      travel,
      eta,
      bufferMinutes: req.body.bufferMinutes,
      leaveInMinutes: Math.max(0, leaveInMinutes),
      shouldLeaveNow,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
