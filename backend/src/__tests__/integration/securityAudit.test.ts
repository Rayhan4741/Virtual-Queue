import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';
import { MonthlyUsage } from '../../models/MonthlyUsage.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Security Audit Regression: Cross-Tenant IDOR & Payment Idempotency', () => {
  it('blocks cross-organization staff/admin counter operations and entrance QR access', async () => {
    const adminA = await request(app).post('/api/auth/register').send({
      name: 'Admin A',
      phone: '01311111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminB = await request(app).post('/api/auth/register').send({
      name: 'Admin B',
      phone: '01322222222',
      password: 'Password123!',
      role: 'ADMIN',
    });

    const orgA = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminA.body.accessToken}`)
      .send({ name: 'Org A', type: 'BANK', location: { address: 'A St', city: 'Dhaka' } });

    const orgB = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminB.body.accessToken}`)
      .send({ name: 'Org B', type: 'BANK', location: { address: 'B St', city: 'Dhaka' } });

    const svcB = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminB.body.accessToken}`)
      .send({ organizationId: orgB.body.organization._id, name: 'Svc B', codePrefix: 'B' });

    const counterB = await request(app)
      .post('/api/admin/counters')
      .set('Authorization', `Bearer ${adminB.body.accessToken}`)
      .send({
        organizationId: orgB.body.organization._id,
        name: 'Counter B',
        counterNumber: 1,
        assignedServices: [svcB.body.service._id],
      });

    // Admin A cannot call next on Org B's counter
    const crossCall = await request(app)
      .post('/api/staff/call-next')
      .set('Authorization', `Bearer ${adminA.body.accessToken}`)
      .send({ counterId: counterB.body.counter._id });
    expect(crossCall.status).toBe(403);

    // Admin A cannot read Org B's entrance QR
    const crossQr = await request(app)
      .get(`/api/organizations/${orgB.body.organization._id}/entrance-qr`)
      .set('Authorization', `Bearer ${adminA.body.accessToken}`);
    expect(crossQr.status).toBe(403);

    // Customer payment verification IDOR & concurrent double-crediting prevention
    const cust1 = await request(app).post('/api/auth/register').send({
      name: 'Cust 1',
      phone: '01333333333',
      password: 'Password123!',
    });
    const cust2 = await request(app).post('/api/auth/register').send({
      name: 'Cust 2',
      phone: '01344444444',
      password: 'Password123!',
    });

    const checkout = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${cust1.body.accessToken}`)
      .send({ organizationId: orgA.body.organization._id, provider: 'BKASH' });
    expect(checkout.status).toBe(201);

    // Cust 2 cannot verify Cust 1's payment session
    const stealAttempt = await request(app)
      .post('/api/billing/verify')
      .set('Authorization', `Bearer ${cust2.body.accessToken}`)
      .send({ sessionId: checkout.body.sessionId });
    expect(stealAttempt.status).toBe(403);

    // Parallel verify requests from Cust 1 credit +5 exactly once
    const [v1, v2] = await Promise.all([
      request(app)
        .post('/api/billing/verify')
        .set('Authorization', `Bearer ${cust1.body.accessToken}`)
        .send({ sessionId: checkout.body.sessionId }),
      request(app)
        .post('/api/billing/verify')
        .set('Authorization', `Bearer ${cust1.body.accessToken}`)
        .send({ sessionId: checkout.body.sessionId }),
    ]);
    expect(v1.status).toBe(200);
    expect(v2.status).toBe(200);

    const usage = await MonthlyUsage.findOne({
      userId: cust1.body.user.id,
      organizationId: orgA.body.organization._id,
    }).lean();
    expect(usage?.paidExtraQuota).toBe(5);
  });
});
