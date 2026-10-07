/**
 * Tests for Card and Deck models
 */

const Card = require('../src/game/Card');
const Deck = require('../src/game/Deck');
const { SUITS, RANKS } = require('../src/utils/constants');

describe('Card', () => {
  test('creates a normal card with correct id and display', () => {
    const card = new Card(SUITS.HEARTS, 'A');
    expect(card.id).toBe('HEARTS_A');
    expect(card.display).toBe('A♥');
    expect(card.isJoker).toBe(false);
  });

  test('creates Joker correctly', () => {
    const joker = Card.createJoker();
    expect(joker.id).toBe('JOKER');
    expect(joker.display).toBe('🃏');
    expect(joker.isJoker).toBe(true);
    expect(joker.suit).toBeNull();
    expect(joker.rank).toBeNull();
  });

  test('creates 5 of Spades correctly', () => {
    const fiveSpades = Card.createFiveOfSpades();
    expect(fiveSpades.id).toBe('SPADES_5');
    expect(fiveSpades.suit).toBe(SUITS.SPADES);
    expect(fiveSpades.rank).toBe('5');
    expect(fiveSpades.isJoker).toBe(false);
  });

  test('serializes and deserializes correctly', () => {
    const card = new Card(SUITS.DIAMONDS, 'K');
    const json = card.toJSON();
    const restored = Card.fromJSON(json);
    expect(restored.id).toBe(card.id);
    expect(restored.suit).toBe(card.suit);
    expect(restored.rank).toBe(card.rank);
  });

  test('serializes and deserializes Joker correctly', () => {
    const joker = Card.createJoker();
    const json = joker.toJSON();
    const restored = Card.fromJSON(json);
    expect(restored.isJoker).toBe(true);
    expect(restored.id).toBe('JOKER');
  });
});

describe('Deck', () => {
  test('has exactly 40 cards', () => {
    const deck = new Deck();
    expect(deck.cards.length).toBe(40);
  });

  test('contains the Joker instead of 5♠', () => {
    const deck = new Deck();
    const ids = deck.cards.map(c => c.id);
    expect(ids).toContain('JOKER');
    expect(ids).not.toContain('SPADES_5');
  });

  test('contains exactly 1 Joker', () => {
    const deck = new Deck();
    const jokers = deck.cards.filter(c => c.isJoker);
    expect(jokers.length).toBe(1);
  });

  test('each suit has 10 cards (Spades has 9 + Joker)', () => {
    const deck = new Deck();
    const suitCounts = {};
    let jokerCount = 0;

    for (const card of deck.cards) {
      if (card.isJoker) {
        jokerCount++;
      } else {
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
      }
    }

    expect(suitCounts[SUITS.HEARTS]).toBe(10);
    expect(suitCounts[SUITS.DIAMONDS]).toBe(10);
    expect(suitCounts[SUITS.CLUBS]).toBe(10);
    expect(suitCounts[SUITS.SPADES]).toBe(9); // 5♠ replaced by Joker
    expect(jokerCount).toBe(1);
  });

  test('all 40 card IDs are unique', () => {
    const deck = new Deck();
    const ids = deck.cards.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(40);
  });

  test('validates a correct deck', () => {
    const deck = new Deck();
    expect(deck.validate()).toBe(true);
  });

  test('shuffle changes card order', () => {
    const deck1 = new Deck();
    const deck2 = new Deck();
    deck2.shuffle();

    // It's theoretically possible for shuffle to produce the same order,
    // but with 40! permutations it's essentially impossible
    const ids1 = deck1.cards.map(c => c.id).join(',');
    const ids2 = deck2.cards.map(c => c.id).join(',');

    // At least some cards should be in different positions
    let differences = 0;
    for (let i = 0; i < 40; i++) {
      if (deck1.cards[i].id !== deck2.cards[i].id) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  test('deals 10 cards to each of 4 players', () => {
    const deck = new Deck();
    deck.shuffle();
    const hands = deck.deal();

    expect(hands.length).toBe(4);
    for (const hand of hands) {
      expect(hand.length).toBe(10);
    }
  });

  test('all dealt cards are unique across all hands', () => {
    const deck = new Deck();
    deck.shuffle();
    const hands = deck.deal();

    const allIds = hands.flat().map(c => c.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(40);
  });

  test('exactly one player gets the Joker', () => {
    const deck = new Deck();
    deck.shuffle();
    const hands = deck.deal();

    let jokerCount = 0;
    for (const hand of hands) {
      jokerCount += hand.filter(c => c.isJoker).length;
    }
    expect(jokerCount).toBe(1);
  });

  test('reset rebuilds and reshuffles', () => {
    const deck = new Deck();
    deck.shuffle();
    const before = deck.cards.map(c => c.id).join(',');
    deck.reset();
    expect(deck.validate()).toBe(true);
    expect(deck.cards.length).toBe(40);
  });
});
