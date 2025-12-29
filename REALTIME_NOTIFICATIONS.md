# Real-Time Notifications Implementation Guide

## Overview
This document explains how to implement real-time notifications for database changes (new players, completed matches, completed tournaments) using WebSockets (Socket.io).

## Implementation Steps

### 1. Install Dependencies

**Backend:**
```bash
cd server
npm install socket.io
npm install --save-dev @types/socket.io
```

**Frontend:**
```bash
cd client
npm install socket.io-client
```

### 2. Backend Setup (server/src/index.ts)

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Export io for use in routes
export { io };

// Update server startup
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('Server started', { port: PORT });
});
```

### 3. Create Socket Service (server/src/services/socketService.ts)

```typescript
import { Server } from 'socket.io';
import { logger } from '../utils/logger';

let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}

// Emit events to all connected clients
export function emitToAll(event: string, data: any) {
  if (ioInstance) {
    ioInstance.emit(event, data);
    logger.debug('Emitted event to all clients', { event, data });
  }
}

// Emit events to specific room
export function emitToRoom(room: string, event: string, data: any) {
  if (ioInstance) {
    ioInstance.to(room).emit(event, data);
    logger.debug('Emitted event to room', { room, event, data });
  }
}
```

### 4. Update Routes to Emit Events

**In server/src/routes/players.ts:**
```typescript
import { emitToAll } from '../services/socketService';

// After creating a player
router.post('/', async (req, res) => {
  // ... existing code ...
  const newMember = await prisma.member.create({ ... });
  
  // Emit event
  emitToAll('player:added', {
    id: newMember.id,
    firstName: newMember.firstName,
    lastName: newMember.lastName,
    // ... other fields
  });
  
  res.json(memberWithoutPassword);
});

// After updating a player
router.patch('/:id', async (req, res) => {
  // ... existing code ...
  const updatedMember = await prisma.member.update({ ... });
  
  emitToAll('player:updated', {
    id: updatedMember.id,
    // ... updated fields
  });
  
  res.json(memberWithoutPassword);
});
```

**In server/src/routes/tournaments.ts:**
```typescript
import { emitToAll } from '../services/socketService';

// After completing a tournament
router.patch('/:id/complete', async (req, res) => {
  // ... existing code ...
  const tournament = await prisma.tournament.update({ ... });
  
  emitToAll('tournament:completed', {
    id: tournament.id,
    name: tournament.name,
    // ... other fields
  });
  
  res.json(tournament);
});

// After match is completed/updated
// (in match creation/update endpoints)
emitToAll('match:completed', {
  id: match.id,
  member1Id: match.member1Id,
  member2Id: match.member2Id,
  // ... other fields
});
```

### 5. Frontend Setup (client/src/utils/socket.ts)

```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string) {
  if (socket?.connected) {
    return socket;
  }

  socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
    auth: {
      token: token
    },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
```

### 6. Use in React Components

**In client/src/components/Players.tsx:**
```typescript
import { useEffect } from 'react';
import { getSocket } from '../utils/socket';
import { getToken } from '../utils/auth'; // Your auth utility

useEffect(() => {
  const token = getToken(); // Get JWT token
  const socket = connectSocket(token);

  // Listen for player events
  socket.on('player:added', (data) => {
    // Refresh players list or add to state
    fetchPlayers();
    setSuccess(`New player added: ${data.firstName} ${data.lastName}`);
  });

  socket.on('player:updated', (data) => {
    // Update player in state or refresh
    fetchPlayers();
  });

  return () => {
    socket.off('player:added');
    socket.off('player:updated');
  };
}, []);
```

**In client/src/components/Tournaments.tsx:**
```typescript
useEffect(() => {
  const token = getToken();
  const socket = connectSocket(token);

  socket.on('tournament:completed', (data) => {
    fetchTournaments();
    setSuccess(`Tournament completed: ${data.name}`);
  });

  socket.on('match:completed', (data) => {
    // Refresh tournaments to get updated match data
    fetchTournaments();
  });

  return () => {
    socket.off('tournament:completed');
    socket.off('match:completed');
  };
}, []);
```

## Event Types

### Player Events
- `player:added` - New player created
- `player:updated` - Player information updated
- `player:activated` - Player activated
- `player:deactivated` - Player deactivated

### Tournament Events
- `tournament:created` - New tournament created
- `tournament:completed` - Tournament completed
- `tournament:updated` - Tournament updated

### Match Events
- `match:created` - New match created
- `match:completed` - Match result recorded
- `match:updated` - Match result updated

## Benefits

1. **Real-time Updates**: All users see changes immediately
2. **Reduced Server Load**: No polling needed
3. **Better UX**: Instant feedback on actions
4. **Multi-user Support**: Works across multiple browser tabs/users

## Alternative: Server-Sent Events (SSE)

If you prefer a simpler one-way solution:

```typescript
// Backend
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send events
  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep connection alive
  const interval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Frontend
const eventSource = new EventSource('/api/events');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle update
};
```

## Recommendation

**Use Socket.io** for:
- Full bidirectional communication
- Room-based messaging (future feature)
- Better error handling
- Automatic reconnection
- Industry standard

