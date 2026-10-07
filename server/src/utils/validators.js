/**
 * Validators
 * Input validation helpers for game actions.
 */

const { SUITS, HIERARCHY, CONFIG } = require('./constants');

const validators = {
  /**
   * Validate a bid amount.
   */
  isValidBid(amount, currentHighest = 0) {
    if (typeof amount !== 'number' || !Number.isInteger(amount)) return false;
    if (amount < CONFIG.MIN_BID || amount > CONFIG.MAX_BID) return false;
    if (amount <= currentHighest) return false;
    return true;
  },

  /**
   * Validate a suit choice.
   */
  isValidSuit(suit) {
    return Object.values(SUITS).includes(suit);
  },

  /**
   * Validate a hierarchy choice.
   */
  isValidHierarchy(hierarchy) {
    return Object.values(HIERARCHY).includes(hierarchy);
  },

  /**
   * Validate a seat index.
   */
  isValidSeat(seat) {
    return Number.isInteger(seat) && seat >= 0 && seat <= 3;
  },

  /**
   * Validate a player name.
   */
  isValidPlayerName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 20;
  },

  /**
   * Validate a room code.
   */
  isValidRoomCode(code) {
    if (typeof code !== 'string') return false;
    return /^[A-Z0-9]{4,6}$/.test(code);
  },
};

module.exports = validators;
