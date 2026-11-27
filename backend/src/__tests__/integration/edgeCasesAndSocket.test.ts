import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { connectDB, disconnectDB } from '../../config/db.js';

const app = createApp();
import { Counter } from '../../models/Counter.js';
import { Token } from '../../models/Token.js';
import { MonthlyUsage } from '../../models/MonthlyUsage.js';
import { processExpiredCalledTokens, getCurrentMonthString } from '../../services/tokenEngine.js';

describe('Edge Cases: Token Transfer, Multi-Instance Cron Race, Simultaneous Call & Rating', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('handles token transfer, simultaneous call-next, multi-instance no-show cron race, and rating rules', async () => {
    // Setup Admin, Org, 2 Services, 2 Staff, 2 Counters
    const adminReg = await request(app).post('/api/auth/register').send({
      name: 'Edge Admin',
      phone: '01511111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminReg.body.accessToken;

    const orgRes = await request(app).post('/api/organizations').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Edge Org',
      type: 'BANK',
      location: { address: 'Dhaka', city: 'Dhaka' },
    });
    const orgId = orgRes.body.organization._id;

    const svc1Res = await request(app).post('/api/services').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Deposits',
      codePrefix: 'D',
    });
    const svc1Id = svc1Res.body.service._id;

    const svc2Res = await request(app).post('/api/services').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Loans',
      codePrefix: 'L',
    });
    const svc2Id = svc2Res.body.service._id;

    const staff1Res = await request(app).post('/api/admin/staff').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Edge Staff 1',
      phone: '01522222221',
      password: 'Password123!',
    });
    const staff2Res = await request(app).post('/api/admin/staff').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Edge Staff 2',
      phone: '01522222222',
      password: 'Password123!',
    });

    const c1Res = await request(app).post('/api/admin/counters').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Counter 1',
      counterNumber: 1,
      assignedServices: [svc1Id, svc2Id],
      assignedStaff: staff1Res.body.staff.id,
    });
    const c2Res = await request(app).post('/api/admin/counters').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Counter 2',
      counterNumber: 2,
      assignedServices: [svc1Id, svc2Id],
      assignedStaff: staff2Res.body.staff.id,
    });
    const c1Id = c1Res.body.counter._id;
    const c2Id = c2Res.body.counter._id;

    const s1Login = await request(app).post('/api/auth/login').send({ phone: '01522222221', password: 'Password123!' });
    const s2Login = await request(app).post('/api/auth/login').send({ phone: '01522222222', password: 'Password123!' });
    const s1Token = s1Login.body.accessToken;
    const s2Token = s2Login.body.accessToken;

    // Customer books a token via Kiosk (starts CHECKED_IN)
    const custReg = await request(app).post('/api/auth/register').send({
      name: 'Edge Customer',
      phone: '01533333333',
      password: 'Password123!',
    });
    const custToken = custReg.body.accessToken;

    const bookRes = await request(app)
      .post('/api/tokens')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, serviceId: svc1Id });
    const tokenId = bookRes.body.token._id;

    // Check in via QR
    const qrRes = await request(app)
      .get(`/api/organizations/${orgId}/entrance-qr`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/tokens/${tokenId}/check-in`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ qrPayload: qrRes.body.qrPayload });

    // 1. Two staff simultaneously call-next for the single CHECKED_IN token
    const [call1, call2] = await Promise.all([
      request(app).post('/api/staff/call-next').set('Authorization', `Bearer ${s1Token}`).send({ counterId: c1Id }),
      request(app).post('/api/staff/call-next').set('Authorization', `Bearer ${s2Token}`).send({ counterId: c2Id }),
    ]);
    const assigned = [call1.body.token, call2.body.token].filter(Boolean);
    expect(assigned).toHaveLength(1);

    const winnerCounterId = call1.body.token ? c1Id : c2Id;
    const winnerStaffToken = call1.body.token ? s1Token : s2Token;

    // 2. Transfer token to service 2 -> old counter cleared, token returns to CHECKED_IN under targetServiceId
    const transferRes = await request(app)
      .post('/api/staff/transfer')
      .set('Authorization', `Bearer ${winnerStaffToken}`)
      .send({ tokenId, targetServiceId: svc2Id, sourceCounterId: winnerCounterId });
    expect(transferRes.status).toBe(200);
    expect(transferRes.body.token.status).toBe('CHECKED_IN');
    expect(transferRes.body.token.serviceId).toBe(svc2Id);

    const clearedCounter = await Counter.findById(winnerCounterId).lean();
    expect(clearedCounter?.currentTokenId).toBeNull();

    // 3. Multi-instance no-show cron race: run processExpiredCalledTokens concurrently twice
    await request(app).post('/api/staff/call-next').set('Authorization', `Bearer ${s1Token}`).send({ counterId: c1Id });
    await Token.updateOne(
      { _id: tokenId },
      { $set: { recallCount: 2, lastRecalledAt: new Date(Date.now() - 5 * 60000) } }
    );

    const [cronA, cronB] = await Promise.all([processExpiredCalledTokens(3), processExpiredCalledTokens(3)]);
    expect(cronA.length + cronB.length).toBe(1);

    const usage = await MonthlyUsage.findOne({
      userId: custReg.body.user.id,
      organizationId: orgId,
      month: getCurrentMonthString(),
    }).lean();
    expect(usage?.strikes).toBe(1);

    // 4. Rating rules: cannot rate non-COMPLETED, XSS stripped, cannot rate twice (409)
    const rateTooEarly = await request(app)
      .post(`/api/tokens/${tokenId}/rate`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ rating: 5, comment: 'Too early' });
    expect(rateTooEarly.status).toBe(400);

    await Token.updateOne({ _id: tokenId }, { $set: { status: 'COMPLETED', completedAt: new Date() } });

    const rateOk = await request(app)
      .post(`/api/tokens/${tokenId}/rate`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ rating: 5, comment: '<script>alert(1)</script>Great service!' });
    expect(rateOk.status).toBe(200);
    expect(rateOk.body.token.ratingComment).toBe('scriptalert(1)/scriptGreat service!');

    const rateTwice = await request(app)
      .post(`/api/tokens/${tokenId}/rate`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ rating: 4, comment: 'Second try' });
    expect(rateTwice.status).toBe(409);
  });
});
