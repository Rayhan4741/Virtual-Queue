import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, disconnectDB } from '../../config/db.js';
import { User } from '../../models/User.js';
import { Organization } from '../../models/Organization.js';
import { Service } from '../../models/Service.js';
import { issueToken } from '../../services/tokenEngine.js';

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Concurrent Atomic Token Generation', () => {
  it('issues 1,000 simultaneous kiosk tokens with zero duplicate token numbers', async () => {
    const admin = await User.create({
      name: 'Conc Admin',
      phone: '01600000001',
      passwordHash: 'hash',
      role: 'ADMIN',
    });

    const org = await Organization.create({
      name: 'Conc Bank',
      type: 'BANK',
      location: { address: '1 St', city: 'Dhaka' },
      adminId: admin._id,
      entranceQrCode: 'qr-conc',
    });

    const svc = await Service.create({
      organizationId: org._id,
      name: 'Fast Teller',
      codePrefix: 'C',
      avgServiceTimeSec: 180,
    });

    const promises = Array.from({ length: 1000 }, (_, i) =>
      issueToken({
        organizationId: org._id.toString(),
        serviceId: svc._id.toString(),
        source: 'KIOSK',
        guestName: `Guest ${i + 1}`,
      })
    );

    const tokens = await Promise.all(promises);
    const numbers = tokens.map((t) => t.tokenNumber);
    const unique = new Set(numbers);

    expect(tokens.length).toBe(1000);
    expect(unique.size).toBe(1000);
  }, 30000);
});
