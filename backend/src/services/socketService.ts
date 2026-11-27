import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';
import { Counter } from '../models/Counter.js';
import { Organization } from '../models/Organization.js';

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

    socket.on('join:counter', async (counterId: string) => {
      if (!socket.user || (socket.user.role !== 'STAFF' && socket.user.role !== 'ADMIN')) {
        return; // Prevent unauthorized counter room subscriptions
      }
      if (typeof counterId !== 'string' || counterId.length === 0) return;
      try {
        const counter = await Counter.findById(counterId).select('organizationId').lean();
        if (!counter) return;
        const orgId = counter.organizationId.toString();
        if (socket.user.organizationId === orgId) {
          socket.join(`counter:${counterId}`);
          return;
        }
        if (socket.user.role === 'ADMIN') {
          const ownsOrg = await Organization.exists({ _id: orgId, adminId: socket.user.userId });
          if (ownsOrg) socket.join(`counter:${counterId}`);
        }
      } catch {
        // Ignore malformed counterId
      }
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function sanitizePublicTokenPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload.token || typeof payload.token !== 'object') return payload;
  const raw =
    typeof (payload.token as { toObject?: () => Record<string, unknown> }).toObject === 'function'
      ? (payload.token as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(payload.token as Record<string, unknown>) };
  delete raw.guestName;
  delete raw.guestPhone;
  delete raw.userId;
  delete raw.trackingCode;
  delete raw.ratingComment;
  return { ...payload, token: raw };
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
  const emittedAt = new Date().toISOString();
  const publicPayload = sanitizePublicTokenPayload(payload);
  for (const room of rooms) {
    const isPublicRoom = room.startsWith('organization:') || room.startsWith('service:');
    io.to(room).emit(event, { ...(isPublicRoom ? publicPayload : payload), emittedAt });
  }
}
