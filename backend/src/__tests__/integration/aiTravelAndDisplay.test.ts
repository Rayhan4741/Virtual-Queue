import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { env } from '../../config/env.js';
import { estimateTravelTime } from '../../services/travelService.js';
import { handleAssistantQuery } from '../../services/aiAssistantService.js';
import { Organization } from '../../models/Organization.js';
import { Service } from '../../models/Service.js';
import { Token } from '../../models/Token.js';
import { User } from '../../models/User.js';
import { getTodayDateString } from '../../services/tokenEngine.js';

const app = createApp();

describe('AI Assistant, Travel Estimate & Display Board Timezone', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('computes Haversine travel estimates across modes without external API key', async () => {
    const origKey = env.OPENROUTESERVICE_API_KEY;
    env.OPENROUTESERVICE_API_KEY = '';
    try {
      const drive = await estimateTravelTime({
        originLat: 23.78,
        originLng: 90.4,
        destLat: 23.81,
        destLng: 90.42,
        mode: 'driving-car',
      });
      const cycle = await estimateTravelTime({
        originLat: 23.78,
        originLng: 90.4,
        destLat: 23.81,
        destLng: 90.42,
        mode: 'cycling-regular',
      });
      const walk = await estimateTravelTime({
        originLat: 23.78,
        originLng: 90.4,
        destLat: 23.81,
        destLng: 90.42,
        mode: 'foot-walking',
      });

      expect(drive.provider).toBe('approximate_haversine');
      expect(drive.isApproximate).toBe(true);
      expect(walk.durationMinutes).toBeGreaterThan(cycle.durationMinutes);
      expect(cycle.durationMinutes).toBeGreaterThanOrEqual(drive.durationMinutes);
    } finally {
      env.OPENROUTESERVICE_API_KEY = origKey;
    }
  });

  it('returns guarded AI responses and queries Display Board using org.timezone', async () => {
    const admin = await User.create({
      name: 'NY Admin',
      phone: '01811111111',
      passwordHash: 'hash',
      role: 'ADMIN',
    });
    const cust = await User.create({
      name: 'NY Cust',
      phone: '01822222222',
      passwordHash: 'hash',
      role: 'CUSTOMER',
    });

    const org = await Organization.create({
      name: 'NY Clinic',
      type: 'HOSPITAL',
      timezone: 'America/New_York',
      location: { address: 'NYC', city: 'New York' },
      adminId: admin._id,
      entranceQrCode: 'qr-ny',
    });
    const svc = await Service.create({
      organizationId: org._id,
      name: 'Triage',
      codePrefix: 'T',
    });

    const nyDate = getTodayDateString('America/New_York');
    await Token.create({
      organizationId: org._id,
      serviceId: svc._id,
      userId: cust._id,
      tokenNumber: 'T-001',
      sequenceNumber: 1,
      queueDate: nyDate,
      status: 'CALLED',
      source: 'REMOTE',
      trackingCode: 'NY_TRACK_0000001',
      queueOrderScore: 1,
    });

    const displayRes = await request(app).get(`/api/display/${org._id.toString()}`);
    expect(displayRes.status).toBe(200);
    expect(displayRes.body.calledTokens).toHaveLength(1);
    expect(displayRes.body.calledTokens[0].tokenNumber).toBe('T-001');

    // AI Assistant rule-based guardrails
    const origAiProvider = env.AI_PROVIDER;
    env.AI_PROVIDER = 'mock';
    try {
      const statusReply = await handleAssistantQuery(cust._id.toString(), 'what is my token status?');
      expect(statusReply.provider).toBe('rule-based-mock');
      expect(statusReply.reply).toContain('T-001');

      const lateReply = await handleAssistantQuery(undefined, 'how does late pass work?');
      expect(lateReply.reply).toContain('5 places back');

      const snoozeReply = await handleAssistantQuery(undefined, 'how does snooze work?');
      expect(snoozeReply.reply).toContain('snooze');

      const qrReply = await handleAssistantQuery(undefined, 'how to qr check-in?');
      expect(qrReply.reply).toContain('CHECKED_IN');

      const orgReply = await handleAssistantQuery(undefined, 'list organization services');
      expect(orgReply.reply).toContain('NY Clinic');
    } finally {
      env.AI_PROVIDER = origAiProvider;
    }
  });
});
