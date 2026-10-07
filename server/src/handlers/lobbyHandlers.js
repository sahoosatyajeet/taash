/**
 * Lobby Socket Handlers
 * Handles room creation, joining, seat selection, readiness, and game start.
 */

const validators = require('../utils/validators');

function registerLobbyHandlers(io, socket, roomManager) {
  /**
   * Helper: get player and room from socket
   */
  const getContext = () => {
    const room = roomManager.findRoomByPlayer(socket.id);
    if (!room) return { room: null, player: null };
    const player = room.players.get(socket.data?.playerId) ||
      Array.from(room.players.values()).find(p => p.socketId === socket.id);
    return { room, player };
  };

  // ─── Create Room ─────────────────────────────────────────
  socket.on('create_room', ({ playerName, playerId } = {}, callback) => {
    console.log(`🏠 [CREATE ROOM REQUEST] Player: "${playerName}" from socket ${socket.id}`);
    const cleanName = (playerName || 'Host').trim().slice(0, 20);
    const id = playerId || socket.id;

    socket.data = socket.data || {};
    socket.data.playerId = id;

    const room = roomManager.createRoom({
      id,
      name: cleanName,
      socketId: socket.id,
    });

    socket.join(room.code);

    const lobbyState = room.getLobbyState();
    console.log(`✅ [ROOM CREATED] Code: ${room.code} for host: ${cleanName}`);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: room.code, lobbyState, seat: 0 });
    }

    io.to(room.code).emit('lobby_update', lobbyState);
  });

  // ─── Join Room ───────────────────────────────────────────
  socket.on('join_room', ({ roomCode, playerName, playerId, preferredSeat } = {}, callback) => {
    if (!roomCode) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room code required' });
      return;
    }

    const room = roomManager.getRoom(roomCode);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    const cleanName = (playerName || 'Player').trim().slice(0, 20);
    const id = playerId || socket.id;
    socket.data = socket.data || {};
    socket.data.playerId = id;

    const joinRes = room.addPlayer({
      id,
      name: cleanName,
      socketId: socket.id,
    }, preferredSeat);

    if (!joinRes.success) {
      if (typeof callback === 'function') callback(joinRes);
      return;
    }

    socket.join(room.code);
    roomManager.trackPlayer(id, room.code);
    roomManager.trackPlayer(socket.id, room.code);

    const lobbyState = room.getLobbyState();
    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: room.code,
        seat: joinRes.seat,
        lobbyState,
      });
    }

    io.to(room.code).emit('lobby_update', lobbyState);

    // If game was already running (reconnect scenario)
    if (room.match && room.match.currentRound) {
      room.broadcastSanitizedGameState(io);
    }
  });

  // ─── Switch Seat ─────────────────────────────────────────
  socket.on('switch_seat', ({ targetSeat } = {}, callback) => {
    const { room, player } = getContext();
    if (!room || !player) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in a room' });
      return;
    }

    const res = room.switchSeat(player.id, targetSeat);
    if (typeof callback === 'function') callback(res);

    if (res.success) {
      io.to(room.code).emit('lobby_update', room.getLobbyState());
    }
  });

  // ─── Set Ready ───────────────────────────────────────────
  socket.on('set_ready', ({ isReady } = {}, callback) => {
    const { room, player } = getContext();
    if (!room || !player) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in a room' });
      return;
    }

    const res = room.setReady(player.id, isReady);
    if (typeof callback === 'function') callback(res);

    if (res.success) {
      io.to(room.code).emit('lobby_update', room.getLobbyState());
    }
  });

  // ─── Leave Room ──────────────────────────────────────────
  socket.on('leave_room', (data, callback) => {
    const { room, player } = getContext();
    if (room && player) {
      socket.leave(room.code);
      roomManager.untrackPlayer(socket.id);
      roomManager.untrackPlayer(player.id);
      room.removePlayer(player.id);

      if (room.players.size === 0) {
        roomManager.removeRoom(room.code);
      } else {
        io.to(room.code).emit('lobby_update', room.getLobbyState());
      }
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  // ─── Start Match ─────────────────────────────────────────
  socket.on('start_game', (data, callback) => {
    const { room, player } = getContext();
    if (!room || !player) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in a room' });
      return;
    }

    if (room.hostId !== player.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can start the game' });
      return;
    }

    const res = room.startMatch();
    if (!res.success) {
      if (typeof callback === 'function') callback(res);
      return;
    }

    if (typeof callback === 'function') callback(res);

    io.to(room.code).emit('game_started', {
      roundNumber: res.roundNumber,
      dealerSeat: res.dealerSeat,
    });

    // Send private, sanitized game state to all 4 players
    room.broadcastSanitizedGameState(io);

    // Trigger bot if it's bot's turn to bid
    room.triggerBotTurnIfNeeded(io);
  });

  // ─── Add Bots ────────────────────────────────────────────
  socket.on('add_bots', (data, callback) => {
    const { room, player } = getContext();
    if (!room || !player) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in a room' });
      return;
    }

    if (room.hostId !== player.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can add bots' });
      return;
    }

    room.fillWithBots();
    io.to(room.code).emit('lobby_update', room.getLobbyState());
    if (typeof callback === 'function') callback({ success: true });
  });
}

module.exports = registerLobbyHandlers;
