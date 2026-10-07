/**
 * Taash Game Server Entry Point
 * Express + Socket.IO setup with CORS, room management, and game loops.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const RoomManager = require('./src/rooms/RoomManager');
const registerLobbyHandlers = require('./src/handlers/lobbyHandlers');
const registerGameHandlers = require('./src/handlers/gameHandlers');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with permissive CORS for local dev / mobile clients
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

// Basic health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: roomManager.rooms.size,
    timestamp: new Date().toISOString(),
  });
});

// Serve exported static web client if available (production web bundle)
const path = require('path');
const fs = require('fs');
const distPath = path.resolve(__dirname, '../game-client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Socket.IO Connection Lifecycle
io.on('connection', (socket) => {
  console.log(`🔌 [SOCKET CONNECTED] ID: ${socket.id} from: ${socket.handshake.address}`);

  // Register handlers
  registerLobbyHandlers(io, socket, roomManager);
  registerGameHandlers(io, socket, roomManager);

  // Handle player disconnection
  socket.on('disconnect', (reason) => {
    console.log(`❌ [SOCKET DISCONNECTED] ID: ${socket.id} reason: ${reason}`);
    const room = roomManager.findRoomByPlayer(socket.id);
    if (room) {
      const result = room.handleDisconnect(socket.id);
      if (result && result.roomEmpty) {
        roomManager.removeRoom(room.code);
      } else {
        io.to(room.code).emit('lobby_update', room.getLobbyState());
        if (room.match && room.match.currentRound) {
          room.broadcastSanitizedGameState(io);
        }
      }
    }
    roomManager.untrackPlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`♠♥♦♣ Taash Server running on port ${PORT}`);
  });
}

module.exports = { app, server, io, roomManager };
