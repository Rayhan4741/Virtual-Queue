import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Quota & Multi-Gateway Billing (Stripe / SSLCommerz / bKash)', () => {
  it('blocks 4th remote token after 3 free tokens and unlocks +5 after payment verification', async () => {
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Bill Admin',
      phone: '01400000001',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Billing Bank', type: 'BANK', location: { address: '1 Pay St', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'VIP Desk', codePrefix: 'V', monthlyQuota: 3 });
    const serviceId = svcRes.body.service._id;

    const custRes = await request(app).post('/api/auth/register').send({
      name: 'Pay Customer',
      phone: '01400000002',
      password: 'Password123!',
    });
    const custToken = custRes.body.accessToken;

    // Book and cancel 3 free tokens
    for (let i = 0; i < 3; i++) {
      const b = await request(app).post('/api/tokens').set('Authorization', `Bearer ${custToken}`).send({ organizationId: orgId, serviceId });
      expect(b.status).toBe(201);
      await request(app).post(`/api/tokens/${b.body.token._id}/cancel`).set('Authorization', `Bearer ${custToken}`);
    }

    // 4th token blocked by 3-token free quota
    const blocked = await request(app).post('/api/tokens').set('Authorization', `Bearer ${custToken}`).send({ organizationId: orgId, serviceId });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('QUOTA_EXCEEDED');

    // Checkout via BKASH (or STRIPE / SSLCOMMERZ) and verify
    const checkout = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, provider: 'BKASH' });
    expect(checkout.status).toBe(201);

    const verify = await request(app)
      .post('/api/billing/verify')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ sessionId: checkout.body.sessionId });
    expect(verify.status).toBe(200);
    expect(verify.body.unlocked).toBe(5);

    // 4th token now succeeds!
    const unlockedBook = await request(app).post('/api/tokens').set('Authorization', `Bearer ${custToken}`).send({ organizationId: orgId, serviceId });
    expect(unlockedBook.status).toBe(201);

    // Crash recovery: COMPLETED payment with quotaFulfilled=false recovers exactly once without double-crediting
    const { PaymentTransaction } = await import('../../models/PaymentTransaction.js');
    const { MonthlyUsage } = await import('../../models/MonthlyUsage.js');
    const { recoverPendingQuotaFulfillments } = await import('../../services/paymentService.js');
    const { getCurrentMonthString } = await import('../../services/tokenEngine.js');

    const month = getCurrentMonthString();
    const beforeUsage = await MonthlyUsage.findOne({ organizationId: orgId, month }).lean();
    const beforeQuota = beforeUsage?.paidExtraQuota ?? 0;

    await PaymentTransaction.create({
      userId: custRes.body.user.id,
      organizationId: orgId,
      provider: 'STRIPE',
      providerSessionId: `cs_crash_test_${Date.now()}`,
      amount: 2,
      currency: 'USD',
      tokensUnlocked: 5,
      month,
      status: 'COMPLETED',
      quotaFulfilled: false,
    });

    const recoveredFirst = await recoverPendingQuotaFulfillments();
    const recoveredSecond = await recoverPendingQuotaFulfillments();
    expect(recoveredFirst).toBe(1);
    expect(recoveredSecond).toBe(0);

    const afterUsage = await MonthlyUsage.findOne({ organizationId: orgId, month }).lean();
    expect(afterUsage?.paidExtraQuota).toBe(beforeQuota + 5);
  });
});
