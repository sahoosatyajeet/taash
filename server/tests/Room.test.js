/**
 * Tests for Room & RoomManager models
 */

const Room = require('../src/rooms/Room');
const RoomManager = require('../src/rooms/RoomManager');
const { SEATS, TEAMS } = require('../src/utils/constants');

describe('Room Model', () => {
  let room;
  const host = { id: 'user-1', name: 'Alice', socketId: 'sock-1' };

  beforeEach(() => {
    room = new Room('TEST', host);
  });

  test('creates room with host seated at North (Seat 0, Team A)', () => {
    expect(room.code).toBe('TEST');
    expect(room.hostId).toBe('user-1');
    expect(room.players.size).toBe(1);
    expect(room.seats[0].name).toBe('Alice');
    expect(room.seats[0].team).toBe('A');
    expect(room.seats[0].isReady).toBe(true);
  });

  test('adds players to consecutive seats and maps teams correctly', () => {
    const p2 = { id: 'user-2', name: 'Bob', socketId: 'sock-2' };
    const p3 = { id: 'user-3', name: 'Charlie', socketId: 'sock-3' };
    const p4 = { id: 'user-4', name: 'Diana', socketId: 'sock-4' };

    const r2 = room.addPlayer(p2);
    const r3 = room.addPlayer(p3);
    const r4 = room.addPlayer(p4);

    expect(r2.seat).toBe(1); // East (Team B)
    expect(room.seats[1].team).toBe('B');

    expect(r3.seat).toBe(2); // South (Team A - Alice's partner!)
    expect(room.seats[2].team).toBe('A');

    expect(r4.seat).toBe(3); // West (Team B - Bob's partner!)
    expect(room.seats[3].team).toBe('B');

    expect(room.players.size).toBe(4);
  });

  test('rejects 5th player when room is full', () => {
    room.addPlayer({ id: 'user-2', name: 'Bob', socketId: 'sock-2' });
    room.addPlayer({ id: 'user-3', name: 'Charlie', socketId: 'sock-3' });
    room.addPlayer({ id: 'user-4', name: 'Diana', socketId: 'sock-4' });

    const p5 = room.addPlayer({ id: 'user-5', name: 'Eve', socketId: 'sock-5' });
    expect(p5.success).toBe(false);
    expect(p5.error).toContain('full');
  });

  test('switching seats updates team assignment', () => {
    room.addPlayer({ id: 'user-2', name: 'Bob', socketId: 'sock-2' }); // Seat 1, Team B
    const switchRes = room.switchSeat('user-2', 2); // Switch to Seat 2 (Team A)

    expect(switchRes.success).toBe(true);
    expect(room.seats[1]).toBeNull();
    expect(room.seats[2].name).toBe('Bob');
    expect(room.seats[2].team).toBe('A');
  });

  test('cannot start match unless all 4 players are ready', () => {
    expect(room.canStart()).toBe(false);

    room.addPlayer({ id: 'user-2', name: 'Bob', socketId: 'sock-2' });
    room.addPlayer({ id: 'user-3', name: 'Charlie', socketId: 'sock-3' });
    room.addPlayer({ id: 'user-4', name: 'Diana', socketId: 'sock-4' });

    expect(room.canStart()).toBe(false); // Non-hosts are not ready yet

    room.setReady('user-2', true);
    room.setReady('user-3', true);
    room.setReady('user-4', true);

    expect(room.canStart()).toBe(true);

    const startRes = room.startMatch();
    expect(startRes.success).toBe(true);
    expect(startRes.roundNumber).toBe(1);
    expect(startRes.dealerSeat).toBe(0);
    expect(room.match.currentRound.hands[0].length).toBe(10);
  });

  test('handles disconnect with reconnection', () => {
    const p2 = { id: 'user-2', name: 'Bob', socketId: 'sock-2' };
    room.addPlayer(p2);

    room.handleDisconnect('sock-2');
    expect(room.seats[1].isConnected).toBe(false);

    // Reconnecting with new socket ID
    const reconnectRes = room.addPlayer({ id: 'user-2', name: 'Bob', socketId: 'sock-2-new' });
    expect(reconnectRes.success).toBe(true);
    expect(reconnectRes.reconnected).toBe(true);
    expect(room.seats[1].isConnected).toBe(true);
    expect(room.seats[1].socketId).toBe('sock-2-new');
  });
});

describe('RoomManager', () => {
  let manager;
  const host = { id: 'host-1', name: 'Host', socketId: 's-1' };

  beforeEach(() => {
    manager = new RoomManager();
  });

  test('creates room with 4-letter uppercase code', () => {
    const room = manager.createRoom(host);
    expect(room.code.length).toBe(4);
    expect(room.code).toBe(room.code.toUpperCase());
    expect(manager.getRoom(room.code)).toBe(room);
  });

  test('finds room by player ID or socket ID', () => {
    const room = manager.createRoom(host);
    expect(manager.findRoomByPlayer('host-1')).toBe(room);
    expect(manager.findRoomByPlayer('s-1')).toBe(room);
  });

  test('removes room cleanly', () => {
    const room = manager.createRoom(host);
    const code = room.code;
    manager.removeRoom(code);
    expect(manager.getRoom(code)).toBeNull();
    expect(manager.findRoomByPlayer('host-1')).toBeNull();
  });
});
