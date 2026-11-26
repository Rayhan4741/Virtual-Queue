import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';

const instanceA = createApp();
const instanceB = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Horizontal Scaling & Multi-Instance Fault Tolerance', () => {
  it('supports stateless auth and zero-duplicate concurrent token issuance across 2 backend instances without Redis', async () => {
    // Admin registers on Instance A
    const adminRes = await request(instanceA).post('/api/auth/register').send({
      name: 'Scale Admin',
      phone: '01500000001',
      password: 'Password123!',
      role: 'ADMIN',
    });
    expect(adminRes.status).toBe(201);
    const adminToken = adminRes.body.accessToken;

    // Org & Service created on Instance B using token issued by Instance A (stateless JWT)
    const orgRes = await request(instanceB)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Multi-Instance Bank', type: 'BANK', location: { address: '99 Scale Rd', city: 'Dhaka' } });
    expect(orgRes.status).toBe(201);
    const orgId = orgRes.body.organization._id;

    const svcRes = await request(instanceA)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'Express Counter', codePrefix: 'X' });
    expect(svcRes.status).toBe(201);
    const serviceId = svcRes.body.service._id;

    // Issue 40 concurrent kiosk tokens alternating across Instance A and Instance B
    const reqs = Array.from({ length: 40 }, (_, i) => {
      const targetApp = i % 2 === 0 ? instanceA : instanceB;
      return request(targetApp).post('/api/kiosk/tokens').send({ organizationId: orgId, serviceId, source: 'KIOSK' });
    });

    const responses = await Promise.all(reqs);
    const tokenNumbers = responses.map((r) => {
      expect(r.status).toBe(201);
      return r.body.token.tokenNumber as string;
    });

    expect(new Set(tokenNumbers).size).toBe(40);
  });
});
