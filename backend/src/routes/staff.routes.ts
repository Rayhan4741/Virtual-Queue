import { Router } from 'express';
import { z } from 'zod';
import { Counter } from '../models/Counter.js';
import { Organization } from '../models/Organization.js';
import { Token } from '../models/Token.js';
import { Announcement } from '../models/Announcement.js';
import { ServiceLog } from '../models/ServiceLog.js';
import { Service } from '../models/Service.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  callNextToken,
  recallToken,
  startServingToken,
  completeServingToken,
  skipOrNoShowToken,
  transferToken,
  issueToken,
  sortEligibleQueue,
  getTodayDateString,
  QueueEngineError,
} from '../services/tokenEngine.js';
import { emitQueueEvent } from '../services/socketService.js';
import { sendNotification } from '../services/notificationService.js';
import { recordAuditLog } from '../services/auditService.js';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'ADMIN'));

async function assertOrgAccess(orgId: string, user: NonNullable<AuthRequest['user']>) {
  if (user.organizationId && user.organizationId === orgId) return;
  if (user.role === 'ADMIN') {
    const owned = await Organization.exists({ _id: orgId, adminId: user.userId });
    if (owned) return;
  }
  throw new QueueEngineError('Forbidden: cross-organization staff access denied.', 403, 'FORBIDDEN_TENANT');
}

async function assertCounterAccess(counterId: string, user: NonNullable<AuthRequest['user']>) {
  const counter = await Counter.findById(counterId).lean();
  if (!counter) throw new QueueEngineError('Counter not found.', 404, 'COUNTER_NOT_FOUND');
  await assertOrgAccess(counter.organizationId.toString(), user);
  return counter;
}

router.get('/queue', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const filter: Record<string, unknown> = req.user!.role === 'ADMIN'
      ? { organizationId: req.user!.organizationId }
      : { assignedStaff: userId };

    let counter = await Counter.findOne(filter).populate('assignedServices', 'name codePrefix avgServiceTimeSec priorityPolicy').lean();
    if (!counter && req.user!.organizationId) {
      counter = await Counter.findOne({ organizationId: req.user!.organizationId })
        .populate('assignedServices', 'name codePrefix avgServiceTimeSec priorityPolicy')
        .lean();
    }

    if (!counter) {
      res.json({ counter: null, currentToken: null, waitingQueue: [], stats: { servedToday: 0, avgDurationSec: 0 } });
      return;
    }

    const serviceIds = counter.assignedServices.map((s) => s._id);
    const today = getTodayDateString();
    const [currentToken, rawWaiting, todayLogs, services] = await Promise.all([
      counter.currentTokenId ? Token.findById(counter.currentTokenId).lean() : null,
      Token.find({ serviceId: { $in: serviceIds }, queueDate: today, status: { $in: ['CHECKED_IN', 'WAITING'] } }),
      ServiceLog.find({ counterId: counter._id, completedAt: { $gte: new Date(`${today}T00:00:00.000Z`) } }).lean(),
      Service.find({ _id: { $in: serviceIds } }),
    ]);

    const sortedWaiting = services[0] ? sortEligibleQueue(rawWaiting, services[0]) : rawWaiting;
    const avgDurationSec =
      todayLogs.length > 0 ? Math.round(todayLogs.reduce((acc, l) => acc + l.durationSec, 0) / todayLogs.length) : 0;

    res.json({
      counter,
      currentToken,
      waitingQueue: sortedWaiting,
      stats: {
        servedToday: todayLogs.length,
        avgDurationSec,
        overloaded: sortedWaiting.length >= 10,
      },
    });
  } catch (err) {
    next(err);
  }
});

const counterActionSchema = z.object({ counterId: z.string() });
router.post('/call-next', validateBody(counterActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const token = await callNextToken(req.body.counterId, req.user!.userId, req.user!.role);
    const rooms = [`organization:${token.organizationId}`, `service:${token.serviceId}`];
    if (token.userId) rooms.push(`user:${token.userId}`);

    emitQueueEvent('token:called', rooms, { token, counterId: req.body.counterId });
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], {
      serviceId: token.serviceId,
    });

    if (token.userId) {
      await sendNotification({
        userId: token.userId.toString(),
        tokenId: token._id.toString(),
        organizationId: token.organizationId.toString(),
        type: 'TOKEN_CALLED',
        title: `Token ${token.tokenNumber} Called!`,
        message: 'Please proceed to your assigned counter immediately.',
        dedupeKey: `called:${token._id.toString()}:${token.calledAt?.getTime()}`,
      });
    }

    res.json({ token });
  } catch (err) {
    next(err);
  }
});

const tokenActionSchema = z.object({ tokenId: z.string(), counterId: z.string() });
router.post('/recall', validateBody(tokenActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const token = await recallToken(req.body.tokenId, req.body.counterId, req.user!.userId, req.user!.role);
    const rooms = [`organization:${token.organizationId}`, `service:${token.serviceId}`];
    if (token.userId) rooms.push(`user:${token.userId}`);
    emitQueueEvent('token:recalled', rooms, { token, counterId: req.body.counterId });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.post('/start', validateBody(tokenActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const token = await startServingToken(req.body.tokenId, req.body.counterId, req.user!.userId, req.user!.role);
    emitQueueEvent('token:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], { token });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.post('/complete', validateBody(tokenActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const token = await completeServingToken(req.body.tokenId, req.body.counterId, req.user!.userId, req.user!.role);
    const rooms = [`organization:${token.organizationId}`, `service:${token.serviceId}`];
    if (token.userId) rooms.push(`user:${token.userId}`);
    emitQueueEvent('token:completed', rooms, { token });
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], {
      serviceId: token.serviceId,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

const skipSchema = z.object({
  tokenId: z.string(),
  counterId: z.string(),
  reason: z.enum(['SKIPPED', 'NO_SHOW']).default('SKIPPED'),
});
router.post('/skip', validateBody(skipSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const token = await skipOrNoShowToken(
      req.body.tokenId,
      req.body.reason,
      req.body.counterId,
      req.user!.userId,
      req.user!.role
    );
    const rooms = [`organization:${token.organizationId}`, `service:${token.serviceId}`];
    if (token.userId) rooms.push(`user:${token.userId}`);
    emitQueueEvent('token:updated', rooms, { token });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

const transferSchema = z.object({
  tokenId: z.string(),
  targetServiceId: z.string(),
  sourceCounterId: z.string(),
});
router.post('/transfer', validateBody(transferSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.sourceCounterId, req.user!);
    const token = await transferToken(
      req.body.tokenId,
      req.body.targetServiceId,
      req.body.sourceCounterId,
      req.user!.userId,
      req.user!.role
    );
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], { token });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.post('/counter/pause', validateBody(counterActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const counter = await Counter.findById(req.body.counterId);
    if (!counter) {
      res.status(404).json({ error: 'Counter not found' });
      return;
    }
    // Release any stranded CALLED/SERVING token back to CHECKED_IN when counter pauses/fails
    if (counter.currentTokenId) {
      await Token.updateOne(
        { _id: counter.currentTokenId, status: { $in: ['CALLED', 'SERVING'] } },
        { $set: { status: 'CHECKED_IN' }, $unset: { counterId: 1, calledAt: 1, servingStartedAt: 1 } }
      );
      counter.currentTokenId = null;
    }
    counter.status = 'PAUSED';
    await counter.save();
    await recordAuditLog({
      organizationId: counter.organizationId,
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'COUNTER_PAUSED',
      counterId: counter._id,
      newState: 'PAUSED',
    });
    emitQueueEvent('counter:updated', [`organization:${counter.organizationId}`], { counter });
    res.json({ counter });
  } catch (err) {
    next(err);
  }
});

router.post('/counter/resume', validateBody(counterActionSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertCounterAccess(req.body.counterId, req.user!);
    const counter = await Counter.findByIdAndUpdate(req.body.counterId, { status: 'ACTIVE' }, { new: true });
    if (!counter) {
      res.status(404).json({ error: 'Counter not found' });
      return;
    }
    await recordAuditLog({
      organizationId: counter.organizationId,
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'COUNTER_RESUMED',
      counterId: counter._id,
      newState: 'ACTIVE',
    });
    emitQueueEvent('counter:updated', [`organization:${counter.organizationId}`], { counter });
    res.json({ counter });
  } catch (err) {
    next(err);
  }
});

const walkInSchema = z.object({
  organizationId: z.string(),
  serviceId: z.string(),
  guestName: z.string().trim().max(100).optional(),
  guestPhone: z.string().trim().max(30).optional(),
  priority: z.number().int().min(0).max(3).optional().default(0),
  manualFallback: z.boolean().optional().default(false),
});
router.post('/walk-in', validateBody(walkInSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertOrgAccess(req.body.organizationId, req.user!);
    const token = await issueToken({
      ...req.body,
      source: 'STAFF',
      actorId: req.user!.userId,
      actorRole: req.user!.role,
    });
    emitQueueEvent('token:created', [`organization:${token.organizationId}`, `service:${token.serviceId}`], { token });
    res.status(201).json({ token });
  } catch (err) {
    next(err);
  }
});

const announcementSchema = z.object({
  organizationId: z.string(),
  serviceId: z.string().optional(),
  message: z.string().trim().min(2).max(300),
});
router.post('/announcements', validateBody(announcementSchema), async (req: AuthRequest, res, next) => {
  try {
    await assertOrgAccess(req.body.organizationId, req.user!);
    const announcement = await Announcement.create({
      organizationId: req.body.organizationId,
      serviceId: req.body.serviceId,
      authorId: req.user!.userId,
      message: req.body.message,
    });
    emitQueueEvent('announcement:created', [`organization:${req.body.organizationId}`], { announcement });
    res.status(201).json({ announcement });
  } catch (err) {
    next(err);
  }
});

export default router;
