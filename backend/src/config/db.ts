import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export type DbTier = 'PRIMARY' | 'SECONDARY_1' | 'SECONDARY_2' | 'IN_MEMORY' | 'DISCONNECTED';

let memoryServer: { stop: () => Promise<boolean> } | null = null;
let isConnected = false;
let activeTier: DbTier = 'DISCONNECTED';
let failoverInProgress = false;

export interface DbTarget {
  tier: Exclude<DbTier, 'IN_MEMORY' | 'DISCONNECTED'>;
  uri: string;
}

export function getConfiguredDbTargets(): DbTarget[] {
  const targets: DbTarget[] = [];
  if (env.MONGODB_URI) targets.push({ tier: 'PRIMARY', uri: env.MONGODB_URI });
  if (env.MONGODB_SECONDARY_URI) targets.push({ tier: 'SECONDARY_1', uri: env.MONGODB_SECONDARY_URI });
  if (env.MONGODB_SECONDARY_2_URI) targets.push({ tier: 'SECONDARY_2', uri: env.MONGODB_SECONDARY_2_URI });
  return targets;
}

/**
 * Connects using PSS (Primary -> Secondary 1 -> Secondary 2) failover order.
 */
export async function connectWithPssFailover(
  customTargets?: DbTarget[],
  allowInMemoryFallback = env.NODE_ENV === 'development'
): Promise<DbTier> {
  if (
    env.NODE_ENV === 'production' &&
    !customTargets &&
    (env.MONGODB_SECONDARY_URI || env.MONGODB_SECONDARY_2_URI) &&
    env.ALLOW_URI_FALLBACK !== 'true'
  ) {
    throw new Error(
      'Production refuses multi-URI application-level DB fallback without ALLOW_URI_FALLBACK=true. Use a single MongoDB Replica Set URI in MONGODB_URI for safe automatic primary election.'
    );
  }
  const targets = customTargets ?? getConfiguredDbTargets();

  for (const target of targets) {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }
      await mongoose.connect(target.uri, {
        serverSelectionTimeoutMS: 4000,
        retryWrites: true,
        w: 'majority',
      });
      isConnected = true;
      activeTier = target.tier;
      logger.info(`Connected to MongoDB (${target.tier})`, { tier: target.tier });
      return target.tier;
    } catch (err) {
      logger.warn(`MongoDB ${target.tier} connection failed, trying next PSS node`, {
        tier: target.tier,
        reason: (err as Error).message,
      });
    }
  }

  if (allowInMemoryFallback) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    await mongoose.connect(server.getUri());
    isConnected = true;
    activeTier = 'IN_MEMORY';
    logger.warn('All configured PSS MongoDB nodes unavailable in dev; using MongoMemoryServer fallback');
    return 'IN_MEMORY';
  }

  activeTier = 'DISCONNECTED';
  throw new Error('All PSS MongoDB nodes (Primary, Secondary 1, Secondary 2) are unreachable.');
}

function attachFailoverListener() {
  mongoose.connection.removeAllListeners('disconnected');
  mongoose.connection.on('disconnected', async () => {
    if (!isConnected || failoverInProgress || env.NODE_ENV === 'test' || activeTier === 'IN_MEMORY') return;
    failoverInProgress = true;
    logger.warn('MongoDB disconnected unexpectedly; initiating PSS failover...');
    try {
      await connectWithPssFailover();
    } catch (err) {
      logger.error('PSS failover failed', { reason: (err as Error).message });
    } finally {
      failoverInProgress = false;
    }
  });
}

export async function connectDB(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) return;

  if (env.USE_IN_MEMORY_DB === 'true' || env.NODE_ENV === 'test') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    await mongoose.connect(server.getUri());
    isConnected = true;
    activeTier = 'IN_MEMORY';
    logger.info('Connected to MongoDB In-Memory Server');
    return;
  }

  await connectWithPssFailover();
  attachFailoverListener();
}

export async function disconnectDB(): Promise<void> {
  isConnected = false;
  activeTier = 'DISCONNECTED';
  mongoose.connection.removeAllListeners('disconnected');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function getDbHealth(): { connected: boolean; readyState: number; activeTier: DbTier } {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    activeTier,
  };
}
