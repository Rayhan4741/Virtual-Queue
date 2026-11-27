import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';
import { Token } from '../../models/Token.js';
import { createSignedQrToken } from '../../services/qrService.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Counter Failure Release, Guest Privacy, QR Replay & Metrics', () => {
  it('releases stranded token on counter pause, blocks QR replay, masks guest PII, and exposes health metrics', async () => {
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Res Admin',
      phone: '01111111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Res Bank', type: 'BANK', location: { address: '1 Res Rd', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'Res Teller', codePrefix: 'R' });
    const serviceId = svcRes.body.service._id;

    const staffRes = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Res Staff', phone: '01122222222', password: 'Password123!' });

    const counterRes = await request(app)
      .post('/api/admin/counters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        organizationId: orgId,
        name: 'Res Counter 1',
        counterNumber: 1,
        assignedServices: [serviceId],
        assignedStaff: staffRes.body.staff.id,
      });
    const counterId = counterRes.body.counter._id;

    // 1. Guest token issued with PII (phone/name) -> public /track must NOT expose PII
    const guestRes = await request(app).post('/api/kiosk/tokens').send({
      organizationId: orgId,
      serviceId,
      guestName: 'Secret Guest Name',
      guestPhone: '01999999999',
      source: 'GUEST',
    });
    expect(guestRes.status).toBe(201);
    const trackingCode = guestRes.body.token.trackingCode as string;
    expect(trackingCode.length).toBe(16);

    const trackRes = await request(app).get(`/api/kiosk/track/${trackingCode}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.token.guestName).toBeUndefined();
    expect(trackRes.body.token.guestPhone).toBeUndefined();
    expect(trackRes.body.token.userId).toBeUndefined();

    // 2. Staff calls guest token then counter pauses -> token safely returns to CHECKED_IN
    const staffLogin = await request(app).post('/api/auth/login').send({ phone: '01122222222', password: 'Password123!' });
    const staffToken = staffLogin.body.accessToken;

    await request(app).post('/api/staff/call-next').set('Authorization', `Bearer ${staffToken}`).send({ counterId });
    const pauseRes = await request(app)
      .post('/api/staff/counter/pause')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ counterId });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.counter.currentTokenId).toBeNull();

    const releasedToken = await Token.findById(guestRes.body.token._id).lean();
    expect(releasedToken?.status).toBe('CHECKED_IN');

    // 3. QR replay prevention
    const custRes = await request(app).post('/api/auth/register').send({
      name: 'QR Cust',
      phone: '01133333333',
      password: 'Password123!',
    });
    const custToken = custRes.body.accessToken;
    const bookRes = await request(app)
      .post('/api/tokens')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, serviceId });
    const qrPayload = createSignedQrToken(orgId);

    const firstCheckIn = await request(app)
      .post(`/api/tokens/${bookRes.body.token._id}/check-in`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ qrPayload });
    expect(firstCheckIn.status).toBe(200);

    const replayCheckIn = await request(app)
      .post(`/api/tokens/${bookRes.body.token._id}/check-in`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ qrPayload });
    expect(replayCheckIn.status).toBe(409);

    // 4. Public /api/health hides internal metrics; /api/admin/system-status requires Admin auth
    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');
    expect(healthRes.body.metrics).toBeUndefined();
    expect(healthRes.body.instanceId).toBeUndefined();

    const unauthStatus = await request(app).get('/api/admin/system-status');
    expect(unauthStatus.status).toBe(401);

    const adminStatus = await request(app).get('/api/admin/system-status').set('Authorization', `Bearer ${adminToken}`);
    expect(adminStatus.status).toBe(200);
    expect(adminStatus.body.metrics.totalRequests).toBeGreaterThan(0);
    expect(adminStatus.body.metrics.memoryMb.rss).toBeGreaterThan(0);
  });
});
