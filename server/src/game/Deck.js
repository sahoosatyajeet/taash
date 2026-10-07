/**
 * Deck Model
 * Handles creation of the 40-card Taash deck with Joker replacement,
 * shuffling (Fisher-Yates), and dealing.
 */

const Card = require('./Card');
const { SUITS, RANKS } = require('../utils/constants');

class Deck {
  constructor() {
    this.cards = [];
    this._build();
  }

  /**
   * Build the 40-card deck:
   * - 4 suits × 10 ranks (5, 6, 7, 8, 9, 10, J, Q, K, A)
   * - Replace 5 of Spades with the Joker
   */
  _build() {
    this.cards = [];
    const suitValues = Object.values(SUITS);

    for (const suit of suitValues) {
      for (const rank of RANKS) {
        // Replace 5♠ with Joker
        if (suit === SUITS.SPADES && rank === '5') {
          this.cards.push(Card.createJoker());
        } else {
          this.cards.push(new Card(suit, rank));
        }
      }
    }
  }

  /**
   * Fisher-Yates shuffle — cryptographically unnecessary but fair.
   */
  shuffle() {
    const arr = this.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return this;
  }

  /**
   * Deal cards to 4 players (10 each).
   * Returns an array of 4 arrays, each containing 10 Card objects.
   */
  deal() {
    if (this.cards.length !== 40) {
      throw new Error(`Deck must have exactly 40 cards, found ${this.cards.length}`);
    }

    const hands = [[], [], [], []];
    for (let i = 0; i < this.cards.length; i++) {
      hands[i % 4].push(this.cards[i]);
    }

    // Verify each hand has exactly 10 cards
    for (let p = 0; p < 4; p++) {
      if (hands[p].length !== 10) {
        throw new Error(`Player ${p} received ${hands[p].length} cards instead of 10`);
      }
    }

    return hands;
  }

  /**
   * Rebuild and reshuffle the deck (for redeals).
   */
  reset() {
    this._build();
    this.shuffle();
    return this;
  }

  /**
   * Verify deck integrity: 40 cards, 1 Joker, no 5♠, all other cards present.
   */
  validate() {
    if (this.cards.length !== 40) return false;

    const ids = this.cards.map(c => c.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== 40) return false;

    // Must have exactly 1 Joker
    if (ids.filter(id => id === 'JOKER').length !== 1) return false;

    // Must NOT have 5 of Spades
    if (ids.includes('SPADES_5')) return false;

    return true;
  }
}

module.exports = Deck;
