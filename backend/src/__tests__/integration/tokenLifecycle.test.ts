import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';
import { createSignedQrToken } from '../../services/qrService.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Full Token Lifecycle, QR Check-in, Staff Ops, No-Show & Late Pass', () => {
  it('executes complete customer and staff workflows', async () => {
    // 1. Admin creates org, service, staff, counter
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Flow Admin',
      phone: '01911111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Flow Hospital', type: 'HOSPITAL', location: { address: '1 Med', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'General OPD', codePrefix: 'M', monthlyQuota: 2 });
    const serviceId = svcRes.body.service._id;

    const staffRes = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nurse Joy', phone: '01922222222', password: 'Password123!' });
    const staffId = staffRes.body.staff.id;

    const counterRes = await request(app)
      .post('/api/admin/counters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'Room 1', counterNumber: 1, assignedServices: [serviceId], assignedStaff: staffId });
    const counterId = counterRes.body.counter._id;

    // 2. Customer registers & books remote token
    const custRes = await request(app).post('/api/auth/register').send({
      name: 'Patient One',
      phone: '01933333333',
      password: 'Password123!',
    });
    const custToken = custRes.body.accessToken;

    const bookRes = await request(app)
      .post('/api/tokens')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, serviceId });
    expect(bookRes.status).toBe(201);
    const tokenId = bookRes.body.token._id;
    expect(bookRes.body.token.tokenNumber).toBe('M-101');

    // Duplicate active token blocked
    const dupRes = await request(app)
      .post('/api/tokens')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ organizationId: orgId, serviceId });
    expect(dupRes.status).toBe(409);

    // 3. QR Check-in
    const qrPayload = createSignedQrToken(orgId);
    const checkInRes = await request(app)
      .post(`/api/tokens/${tokenId}/check-in`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({ qrPayload });
    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.token.status).toBe('CHECKED_IN');

    // 4. Staff logs in, calls next, marks No-Show, Customer uses Late Pass
    const staffLogin = await request(app).post('/api/auth/login').send({
      phone: '01922222222',
      password: 'Password123!',
    });
    const staffToken = staffLogin.body.accessToken;

    const callRes = await request(app)
      .post('/api/staff/call-next')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ counterId });
    expect(callRes.status).toBe(200);
    expect(callRes.body.token.status).toBe('CALLED');

    const noShowRes = await request(app)
      .post('/api/staff/skip')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tokenId, counterId, reason: 'NO_SHOW' });
    expect(noShowRes.status).toBe(200);
    expect(noShowRes.body.token.status).toBe('NO_SHOW');

    // Late Pass recovery
    const lpRes = await request(app)
      .post(`/api/tokens/${tokenId}/late-pass`)
      .set('Authorization', `Bearer ${custToken}`);
    expect(lpRes.status).toBe(200);
    expect(lpRes.body.token.status).toBe('CHECKED_IN');
    expect(lpRes.body.token.latePassUsed).toBe(true);

    // Call -> Start -> Complete
    await request(app).post('/api/staff/call-next').set('Authorization', `Bearer ${staffToken}`).send({ counterId });
    const startRes = await request(app)
      .post('/api/staff/start')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tokenId, counterId });
    expect(startRes.body.token.status).toBe('SERVING');

    const compRes = await request(app)
      .post('/api/staff/complete')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tokenId, counterId });
    expect(compRes.body.token.status).toBe('COMPLETED');
  });
});
