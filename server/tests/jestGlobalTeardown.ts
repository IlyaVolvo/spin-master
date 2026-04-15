/**
 * Runs once after all test files finish so Jest can exit instead of hanging on
 * Prisma connection pool, Socket.IO, and the shared HTTP server from `src/index`.
 */
import { prisma, httpServer } from '../src/index';
import { getIO } from '../src/services/socketService';

export default async function globalTeardown(): Promise<void> {
  const io = getIO();
  if (io) {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  }
  // Supertest-only suites never call listen(); close() throws "Server is not running" in that case.
  if (httpServer.listening) {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
  await prisma.$disconnect();
}
