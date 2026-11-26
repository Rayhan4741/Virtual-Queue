import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer: { stop: () => Promise<boolean> } | null = null;
let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) return;

  if (env.USE_IN_MEMORY_DB === 'true' || env.NODE_ENV === 'test') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    await mongoose.connect(server.getUri());
    isConnected = true;
    console.log('[DB] Connected to MongoDB In-Memory Server');
    return;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[DB] Connected to MongoDB (${env.INSTANCE_ID})`);
  } catch (err) {
    if (env.NODE_ENV === 'development') {
      console.warn('[DB] Primary MongoDB unavailable in dev, falling back to MongoMemoryServer...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const server = await MongoMemoryServer.create();
      memoryServer = server;
      await mongoose.connect(server.getUri());
      isConnected = true;
      console.log('[DB] Connected to MongoDB In-Memory Server (dev fallback)');
    } else {
      throw err;
    }
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  isConnected = false;
}

export function getDbHealth(): { connected: boolean; readyState: number } {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}
