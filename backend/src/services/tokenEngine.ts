import crypto from 'crypto';
import mongoose from 'mongoose';
import { Token, type IToken, type TokenSource, type TokenStatus } from '../models/Token.js';
import { TokenCounter } from '../models/TokenCounter.js';
import { Service, type IService } from '../models/Service.js';
import { Counter } from '../models/Counter.js';
import { MonthlyUsage } from '../models/MonthlyUsage.js';
import { ServiceLog } from '../models/ServiceLog.js';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import { updateEmaServiceTime } from './etaService.js';
import { recordAuditLog } from './auditService.js';

export class QueueEngineError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = 'QUEUE_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Explicit State Machine Transition Matrix.
 * Arbitrary status changes are rejected.
 */
export const ALLOWED_TRANSITIONS: Record<TokenStatus, TokenStatus[]> = {
  WAITING: ['CHECKED_IN', 'CALLED', 'CANCELLED'],
  CHECKED_IN: ['CALLED', 'CANCELLED'],
  CALLED: ['SERVING', 'NO_SHOW', 'SKIPPED'],
  SERVING: ['COMPLETED', 'SKIPPED'],
  NO_SHOW: ['CHECKED_IN'], // Controlled recovery via Late Pass only
  COMPLETED: [],
  CANCELLED: [],
  SKIPPED: [],
};

export function isValidTransition(from: TokenStatus, to: TokenStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getCurrentMonthString(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Concurrency-safe atomic sequence generator.
 * Uses Redis INCR when available, with MongoDB TokenCounter atomic findOneAndUpdate fallback.
 * Reconciles with MongoDB max sequence if Redis was restarted/flushed.
 */
export async function getNextTokenSequence(serviceId: string, queueDate: string): Promise<number> {
  if (isRedisAvailable()) {
    const redis = getRedisClient()!;
    const key = `vq:counter:${serviceId}:${queueDate}`;
    try {
      const exists = await redis.exists(key);
      if (!exists) {
        // Seed Redis from MongoDB if key is missing (e.g. after Redis restart)
        const existingCounter = await TokenCounter.findOne({ serviceId, date: queueDate }).lean();
        if (existingCounter && existingCounter.sequence > 0) {
          await redis.set(key, existingCounter.sequence, 'EX', 60 * 60 * 48, 'NX');
        }
      }
      const seq = await redis.incr(key);
      await redis.expire(key, 60 * 60 * 48);
      // Keep MongoDB TokenCounter in sync asynchronously/best-effort
      await TokenCounter.updateOne(
        { serviceId, date: queueDate },
        { $max: { sequence: seq } },
        { upsert: true }
      );
      return seq;
    } catch (err) {
      console.warn('[TokenEngine] Redis INCR failed, falling back to MongoDB:', (err as Error).message);
    }
  }

  const counter = await TokenCounter.findOneAndUpdate(
    { serviceId, date: queueDate },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return counter.sequence;
}

/**
 * Anti-starvation Priority Aging calculation:
 * Standard customers gain +1 effective priority for every `agingMinutes` waited,
 * capped at `maxPriorityLevel` so priority users never starve standard users indefinitely.
 */
export function computeEffectivePriority(params: {
  basePriority: number;
  createdAt: Date;
  now?: Date;
  agingEnabled: boolean;
  agingMinutes: number;
  maxPriorityLevel: number;
}): number {
  const { basePriority, createdAt, now = new Date(), agingEnabled, agingMinutes, maxPriorityLevel } = params;
  if (!agingEnabled || agingMinutes <= 0) return basePriority;
  const waitedMinutes = Math.max(0, (now.getTime() - createdAt.getTime()) / 60000);
  const ageBoost = Math.floor(waitedMinutes / agingMinutes);
  return Math.min(maxPriorityLevel, basePriority + ageBoost);
}

/**
 * Sorts eligible waiting tokens according to:
 * 1. Effective Priority (with anti-starvation aging) DESC
 * 2. queueOrderScore ASC (FCFS timestamp by default, shifted by Late Pass or Snooze)
 * 3. sequenceNumber ASC (tie-breaker)
 */
export function sortEligibleQueue(tokens: IToken[], service: IService, now = new Date()): IToken[] {
  const { enabled, agingMinutes, maxPriorityLevel } = service.priorityPolicy || {
    enabled: true,
    agingMinutes: 15,
    maxPriorityLevel: 3,
  };

  return [...tokens].sort((a, b) => {
    const prioA = computeEffectivePriority({
      basePriority: a.priority,
      createdAt: a.createdAt,
      now,
      agingEnabled: enabled,
      agingMinutes,
      maxPriorityLevel,
    });
    const prioB = computeEffectivePriority({
      basePriority: b.priority,
      createdAt: b.createdAt,
      now,
      agingEnabled: enabled,
      agingMinutes,
      maxPriorityLevel,
    });

    if (prioB !== prioA) return prioB - prioA;
    if (a.queueOrderScore !== b.queueOrderScore) return a.queueOrderScore - b.queueOrderScore;
    return a.sequenceNumber - b.sequenceNumber;
  });
}

export interface IssueTokenInput {
  organizationId: string;
  serviceId: string;
  userId?: string;
  source: TokenSource;
  priority?: number;
  guestName?: string;
  guestPhone?: string;
  manualFallback?: boolean;
  actorId?: string;
  actorRole?: string;
}

export async function issueToken(input: IssueTokenInput): Promise<IToken> {
  const service = await Service.findById(input.serviceId);
  if (!service || service.organizationId.toString() !== input.organizationId) {
    throw new QueueEngineError('Service not found for this organization.', 404, 'SERVICE_NOT_FOUND');
  }
  if (!service.isAvailable) {
    throw new QueueEngineError('This service is currently paused or unavailable.', 400, 'SERVICE_UNAVAILABLE');
  }
  if (input.source === 'REMOTE' && !service.remoteBookingEnabled) {
    throw new QueueEngineError('Remote booking is disabled for this service.', 400, 'REMOTE_DISABLED');
  }

  const queueDate = getTodayDateString();
  const month = getCurrentMonthString();

  // Remote token validations: duplicate active token & monthly quota
  if (input.source === 'REMOTE') {
    if (!input.userId) {
      throw new QueueEngineError('Authentication is required for remote tokens.', 401, 'AUTH_REQUIRED');
    }

    const existingActive = await Token.findOne({
      userId: input.userId,
      serviceId: input.serviceId,
      queueDate,
      status: { $in: ['WAITING', 'CHECKED_IN', 'CALLED', 'SERVING'] },
    }).lean();

    if (existingActive) {
      throw new QueueEngineError(
        `You already have an active token (${existingActive.tokenNumber}) for this service today.`,
        409,
        'DUPLICATE_ACTIVE_TOKEN'
      );
    }

    if (service.monthlyQuota > 0) {
      const usage = await MonthlyUsage.findOne({
        userId: input.userId,
        organizationId: input.organizationId,
        month,
      }).lean();

      const effectiveLimit = service.monthlyQuota + (usage?.paidExtraQuota ?? 0);
      if (usage && usage.remoteUsed >= effectiveLimit) {
        throw new QueueEngineError(
          `Monthly remote booking quota (${effectiveLimit}) reached for this organization. Unlock +5 extra tokens via Stripe, SSLCommerz, or bKash, or use Walk-in Kiosk.`,
          429,
          'QUOTA_EXCEEDED'
        );
      }
    }
  }

  // Generate unique atomic sequence with collision retry safeguard
  let createdToken: IToken | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = await getNextTokenSequence(input.serviceId, queueDate);
    const prefix = (service.codePrefix || 'A').toUpperCase();
    const tokenNumber = `${prefix}-${String(100 + seq)}`;
    const trackingCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    // Kiosk/Guest/Staff walk-ins are physically on-site so they start CHECKED_IN
    const initialStatus: TokenStatus = input.source === 'REMOTE' ? 'WAITING' : 'CHECKED_IN';

    try {
      createdToken = await Token.create({
        organizationId: input.organizationId,
        serviceId: input.serviceId,
        userId: input.userId ? new mongoose.Types.ObjectId(input.userId) : undefined,
        tokenNumber,
        sequenceNumber: seq,
        queueDate,
        source: input.source,
        priority: Math.max(0, Math.min(3, input.priority ?? 0)),
        queueOrderScore: Date.now(),
        status: initialStatus,
        checkedInAt: initialStatus === 'CHECKED_IN' ? new Date() : undefined,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        trackingCode,
        manualFallback: Boolean(input.manualFallback),
      });
      break;
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr?.code === 11000 && attempt < 4) {
        // Reconcile Redis if needed and retry
        continue;
      }
      throw err;
    }
  }

  if (!createdToken) {
    throw new QueueEngineError('Failed to allocate unique token number. Please retry.', 500, 'TOKEN_ALLOCATION_FAILED');
  }

  if (input.source === 'REMOTE' && input.userId) {
    await MonthlyUsage.updateOne(
      { userId: input.userId, organizationId: input.organizationId, month },
      { $inc: { remoteUsed: 1 } },
      { upsert: true }
    );
  }

  if (input.actorId) {
    await recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole || 'CUSTOMER',
      action: 'TOKEN_ISSUED',
      tokenId: createdToken._id as mongoose.Types.ObjectId,
      newState: createdToken.status,
      metadata: { source: input.source, tokenNumber: createdToken.tokenNumber, manualFallback: createdToken.manualFallback },
    });
  }

  return createdToken;
}

/**
 * Customer QR Check-In: WAITING -> CHECKED_IN
 */
export async function checkInToken(tokenId: string, organizationId: string, userId?: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (userId && token.userId && token.userId.toString() !== userId) {
    throw new QueueEngineError('You do not own this token.', 403, 'FORBIDDEN');
  }
  if (token.organizationId.toString() !== organizationId) {
    throw new QueueEngineError('QR code does not match this token organization.', 400, 'ORG_MISMATCH');
  }
  if (token.status === 'CHECKED_IN') {
    throw new QueueEngineError('Token is already checked in.', 409, 'ALREADY_CHECKED_IN');
  }
  if (!isValidTransition(token.status, 'CHECKED_IN')) {
    throw new QueueEngineError(`Cannot check in token from ${token.status} state.`, 400, 'INVALID_TRANSITION');
  }

  token.status = 'CHECKED_IN';
  token.checkedInAt = new Date();
  await token.save();
  return token;
}

/**
 * Customer Cancel: WAITING | CHECKED_IN -> CANCELLED
 */
export async function cancelToken(tokenId: string, userId: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!token.userId || token.userId.toString() !== userId) {
    throw new QueueEngineError('Unauthorized to cancel this token.', 403, 'FORBIDDEN');
  }
  if (!isValidTransition(token.status, 'CANCELLED')) {
    throw new QueueEngineError(`Cannot cancel token in ${token.status} state.`, 400, 'INVALID_TRANSITION');
  }

  token.status = 'CANCELLED';
  await token.save();
  return token;
}

/**
 * Customer Snooze: defers turn by snoozeDelayMinutes and shifts queueOrderScore behind next tokens.
 */
export async function snoozeToken(tokenId: string, userId: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!token.userId || token.userId.toString() !== userId) {
    throw new QueueEngineError('Unauthorized to snooze this token.', 403, 'FORBIDDEN');
  }
  if (token.status !== 'WAITING' && token.status !== 'CHECKED_IN') {
    throw new QueueEngineError('Only waiting or checked-in tokens can be snoozed.', 400, 'INVALID_TRANSITION');
  }

  const service = await Service.findById(token.serviceId);
  const maxSnoozes = service?.maxSnoozes ?? 2;
  const delayMin = service?.snoozeDelayMinutes ?? 10;

  if (token.snoozeCount >= maxSnoozes) {
    throw new QueueEngineError(`Maximum snooze limit (${maxSnoozes}) reached for this token.`, 400, 'SNOOZE_LIMIT');
  }

  token.snoozeCount += 1;
  token.snoozedUntil = new Date(Date.now() + delayMin * 60000);
  token.queueOrderScore = Date.now() + delayMin * 60000;
  await token.save();
  return token;
}

/**
 * Late Pass Recovery:
 * Allows one Late Pass per eligible NO_SHOW token, moving the customer 5 places back in the queue.
 */
export async function applyLatePass(tokenId: string, userId: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!token.userId || token.userId.toString() !== userId) {
    throw new QueueEngineError('Unauthorized to use Late Pass on this token.', 403, 'FORBIDDEN');
  }
  if (token.latePassUsed) {
    throw new QueueEngineError('Late Pass has already been used for this token.', 400, 'LATE_PASS_USED');
  }
  if (token.status !== 'NO_SHOW' || !isValidTransition(token.status, 'CHECKED_IN')) {
    throw new QueueEngineError('Late Pass is only available for NO_SHOW tokens.', 400, 'INVALID_TRANSITION');
  }

  const waitingTokens = await Token.find({
    serviceId: token.serviceId,
    queueDate: token.queueDate,
    status: { $in: ['WAITING', 'CHECKED_IN'] },
  })
    .sort({ queueOrderScore: 1 })
    .limit(6)
    .lean();

  let newScore: number;
  if (waitingTokens.length >= 5) {
    // Place 5 places back: just after the 5th person in queue
    const fifth = waitingTokens[4];
    const sixth = waitingTokens[5];
    newScore = sixth ? (fifth.queueOrderScore + sixth.queueOrderScore) / 2 : fifth.queueOrderScore + 1000;
  } else if (waitingTokens.length > 0) {
    newScore = waitingTokens[waitingTokens.length - 1].queueOrderScore + 1000;
  } else {
    newScore = Date.now();
  }

  token.status = 'CHECKED_IN';
  token.latePassUsed = true;
  token.checkedInAt = new Date();
  token.queueOrderScore = newScore;
  token.recallCount = 0;
  await token.save();

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: userId,
    actorRole: 'CUSTOMER',
    action: 'LATE_PASS_USED',
    tokenId: token._id as mongoose.Types.ObjectId,
    previousState: 'NO_SHOW',
    newState: 'CHECKED_IN',
    metadata: { placesBack: Math.min(5, waitingTokens.length) },
  });

  return token;
}

/**
 * Staff: Call Next eligible token for a counter.
 */
export async function callNextToken(counterId: string, staffId: string, staffRole: string): Promise<IToken> {
  const counter = await Counter.findById(counterId);
  if (!counter) throw new QueueEngineError('Counter not found.', 404, 'COUNTER_NOT_FOUND');
  if (counter.status !== 'ACTIVE') {
    throw new QueueEngineError('Counter must be ACTIVE to call the next customer.', 400, 'COUNTER_NOT_ACTIVE');
  }
  if (counter.currentTokenId) {
    const activeToken = await Token.findById(counter.currentTokenId);
    if (activeToken && ['CALLED', 'SERVING'].includes(activeToken.status)) {
      throw new QueueEngineError(
        `Counter is currently handling token ${activeToken.tokenNumber}. Complete or skip it first.`,
        409,
        'COUNTER_BUSY'
      );
    }
  }

  const now = new Date();
  const queueDate = getTodayDateString();
  const candidates = await Token.find({
    serviceId: { $in: counter.assignedServices },
    queueDate,
    status: 'CHECKED_IN',
    $or: [{ snoozedUntil: { $exists: false } }, { snoozedUntil: null }, { snoozedUntil: { $lte: now } }],
  });

  if (candidates.length === 0) {
    throw new QueueEngineError('No checked-in customers are waiting in the queue.', 404, 'QUEUE_EMPTY');
  }

  // Group/sort using first assigned service policy
  const service = await Service.findById(counter.assignedServices[0]);
  const sorted = service ? sortEligibleQueue(candidates, service, now) : candidates;
  const nextToken = sorted[0];

  const prevState = nextToken.status;
  nextToken.status = 'CALLED';
  nextToken.counterId = counter._id as mongoose.Types.ObjectId;
  nextToken.calledAt = now;
  nextToken.recallCount = 0;
  await nextToken.save();

  counter.currentTokenId = nextToken._id as mongoose.Types.ObjectId;
  await counter.save();

  await recordAuditLog({
    organizationId: counter.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: 'TOKEN_CALLED',
    tokenId: nextToken._id as mongoose.Types.ObjectId,
    counterId: counter._id as mongoose.Types.ObjectId,
    previousState: prevState,
    newState: 'CALLED',
    metadata: { tokenNumber: nextToken.tokenNumber, counterNumber: counter.counterNumber },
  });

  return nextToken;
}

/**
 * Staff: Recall a CALLED token (max 2 recalls).
 */
export async function recallToken(tokenId: string, counterId: string, staffId: string, staffRole: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (token.status !== 'CALLED') {
    throw new QueueEngineError('Only CALLED tokens can be recalled.', 400, 'INVALID_TRANSITION');
  }
  if (token.recallCount >= 2) {
    throw new QueueEngineError('Maximum 2 recall attempts reached. Mark as No-Show or Skip.', 400, 'RECALL_LIMIT');
  }

  token.recallCount += 1;
  token.lastRecalledAt = new Date();
  await token.save();

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: 'TOKEN_RECALLED',
    tokenId: token._id as mongoose.Types.ObjectId,
    counterId: new mongoose.Types.ObjectId(counterId),
    previousState: 'CALLED',
    newState: 'CALLED',
    metadata: { recallCount: token.recallCount },
  });

  return token;
}

/**
 * Staff: Start Service (CALLED -> SERVING)
 */
export async function startServingToken(tokenId: string, counterId: string, staffId: string, staffRole: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!isValidTransition(token.status, 'SERVING')) {
    throw new QueueEngineError(`Cannot start service from ${token.status} state.`, 400, 'INVALID_TRANSITION');
  }

  const prevState = token.status;
  token.status = 'SERVING';
  token.counterId = new mongoose.Types.ObjectId(counterId);
  token.servingStartedAt = new Date();
  await token.save();

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: 'SERVICE_STARTED',
    tokenId: token._id as mongoose.Types.ObjectId,
    counterId: new mongoose.Types.ObjectId(counterId),
    previousState: prevState,
    newState: 'SERVING',
  });

  return token;
}

/**
 * Staff: Complete Service (SERVING -> COMPLETED), record ServiceLog & update EMA.
 */
export async function completeServingToken(tokenId: string, counterId: string, staffId: string, staffRole: string): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!isValidTransition(token.status, 'COMPLETED')) {
    throw new QueueEngineError(`Cannot complete service from ${token.status} state.`, 400, 'INVALID_TRANSITION');
  }

  const now = new Date();
  const prevState = token.status;
  token.status = 'COMPLETED';
  token.completedAt = now;
  await token.save();

  await Counter.updateOne({ _id: counterId, currentTokenId: token._id }, { $set: { currentTokenId: null } });

  const startRef = token.servingStartedAt || token.calledAt || token.createdAt;
  const durationSec = Math.max(10, Math.round((now.getTime() - startRef.getTime()) / 1000));
  const waitTimeSec = Math.max(0, Math.round(((token.servingStartedAt || now).getTime() - token.createdAt.getTime()) / 1000));

  await ServiceLog.create({
    organizationId: token.organizationId,
    serviceId: token.serviceId,
    counterId: new mongoose.Types.ObjectId(counterId),
    tokenId: token._id,
    durationSec,
    waitTimeSec,
    hourOfDay: now.getHours(),
    completedAt: now,
  });

  await updateEmaServiceTime(token.serviceId.toString(), durationSec);

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: 'SERVICE_COMPLETED',
    tokenId: token._id as mongoose.Types.ObjectId,
    counterId: new mongoose.Types.ObjectId(counterId),
    previousState: prevState,
    newState: 'COMPLETED',
    metadata: { durationSec, waitTimeSec },
  });

  return token;
}

/**
 * Staff: Skip or Mark No-Show (CALLED/SERVING -> SKIPPED or CALLED -> NO_SHOW)
 */
export async function skipOrNoShowToken(
  tokenId: string,
  targetStatus: 'SKIPPED' | 'NO_SHOW',
  counterId: string,
  staffId: string,
  staffRole: string
): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!isValidTransition(token.status, targetStatus)) {
    throw new QueueEngineError(`Cannot transition token from ${token.status} to ${targetStatus}.`, 400, 'INVALID_TRANSITION');
  }

  const prevState = token.status;
  token.status = targetStatus;
  await token.save();

  await Counter.updateOne({ _id: counterId, currentTokenId: token._id }, { $set: { currentTokenId: null } });

  if (targetStatus === 'NO_SHOW' && token.userId) {
    const month = getCurrentMonthString();
    await MonthlyUsage.updateOne(
      { userId: token.userId, organizationId: token.organizationId, month },
      { $inc: { strikes: 1 } },
      { upsert: true }
    );
  }

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: targetStatus === 'NO_SHOW' ? 'TOKEN_NO_SHOW' : 'TOKEN_SKIPPED',
    tokenId: token._id as mongoose.Types.ObjectId,
    counterId: new mongoose.Types.ObjectId(counterId),
    previousState: prevState,
    newState: targetStatus,
  });

  return token;
}

/**
 * Staff: Transfer token to another service or counter within the same organization.
 */
export async function transferToken(
  tokenId: string,
  targetServiceId: string,
  sourceCounterId: string,
  staffId: string,
  staffRole: string
): Promise<IToken> {
  const token = await Token.findById(tokenId);
  if (!token) throw new QueueEngineError('Token not found.', 404, 'TOKEN_NOT_FOUND');
  if (!['CHECKED_IN', 'CALLED', 'SERVING'].includes(token.status)) {
    throw new QueueEngineError('Only active on-site tokens can be transferred.', 400, 'INVALID_TRANSITION');
  }

  const targetService = await Service.findById(targetServiceId);
  if (!targetService || targetService.organizationId.toString() !== token.organizationId.toString()) {
    throw new QueueEngineError('Target service not found in this organization.', 404, 'SERVICE_NOT_FOUND');
  }

  const prevState = token.status;
  const prevServiceId = token.serviceId.toString();
  token.serviceId = targetService._id as mongoose.Types.ObjectId;
  token.status = 'CHECKED_IN';
  token.counterId = undefined;
  token.calledAt = undefined;
  token.servingStartedAt = undefined;
  await token.save();

  await Counter.updateOne({ _id: sourceCounterId, currentTokenId: token._id }, { $set: { currentTokenId: null } });

  await recordAuditLog({
    organizationId: token.organizationId,
    actorId: staffId,
    actorRole: staffRole,
    action: 'TOKEN_TRANSFERRED',
    tokenId: token._id as mongoose.Types.ObjectId,
    counterId: new mongoose.Types.ObjectId(sourceCounterId),
    previousState: prevState,
    newState: 'CHECKED_IN',
    metadata: { fromServiceId: prevServiceId, toServiceId: targetServiceId },
  });

  return token;
}

/**
 * Automatic 3-minute No-Show processor:
 * Marks CALLED tokens with recallCount >= 2 and > 3 minutes elapsed since lastRecalledAt (or calledAt) as NO_SHOW.
 */
export async function processExpiredCalledTokens(graceMinutes = 3): Promise<IToken[]> {
  const cutoff = new Date(Date.now() - graceMinutes * 60000);
  const expired = await Token.find({
    status: 'CALLED',
    recallCount: { $gte: 2 },
    $or: [
      { lastRecalledAt: { $lte: cutoff } },
      { lastRecalledAt: { $exists: false }, calledAt: { $lte: cutoff } },
    ],
  });

  const updated: IToken[] = [];
  for (const token of expired) {
    token.status = 'NO_SHOW';
    await token.save();
    if (token.counterId) {
      await Counter.updateOne({ _id: token.counterId, currentTokenId: token._id }, { $set: { currentTokenId: null } });
    }
    if (token.userId) {
      await MonthlyUsage.updateOne(
        { userId: token.userId, organizationId: token.organizationId, month: getCurrentMonthString() },
        { $inc: { strikes: 1 } },
        { upsert: true }
      );
    }
    updated.push(token);
  }
  return updated;
}
