import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { PaymentTransaction } from '../../models/PaymentTransaction.js';
import { MonthlyUsage } from '../../models/MonthlyUsage.js';
import { Counter } from '../../models/Counter.js';
import { Token } from '../../models/Token.js';
import {
  completePaymentAndUnlockQuota,
  fulfillQuotaForTransaction,
  getAvailableProviders,
} from '../../services/paymentService.js';
import { recoverQueueStateOnStartup, getTodayDateString, getCurrentMonthString } from '../../services/tokenEngine.js';
import { checkOrganizationSchedule } from '../../services/scheduleService.js';

const app = createApp();

describe('P0/P1 Payment Edge Cases, Core Recovery & Multi-Country Timezone', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('prevents silent quota loss when MonthlyUsage update matches 0 docs and handles concurrent completions', async () => {
    const providers = getAvailableProviders();
    expect(providers.map((p) => p.id)).toEqual(['STRIPE', 'SSLCOMMERZ', 'BKASH']);

    const custReg = await request(app).post('/api/auth/register').send({
      name: 'Pay Edge Cust',
      phone: '01777777771',
      password: 'Password123!',
    });
    const custId = custReg.body.user.id;
    const custToken = custReg.body.accessToken;

    const adminReg = await request(app).post('/api/auth/register').send({
      name: 'Pay Edge Admin',
      phone: '01777777772',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminReg.body.accessToken}`)
      .send({ name: 'Pay Edge Org', type: 'BANK', location: { address: 'Dhaka', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;
    const month = getCurrentMonthString();

    // 1. If MonthlyUsage.updateOne matches 0 documents, fulfillQuotaForTransaction must throw & NOT mark fulfilled
    const failedTx = await PaymentTransaction.create({
      userId: custId,
      organizationId: orgId,
      provider: 'STRIPE',
      providerSessionId: `cs_zero_match_${Date.now()}`,
      amount: 2,
      currency: 'USD',
      tokensUnlocked: 5,
      month,
      status: 'COMPLETED',
      quotaFulfilled: false,
    });

    const spy = vi.spyOn(MonthlyUsage, 'updateOne').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    await expect(fulfillQuotaForTransaction(failedTx._id)).rejects.toThrow('MonthlyUsage record could not be updated');
    spy.mockRestore();

    const stillPending = await PaymentTransaction.findById(failedTx._id).lean();
    expect(stillPending?.quotaFulfilled).toBe(false);

    // Retry succeeds cleanly when DB is healthy, creating/updating MonthlyUsage exactly once
    const retried = await fulfillQuotaForTransaction(failedTx._id);
    expect(retried).toBe(true);
    const usageAfter = await MonthlyUsage.findOne({ userId: custId, organizationId: orgId, month }).lean();
    expect(usageAfter?.paidExtraQuota).toBe(5);

    // 2. Concurrent completePaymentAndUnlockQuota calls + wrong ownership check
    const checkout = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, provider: 'BKASH' });
    const sid = checkout.body.sessionId as string;

    await expect(completePaymentAndUnlockQuota(sid, adminReg.body.user.id)).rejects.toThrow('Forbidden:');

    const [c1, c2] = await Promise.all([
      completePaymentAndUnlockQuota(sid, custId),
      completePaymentAndUnlockQuota(sid, custId),
    ]);
    expect((c1.unlocked || 0) + (c2.unlocked || 0)).toBe(5);
    const usageFinal = await MonthlyUsage.findOne({ userId: custId, organizationId: orgId, month }).lean();
    expect(usageFinal?.paidExtraQuota).toBe(10);
  });

  it('recovers orphaned counters while preserving active SERVING tokens across simultaneous startup recovery', async () => {
    const adminReg = await request(app).post('/api/auth/register').send({
      name: 'Rec Admin',
      phone: '01788888881',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminReg.body.accessToken}`)
      .send({ name: 'Rec Org', type: 'BANK', location: { address: 'Dhaka', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminReg.body.accessToken}`)
      .send({ organizationId: orgId, name: 'General', codePrefix: 'G' });
    const serviceId = svcRes.body.service._id;

    const today = getTodayDateString();
    const completedTok = await Token.create({
      organizationId: orgId,
      serviceId,
      tokenNumber: 'G-001',
      sequenceNumber: 1,
      queueDate: today,
      status: 'COMPLETED',
      source: 'KIOSK',
      trackingCode: 'REC_TRK_00000001',
      queueOrderScore: 1,
    });
    const servingTok = await Token.create({
      organizationId: orgId,
      serviceId,
      tokenNumber: 'G-002',
      sequenceNumber: 2,
      queueDate: today,
      status: 'SERVING',
      source: 'KIOSK',
      trackingCode: 'REC_TRK_00000002',
      queueOrderScore: 2,
    });

    const orphanedCounter = await Counter.create({
      organizationId: orgId,
      name: 'Orphaned',
      counterNumber: 10,
      assignedServices: [serviceId],
      currentTokenId: completedTok._id,
    });
    const activeCounter = await Counter.create({
      organizationId: orgId,
      name: 'Serving',
      counterNumber: 11,
      assignedServices: [serviceId],
      currentTokenId: servingTok._id,
    });

    await Promise.all([recoverQueueStateOnStartup(), recoverQueueStateOnStartup()]);

    const healed = await Counter.findById(orphanedCounter._id).lean();
    const preserved = await Counter.findById(activeCounter._id).lean();
    expect(healed?.currentTokenId).toBeNull();
    expect(preserved?.currentTokenId?.toString()).toBe(servingTok._id.toString());
  });

  it('supports multi-country organization timezones accurately', () => {
    // 2026-11-27T15:00:00Z -> 21:00 in Asia/Dhaka (UTC+6), 10:00 in America/New_York (UTC-5)
    const utcInstant = new Date('2026-11-27T15:00:00.000Z');
    const nyOpen = checkOrganizationSchedule(
      {
        timezone: 'America/New_York',
        workingHours: { open: '09:00', close: '17:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
        enforceWorkingHours: true,
      },
      utcInstant
    );
    const dhakaClosed = checkOrganizationSchedule(
      {
        timezone: 'Asia/Dhaka',
        workingHours: { open: '09:00', close: '17:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
        enforceWorkingHours: true,
      },
      utcInstant
    );
    expect(nyOpen.open).toBe(true);
    expect(dhakaClosed.open).toBe(false);
  });
});
