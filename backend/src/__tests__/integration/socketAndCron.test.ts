import http from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { io as ioc } from 'socket.io-client';
import { createApp } from '../../app.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { initSocketServer, emitQueueEvent, sanitizePublicTokenPayload, getIO } from '../../services/socketService.js';
import { startCronJobs, stopCronJobs } from '../../services/cronService.js';
import { getAdminDashboardSummary, getAdminAnalytics } from '../../services/analyticsService.js';
import { Token } from '../../models/Token.js';
import { ServiceLog } from '../../models/ServiceLog.js';
import { getTodayDateString } from '../../services/tokenEngine.js';

const app = createApp();

describe('Socket.IO Privacy & Room Auth, CronService, and AnalyticsService', () => {
  let server: http.Server;

  beforeAll(async () => {
    await connectDB();
    server = http.createServer(app);
    await initSocketServer(server);
  });

  afterAll(async () => {
    stopCronJobs();
    getIO()?.close();
    server.close();
    await disconnectDB();
  });

  it('sanitizes PII from public Socket.IO rooms and computes accurate analytics from real DB records', async () => {
    // 1. Socket.IO payload PII sanitization
    const rawToken = {
      _id: 'tok1',
      tokenNumber: 'A-001',
      status: 'CALLED',
      guestName: 'Private Customer',
      guestPhone: '01700000000',
      userId: 'user123',
      trackingCode: 'SECRET_TRACK_16',
      ratingComment: 'Private complaint',
      organizationId: 'org1',
      serviceId: 'svc1',
    };
    const sanitized = sanitizePublicTokenPayload({ token: rawToken, counterId: 'c1' });
    const pubToken = sanitized.token as Record<string, unknown>;
    expect(pubToken.tokenNumber).toBe('A-001');
    expect(pubToken.status).toBe('CALLED');
    expect(pubToken.guestName).toBeUndefined();
    expect(pubToken.guestPhone).toBeUndefined();
    expect(pubToken.userId).toBeUndefined();
    expect(pubToken.trackingCode).toBeUndefined();
    expect(pubToken.ratingComment).toBeUndefined();

    // Verify emitQueueEvent sends sanitized payload to organization:* / service:* and full to user:*
    const io = getIO()!;
    const emittedByRoom: Record<string, Record<string, unknown>> = {};
    const toSpy = vi.spyOn(io, 'to').mockImplementation((room: string | string[]) => {
      const r = Array.isArray(room) ? room[0] : room;
      return {
        emit: (_event: string, data: Record<string, unknown>) => {
          emittedByRoom[r] = data;
          return true;
        },
      } as unknown as ReturnType<typeof io.to>;
    });

    emitQueueEvent('token:called', ['organization:org1', 'service:svc1', 'user:user123'], { token: rawToken });
    expect((emittedByRoom['organization:org1'].token as Record<string, unknown>).guestPhone).toBeUndefined();
    expect((emittedByRoom['service:svc1'].token as Record<string, unknown>).trackingCode).toBeUndefined();
    expect((emittedByRoom['user:user123'].token as Record<string, unknown>).trackingCode).toBe('SECRET_TRACK_16');
    toSpy.mockRestore();

    // 2. CronService lifecycle
    startCronJobs();
    startCronJobs(); // idempotent second call
    stopCronJobs();

    // 3. AnalyticsService real MongoDB aggregations
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Analytics Admin',
      phone: '01611111111',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app).post('/api/organizations').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Analytics Clinic',
      type: 'HOSPITAL',
      location: { address: 'Dhaka', city: 'Dhaka' },
    });
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(app).post('/api/services').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'OPD',
      codePrefix: 'O',
    });
    const serviceId = svcRes.body.service._id;

    const staffRes = await request(app).post('/api/admin/staff').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Analytics Staff',
      phone: '01622222222',
      password: 'Password123!',
    });

    const counterRes = await request(app).post('/api/admin/counters').set('Authorization', `Bearer ${adminToken}`).send({
      organizationId: orgId,
      name: 'Desk 1',
      counterNumber: 1,
      assignedServices: [serviceId],
      assignedStaff: staffRes.body.staff.id,
    });
    const counterId = counterRes.body.counter._id;

    const today = getTodayDateString();
    await Token.create([
      {
        organizationId: orgId,
        serviceId,
        counterId,
        tokenNumber: 'O-001',
        sequenceNumber: 1,
        queueDate: today,
        status: 'COMPLETED',
        source: 'KIOSK',
        trackingCode: 'AN_TRACK_0000001',
        queueOrderScore: 1,
      },
      {
        organizationId: orgId,
        serviceId,
        tokenNumber: 'O-002',
        sequenceNumber: 2,
        queueDate: today,
        status: 'CANCELLED',
        source: 'REMOTE',
        trackingCode: 'AN_TRACK_0000002',
        queueOrderScore: 2,
      },
      {
        organizationId: orgId,
        serviceId,
        tokenNumber: 'O-003',
        sequenceNumber: 3,
        queueDate: today,
        status: 'NO_SHOW',
        source: 'REMOTE',
        trackingCode: 'AN_TRACK_0000003',
        queueOrderScore: 3,
      },
    ]);

    await ServiceLog.create({
      organizationId: orgId,
      serviceId,
      counterId,
      staffId: staffRes.body.staff.id,
      tokenId: (await Token.findOne({ tokenNumber: 'O-001' }))!._id,
      waitTimeSec: 300,
      durationSec: 180,
      hourOfDay: 10,
      completedAt: new Date(),
    });

    const summary = await getAdminDashboardSummary(orgId);
    expect(summary.totalTokensToday).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.noShow).toBe(1);
    expect(summary.avgWaitMinutes).toBe(5);
    expect(summary.avgServiceMinutes).toBe(3);

    const analytics = await getAdminAnalytics(orgId, 14);
    expect(analytics.servicePopularity[0].name).toBe('OPD');
    expect(analytics.servicePopularity[0].count).toBe(3);
    expect(analytics.counterUtilization[0].counterName).toBe('Desk 1');
    expect(analytics.counterUtilization[0].served).toBe(1);
    expect(analytics.counterUtilization[0].avgDurationMin).toBe(3);

    // 4. Live socket.io-client WebSocket test: cross-tenant join:counter blocked & public PII stripped over wire
    const adminBRes = await request(app).post('/api/auth/register').send({
      name: 'Org B Admin',
      phone: '01633333333',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const orgBRes = await request(app).post('/api/organizations').set('Authorization', `Bearer ${adminBRes.body.accessToken}`).send({
      name: 'Org B Clinic',
      type: 'BANK',
      location: { address: 'Chittagong', city: 'Chittagong' },
    });
    const orgBId = orgBRes.body.organization._id;
    const svcBRes = await request(app).post('/api/services').set('Authorization', `Bearer ${adminBRes.body.accessToken}`).send({
      organizationId: orgBId,
      name: 'Org B Service',
      codePrefix: 'B',
    });
    const counterBRes = await request(app).post('/api/admin/counters').set('Authorization', `Bearer ${adminBRes.body.accessToken}`).send({
      organizationId: orgBId,
      name: 'Org B Desk 1',
      counterNumber: 1,
      assignedServices: [svcBRes.body.service._id],
    });
    const counterBId = counterBRes.body.counter._id;

    const staffLogin = await request(app).post('/api/auth/login').send({ phone: '01622222222', password: 'Password123!' });
    const staffAToken = staffLogin.body.accessToken;

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;

    const staffSocket = ioc(url, { auth: { token: staffAToken }, transports: ['websocket'] });
    const publicSocket = ioc(url, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((resolve) => staffSocket.on('connect', resolve)),
      new Promise<void>((resolve) => publicSocket.on('connect', resolve)),
    ]);

    const receivedOwnCounter: unknown[] = [];
    const receivedOtherCounter: unknown[] = [];
    const receivedPublicToken: Record<string, unknown>[] = [];

    staffSocket.on('counter:updated', (data) => {
      if ((data as { target?: string }).target === 'A') receivedOwnCounter.push(data);
      if ((data as { target?: string }).target === 'B') receivedOtherCounter.push(data);
    });
    publicSocket.on('token:called', (data) => receivedPublicToken.push(data as Record<string, unknown>));

    staffSocket.emit('join:counter', counterId);
    staffSocket.emit('join:counter', counterBId); // Cross-tenant attempt -> must be ignored
    publicSocket.emit('join:organization', orgId);

    await new Promise((r) => setTimeout(r, 200));

    emitQueueEvent('counter:updated', [`counter:${counterId}`], { target: 'A' });
    emitQueueEvent('counter:updated', [`counter:${counterBId}`], { target: 'B' });
    emitQueueEvent('token:called', [`organization:${orgId}`], { token: rawToken });

    await new Promise((r) => setTimeout(r, 200));

    expect(receivedOwnCounter).toHaveLength(1);
    expect(receivedOtherCounter).toHaveLength(0);
    expect(receivedPublicToken).toHaveLength(1);
    const wireToken = receivedPublicToken[0].token as Record<string, unknown>;
    expect(wireToken.tokenNumber).toBe('A-001');
    expect(wireToken.guestPhone).toBeUndefined();
    expect(wireToken.trackingCode).toBeUndefined();

    staffSocket.disconnect();
    publicSocket.disconnect();
  }, 20000);
});
