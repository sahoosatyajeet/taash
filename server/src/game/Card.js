/**
 * Card Model
 * Represents a single playing card or the Joker.
 */

const { SUITS, SUIT_SYMBOLS, RANKS, JOKER_ID, FIVE_OF_SPADES_ID } = require('../utils/constants');

class Card {
  /**
   * @param {string} suit - One of SUITS values (or null for Joker)
   * @param {string} rank - One of RANKS values (or null for Joker)
   * @param {boolean} isJoker - Whether this card is the Joker
   */
  constructor(suit, rank, isJoker = false) {
    this.suit = suit;
    this.rank = rank;
    this.isJoker = isJoker;
  }

  /**
   * Unique identifier for this card.
   * e.g., "HEARTS_A", "SPADES_7", "JOKER"
   */
  get id() {
    if (this.isJoker) return JOKER_ID;
    return `${this.suit}_${this.rank}`;
  }

  /**
   * Human-readable display string.
   * e.g., "A♥", "7♠", "🃏"
   */
  get display() {
    if (this.isJoker) return '🃏';
    return `${this.rank}${SUIT_SYMBOLS[this.suit]}`;
  }

  /**
   * Serialize for network transfer.
   */
  toJSON() {
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      isJoker: this.isJoker,
      display: this.display,
    };
  }

  /**
   * Create a Card from a serialized object.
   */
  static fromJSON(data) {
    if (data.isJoker) return Card.createJoker();
    return new Card(data.suit, data.rank);
  }

  /**
   * Factory: create the Joker card.
   */
  static createJoker() {
    return new Card(null, null, true);
  }

  /**
   * Factory: create the 5 of Spades (what the Joker reverts to on penalty tricks).
   */
  static createFiveOfSpades() {
    return new Card(SUITS.SPADES, '5', false);
  }
}

module.exports = Card;
