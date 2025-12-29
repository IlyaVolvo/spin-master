import { io, Socket } from 'socket.io-client';
import { getToken } from './auth';

let socket: Socket | null = null;

/**
 * Connect to Socket.io server
 */
export function connectSocket(): Socket | null {
  // If already connected, return existing socket
  if (socket?.connected) {
    return socket;
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const token = getToken();

  socket = io(apiUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('Socket connected', { socketId: socket?.id });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected', { reason });
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error', error);
  });

  return socket;
}

/**
 * Disconnect from Socket.io server
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the current socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected || false;
}

