import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { createApp } from '../../app.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Organization } from '../../models/Organization.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Auth, RBAC & Security Integration', () => {
  it('enforces authentication, role-based access control, and append-only audit logs', async () => {
    const custRes = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      phone: '01811111111',
      password: 'Password123!',
      role: 'CUSTOMER',
    });
    expect(custRes.status).toBe(201);
    const custToken = custRes.body.accessToken;

    // Customer cannot access Admin or Staff routes
    const adminAttempt = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${custToken}`);
    expect(adminAttempt.status).toBe(403);

    const staffAttempt = await request(app)
      .get('/api/staff/queue')
      .set('Authorization', `Bearer ${custToken}`);
    expect(staffAttempt.status).toBe(403);

    // Admin can create an organization
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Org Admin',
      phone: '01822222222',
      password: 'Password123!',
      role: 'ADMIN',
    });
    expect(adminRes.status).toBe(201);
    const adminToken = adminRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Security Test Bank',
        type: 'BANK',
        location: { address: '123 Main', city: 'Dhaka' },
      });
    expect(orgRes.status).toBe(201);

    // Append-only AuditLog blocks updates & deletes
    const org = await Organization.findById(orgRes.body.organization._id);
    const log = await AuditLog.create({
      organizationId: org!._id,
      actorId: adminRes.body.user.id,
      actorRole: 'ADMIN',
      action: 'TEST_ACTION',
    });
    await expect(AuditLog.updateOne({ _id: log._id }, { $set: { action: 'TAMPERED' } })).rejects.toThrow();
    await expect(AuditLog.deleteOne({ _id: log._id })).rejects.toThrow();
  });
});
