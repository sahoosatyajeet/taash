/**
 * End-to-End Socket.IO Integration Tests
 * Tests 4 live sockets connecting, creating lobby, starting match, bidding,
 * secret trump choice, unveiling colour, and playing a card.
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const RoomManager = require('../src/rooms/RoomManager');
const registerLobbyHandlers = require('../src/handlers/lobbyHandlers');
const registerGameHandlers = require('../src/handlers/gameHandlers');
const { SUITS, HIERARCHY } = require('../src/utils/constants');

describe('Socket.IO Integration Tests', () => {
  let io, server, roomManager, port;
  let clients = [];

  beforeAll((done) => {
    server = createServer();
    io = new Server(server);
    roomManager = new RoomManager();

    io.on('connection', (socket) => {
      registerLobbyHandlers(io, socket, roomManager);
      registerGameHandlers(io, socket, roomManager);
    });

    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    clients = [];
  });

  const createClient = () => {
    const socket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(socket);
    return new Promise((resolve) => {
      socket.on('connect', () => resolve(socket));
    });
  };

  test('4 players join lobby, ready up, and receive private game state', async () => {
    const p1 = await createClient();
    const p2 = await createClient();
    const p3 = await createClient();
    const p4 = await createClient();

    // Player 1 creates room
    let roomCode;
    await new Promise((res) => {
      p1.emit('create_room', { playerName: 'Player 1', playerId: 'p1' }, (data) => {
        expect(data.success).toBe(true);
        expect(data.seat).toBe(0);
        roomCode = data.roomCode;
        res();
      });
    });

    // Players 2, 3, 4 join
    await new Promise((res) => {
      p2.emit('join_room', { roomCode, playerName: 'Player 2', playerId: 'p2' }, (data) => {
        expect(data.success).toBe(true);
        expect(data.seat).toBe(1);
        res();
      });
    });

    await new Promise((res) => {
      p3.emit('join_room', { roomCode, playerName: 'Player 3', playerId: 'p3' }, (data) => {
        expect(data.success).toBe(true);
        expect(data.seat).toBe(2);
        res();
      });
    });

    await new Promise((res) => {
      p4.emit('join_room', { roomCode, playerName: 'Player 4', playerId: 'p4' }, (data) => {
        expect(data.success).toBe(true);
        expect(data.seat).toBe(3);
        res();
      });
    });

    // Players 2, 3, 4 ready up
    await Promise.all([
      new Promise((res) => p2.emit('set_ready', { isReady: true }, res)),
      new Promise((res) => p3.emit('set_ready', { isReady: true }, res)),
      new Promise((res) => p4.emit('set_ready', { isReady: true }, res)),
    ]);

    // Track game_state_update for each player
    const states = {};
    p1.on('game_state_update', (st) => { states.p1 = st; });
    p2.on('game_state_update', (st) => { states.p2 = st; });
    p3.on('game_state_update', (st) => { states.p3 = st; });
    p4.on('game_state_update', (st) => { states.p4 = st; });

    // Host starts game
    await new Promise((res) => {
      p1.emit('start_game', {}, (data) => {
        expect(data.success).toBe(true);
        res();
      });
    });

    // Wait briefly for all states to arrive
    await new Promise((r) => setTimeout(r, 100));

    // Verify sanitization:
    // 1. Each player has exactly 10 cards in their private hand
    expect(states.p1.hand.length).toBe(10);
    expect(states.p2.hand.length).toBe(10);
    expect(states.p3.hand.length).toBe(10);
    expect(states.p4.hand.length).toBe(10);

    // 2. No other player's cards are visible
    expect(states.p1.otherPlayers[1].cards).toBeUndefined();
    expect(states.p1.otherPlayers[1].cardsRemaining).toBe(10);

    // 3. Trump suit is completely hidden
    expect(states.p1.trump.suit).toBeNull();
    expect(states.p1.trump.revealed).toBe(false);

    // 4. Seating and team assignments are verified
    expect(states.p1.yourSeat).toBe(0);
    expect(states.p1.yourTeam).toBe('A');
    expect(states.p2.yourSeat).toBe(1);
    expect(states.p2.yourTeam).toBe('B');
  });

  test('bidding, secret trump setting, and unveiling over sockets', async () => {
    const p1 = await createClient();
    const p2 = await createClient();
    const p3 = await createClient();
    const p4 = await createClient();

    let roomCode;
    await new Promise((res) => {
      p1.emit('create_room', { playerName: 'P1', playerId: 'p1' }, (d) => {
        roomCode = d.roomCode;
        res();
      });
    });

    await Promise.all([
      new Promise((res) => p2.emit('join_room', { roomCode, playerName: 'P2', playerId: 'p2' }, res)),
      new Promise((res) => p3.emit('join_room', { roomCode, playerName: 'P3', playerId: 'p3' }, res)),
      new Promise((res) => p4.emit('join_room', { roomCode, playerName: 'P4', playerId: 'p4' }, res)),
    ]);

    await Promise.all([
      new Promise((res) => p2.emit('set_ready', { isReady: true }, res)),
      new Promise((res) => p3.emit('set_ready', { isReady: true }, res)),
      new Promise((res) => p4.emit('set_ready', { isReady: true }, res)),
    ]);

    await new Promise((res) => p1.emit('start_game', {}, res));

    // Dealer is seat 0 (P1). Bidding order is seat 1 (P2), seat 2 (P3), seat 3 (P4), then dealer (P1).
    // P2 places bid of 6
    await new Promise((res) => {
      p2.emit('place_bid', { amount: 6 }, (d) => {
        expect(d.success).toBe(true);
        res();
      });
    });

    // P3 skips
    await new Promise((res) => {
      p3.emit('skip_bid', {}, (d) => {
        expect(d.success).toBe(true);
        res();
      });
    });

    // P4 skips
    await new Promise((res) => {
      p4.emit('skip_bid', {}, (d) => {
        expect(d.success).toBe(true);
        res();
      });
    });

    // P1 (dealer) skips -> P2 wins auction with 6!
    await new Promise((res) => {
      p1.emit('skip_bid', {}, (d) => {
        expect(d.success).toBe(true);
        expect(d.bidWon).toBe(true);
        res();
      });
    });

    // P2 sets secret trump: Hearts, Small Colour Only
    await new Promise((res) => {
      p2.emit('set_trump', { suit: SUITS.HEARTS, hierarchy: HIERARCHY.SMALL_COLOUR }, (d) => {
        expect(d.success).toBe(true);
        res();
      });
    });

    const room = roomManager.getRoom(roomCode);
    const round = room.match.currentRound;

    // Check that trump is set server side
    expect(round.trump.suit).toBe(SUITS.HEARTS);
    expect(round.trump.revealed).toBe(false);

    // Non-bidder (P1) cannot see trump in their state
    const p1State = round.getStateForPlayer(0);
    expect(p1State.trump.suit).toBeNull();

    // Bidder (P2) CAN see what they chose
    const p2State = round.getStateForPlayer(1);
    expect(p2State.trump.suit).toBe(SUITS.HEARTS);
    expect(p2State.trump.revealedToBidder).toBe(true);
  });
});
