import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';
import { Counter } from '../../models/Counter.js';
import { Token } from '../../models/Token.js';
import { TokenCounter } from '../../models/TokenCounter.js';
import {
  issueToken,
  recoverQueueStateOnStartup,
  getTodayDateString,
} from '../../services/tokenEngine.js';

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Queue Recovery & Disaster Handling', () => {
  it('preserves queue, customer positions, and active serving counter across server crash/restart and heals orphaned counter state', async () => {
    const app1 = createApp();

    // Setup org, service, staff, counter
    const adminRes = await request(app1).post('/api/auth/register').send({
      name: 'DR Admin',
      phone: '01211111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app1)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'DR Bank', type: 'BANK', location: { address: '1 DR Rd', city: 'Dhaka' } });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app1)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'DR Teller', codePrefix: 'D' });
    const serviceId = svcRes.body.service._id;

    const staffRes = await request(app1)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'DR Staff', phone: '01222222222', password: 'Password123!' });

    const counterRes = await request(app1)
      .post('/api/admin/counters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        organizationId: orgId,
        name: 'DR Counter 1',
        counterNumber: 1,
        assignedServices: [serviceId],
        assignedStaff: staffRes.body.staff.id,
      });
    const counterId = counterRes.body.counter._id;

    // Issue 3 tokens (D-101, D-102, D-103)
    const t1 = await issueToken({ organizationId: orgId, serviceId, source: 'KIOSK', guestName: 'Alice' });
    const t2 = await issueToken({ organizationId: orgId, serviceId, source: 'KIOSK', guestName: 'Bob' });
    const t3 = await issueToken({ organizationId: orgId, serviceId, source: 'KIOSK', guestName: 'Charlie' });

    const staffLogin = await request(app1)
      .post('/api/auth/login')
      .send({ phone: '01222222222', password: 'Password123!' });
    const staffToken = staffLogin.body.accessToken;

    // Staff calls and starts serving D-101
    await request(app1).post('/api/staff/call-next').set('Authorization', `Bearer ${staffToken}`).send({ counterId });
    await request(app1)
      .post('/api/staff/start')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tokenId: t1._id.toString(), counterId });

    // Simulate partial crash corruption: counter lost currentTokenId while D-101 is SERVING
    await Counter.updateOne({ _id: counterId }, { $set: { currentTokenId: null } });

    // Simulate server restart: run startup recovery and boot fresh Express instance app2
    const recovery = await recoverQueueStateOnStartup();
    expect(recovery.relinkedTokens).toBeGreaterThanOrEqual(1);

    const app2 = createApp();
    const queueRes = await request(app2).get('/api/staff/queue').set('Authorization', `Bearer ${staffToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.currentToken.tokenNumber).toBe('D-101');
    expect(queueRes.body.currentToken.status).toBe('SERVING');
    expect(queueRes.body.waitingQueue.map((w: { tokenNumber: string }) => w.tokenNumber)).toEqual(['D-102', 'D-103']);

    // Also verify crash after COMPLETED leaves counter clean after recovery
    await Token.updateOne({ _id: t1._id }, { $set: { status: 'COMPLETED' } });
    const recovery2 = await recoverQueueStateOnStartup();
    expect(recovery2.healedCounters).toBeGreaterThanOrEqual(1);
    const healedCounter = await Counter.findById(counterId).lean();
    expect(healedCounter?.currentTokenId).toBeNull();

    // New token after restart never duplicates D-101..D-103 (must be D-104)
    const t4 = await issueToken({ organizationId: orgId, serviceId, source: 'KIOSK' });
    expect(t4.tokenNumber).toBe('D-104');
    expect(t3.sequenceNumber).toBe(3);

    // Verify TokenCounter sequence matches persisted tokens
    const tc = await TokenCounter.findOne({ serviceId, date: getTodayDateString() }).lean();
    expect(tc?.sequence).toBe(4);
  });
});
