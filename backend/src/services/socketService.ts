import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';

let io: Server | null = null;

interface AuthenticatedSocket extends Socket {
  user?: AccessTokenPayload;
}

export async function initSocketServer(httpServer: HttpServer): Promise<Server> {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL.split(',').map((u) => u.trim()),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Attach Redis Adapter for multi-instance horizontal scaling when REDIS_URL is configured
  if (env.REDIS_URL) {
    try {
      const pubClient = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log(`[Socket.IO] Redis Adapter attached (${env.INSTANCE_ID})`);
    } catch (err) {
      console.warn('[Socket.IO] Redis Adapter unavailable, running in single-instance mode:', (err as Error).message);
    }
  }

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.user = verifyAccessToken(token);
      } catch {
        // Allow public display/kiosk read-only rooms, but mark unauthenticated
      }
    }
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (socket.user?.userId) {
      socket.join(`user:${socket.user.userId}`);
    }

    socket.on('join:organization', (organizationId: string) => {
      if (typeof organizationId === 'string' && organizationId.length > 0) {
        socket.join(`organization:${organizationId}`);
      }
    });

    socket.on('join:service', (serviceId: string) => {
      if (typeof serviceId === 'string' && serviceId.length > 0) {
        socket.join(`service:${serviceId}`);
      }
    });

    socket.on('join:counter', (counterId: string) => {
      if (!socket.user || (socket.user.role !== 'STAFF' && socket.user.role !== 'ADMIN')) {
        return; // Prevent unauthorized counter room subscriptions
      }
      if (typeof counterId === 'string' && counterId.length > 0) {
        socket.join(`counter:${counterId}`);
      }
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitQueueEvent(
  event:
    | 'token:created'
    | 'token:updated'
    | 'queue:updated'
    | 'token:called'
    | 'token:recalled'
    | 'token:completed'
    | 'token:cancelled'
    | 'counter:updated'
    | 'announcement:created'
    | 'eta:updated',
  rooms: string[],
  payload: Record<string, unknown>
): void {
  if (!io) return;
  for (const room of rooms) {
    io.to(room).emit(event, { ...payload, emittedAt: new Date().toISOString() });
  }
}
