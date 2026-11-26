import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: typeof window !== 'undefined',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        cb({ token: getAccessToken() });
      },
    });
  }
  return socket;
}

export function reconnectSocketWithAuth() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}
