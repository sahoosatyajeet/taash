/**
 * RoomManager
 * Manages creation, retrieval, and cleanup of multiplayer game rooms.
 */

const Room = require('./Room');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
    this.playerToRoom = new Map(); // playerId/socketId -> roomCode
  }

  /**
   * Generate a random 4-letter uppercase code.
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous 0/O, 1/I
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Create a new room with host.
   */
  createRoom(host) {
    const code = this.generateRoomCode();
    const room = new Room(code, host);
    this.rooms.set(code, room);
    this.playerToRoom.set(host.id, code);
    this.playerToRoom.set(host.socketId, code);
    return room;
  }

  /**
   * Get an existing room.
   */
  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  /**
   * Find room associated with a player ID or socket ID.
   */
  findRoomByPlayer(identifier) {
    const code = this.playerToRoom.get(identifier);
    if (!code) return null;
    return this.getRoom(code);
  }

  /**
   * Bind player identifier to room code.
   */
  trackPlayer(identifier, roomCode) {
    this.playerToRoom.set(identifier, roomCode);
  }

  /**
   * Untrack player identifier.
   */
  untrackPlayer(identifier) {
    this.playerToRoom.delete(identifier);
  }

  /**
   * Remove a room.
   */
  removeRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      for (const p of room.players.values()) {
        this.playerToRoom.delete(p.id);
        this.playerToRoom.delete(p.socketId);
      }
      this.rooms.delete(code);
      return true;
    }
    return false;
  }

  /**
   * Clean empty rooms.
   */
  cleanupEmptyRooms() {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.size === 0) {
        this.removeRoom(code);
      }
    }
  }
}

module.exports = RoomManager;
