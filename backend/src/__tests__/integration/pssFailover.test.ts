import { describe, it, expect, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectWithPssFailover, disconnectDB, getDbHealth } from '../../config/db.js';

describe('PSS (Primary -> Secondary 1 -> Secondary 2) Database Failover', () => {
  const servers: MongoMemoryServer[] = [];

  afterAll(async () => {
    await disconnectDB();
    await Promise.all(servers.map((s) => s.stop()));
  });

  it('fails over from unreachable Primary -> unreachable Secondary 1 -> healthy Secondary 2', async () => {
    const secondary2 = await MongoMemoryServer.create();
    servers.push(secondary2);

    const tier = await connectWithPssFailover(
      [
        { tier: 'PRIMARY', uri: 'mongodb://127.0.0.1:59991/vq_primary' },
        { tier: 'SECONDARY_1', uri: 'mongodb://127.0.0.1:59992/vq_sec1' },
        { tier: 'SECONDARY_2', uri: secondary2.getUri() },
      ],
      false
    );

    expect(tier).toBe('SECONDARY_2');
    expect(getDbHealth().connected).toBe(true);
    expect(getDbHealth().activeTier).toBe('SECONDARY_2');
  });

  it('fails over from unreachable Primary -> healthy Secondary 1 without touching Secondary 2', async () => {
    const secondary1 = await MongoMemoryServer.create();
    const secondary2 = await MongoMemoryServer.create();
    servers.push(secondary1, secondary2);

    const tier = await connectWithPssFailover(
      [
        { tier: 'PRIMARY', uri: 'mongodb://127.0.0.1:59993/vq_primary' },
        { tier: 'SECONDARY_1', uri: secondary1.getUri() },
        { tier: 'SECONDARY_2', uri: secondary2.getUri() },
      ],
      false
    );

    expect(tier).toBe('SECONDARY_1');
    expect(getDbHealth().activeTier).toBe('SECONDARY_1');
  });
});
