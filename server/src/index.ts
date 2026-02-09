// Load environment variables FIRST, before any other imports that might use them
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from server directory (where package.json is located)
// When running with tsx, process.cwd() should be the server directory
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

// Fallback: if DATABASE_URL is still not set, try loading from parent directory
if (!process.env.DATABASE_URL) {
  const fallbackPath = path.resolve(process.cwd(), '..', 'server', '.env');
  dotenv.config({ path: fallbackPath });
}

// CRITICAL: Set DATABASE_URL as an environment variable for Prisma
// Prisma reads this from process.env when validating the schema
if (process.env.DATABASE_URL) {
  // Ensure it's available to child processes and Prisma
  process.env.DATABASE_URL = process.env.DATABASE_URL;
}

// Log for debugging
console.log('Current working directory:', process.cwd());
console.log('Loading .env from:', envPath);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
if (result.error) {
  console.error('Error loading .env file:', result.error);
}
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set! Check your .env file.');
  console.error('Server will not start without DATABASE_URL.');
  // Don't exit here - let it fail naturally so we can see the error
}

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import { PrismaClient } from '@prisma/client';
import playerRoutes from './routes/players';
import tournamentRoutes from './routes/tournaments';
import authRoutes from './routes/auth';
import playoffRoutes from './routes/playoff';
import roundRobinRoutes from './routes/roundRobin';
import matchRoutes from './routes/matches';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { setIO } from './services/socketService';
import { initializeCache } from './services/cacheService';

const app = express();

// Ensure DATABASE_URL is set before creating PrismaClient
if (!process.env.DATABASE_URL) {
  console.error('FATAL ERROR: DATABASE_URL is not set!');
  console.error('Please check your .env file in the server directory.');
  process.exit(1);
}

// Explicitly pass DATABASE_URL to PrismaClient to ensure it's available
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : ['error'],
});

// Initialize logging
const debugMode = process.env.DEBUG === 'true';
const loggingEnabled = debugMode || process.env.ENABLE_LOGGING === 'true';

if (loggingEnabled) {
  logger.info('Logging enabled', {
    debugMode,
    logFile: process.env.LOG_FILE || 'logs/server-YYYY-MM-DD.log',
    logToConsole: debugMode || process.env.LOG_TO_CONSOLE === 'true',
    logLevel: debugMode ? 'debug' : (process.env.LOG_LEVEL || 'info'),
  });
  app.use(requestLogger);
}

// Configure CORS to allow credentials (cookies/sessions)
// Normalize CLIENT_URL by removing trailing slash (CORS requires exact match)
const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
const normalizedClientUrl = clientUrl.replace(/\/$/, ''); // Remove trailing slash
app.use(cors({
  origin: normalizedClientUrl,
  credentials: true, // Allow cookies/sessions
}));
app.use(express.json());

// Session configuration - MUST be before routes
// For cross-domain (Vercel <-> Fly.io), we need sameSite: 'none' and secure: true
const isProduction = process.env.NODE_ENV === 'production';
const isCrossDomain = isProduction && clientUrl.includes('vercel.app');

app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true, // Allow saving uninitialized sessions (needed for login)
  cookie: {
    secure: isProduction, // true in production (requires HTTPS), false in development
    httpOnly: true, // Prevent XSS attacks
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: isCrossDomain ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for same-domain
  },
  name: 'spin-master.sid', // Custom session name
}));

// Debug: Log session middleware setup
logger.debug('Session middleware configured', {
  saveUninitialized: true,
  resave: false,
  cookieSecure: false
});

// Request logging is handled by requestLogger middleware when ENABLE_LOGGING is true

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api', playoffRoutes);
app.use('/api', roundRobinRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Create HTTP server (needed for Socket.io)
const httpServer = createServer(app);

// Initialize Socket.io
// Use the same normalized client URL for Socket.io CORS
const io = new Server(httpServer, {
  cors: {
    origin: normalizedClientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Set Socket.io instance in socket service
setIO(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Only start the server if this file is run directly, not when imported as a module
if (require.main === module) {
  // Initialize cache on startup (non-blocking)
  initializeCache().then(() => {
    logger.info('Cache initialization completed');
  }).catch((error) => {
    logger.error('Cache initialization failed', { error: error instanceof Error ? error.message : String(error) });
  });

  // Listen on all interfaces (0.0.0.0) for production, localhost for development
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
  httpServer.listen(PORT, host, () => {
    logger.info('Server started', { port: PORT, host, environment: process.env.NODE_ENV || 'development' });
    if (!process.env.LOG_TO_CONSOLE && process.env.DEBUG !== 'true') {
      // Only use console.log if logging is completely disabled, so users know the server started
      console.log(`Server running on ${host}:${PORT}`);
    }
  });
}

export { prisma, httpServer };


