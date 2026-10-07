/**
 * Tests for TrickResolver
 * Covers all hierarchy modes, Joker timing, unveil mechanics, and edge cases.
 */

const Card = require('../src/game/Card');
const TrickResolver = require('../src/game/TrickResolver');
const { SUITS, HIERARCHY } = require('../src/utils/constants');

// ─── Helper Factories ────────────────────────────────────
const c = (suit, rank) => new Card(suit, rank);
const joker = () => Card.createJoker();

const trumpRevealed = (suit, hierarchy) => ({
  suit, hierarchy, revealed: true,
});
const trumpHidden = (suit, hierarchy) => ({
  suit, hierarchy, revealed: false,
});

// ─── Basic Trick Resolution (Big Hierarchy, No Trump) ────

describe('TrickResolver - Big Hierarchy, No Trump', () => {
  const trump = trumpHidden(SUITS.HEARTS, HIERARCHY.BIG);

  test('highest lead-suit card wins', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'J') },
      { seat: 1, card: c(SUITS.DIAMONDS, 'A') },
      { seat: 2, card: c(SUITS.DIAMONDS, '7') },
      { seat: 3, card: c(SUITS.DIAMONDS, '5') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 3);
    expect(result.winnerSeat).toBe(1); // A♦ is highest
  });

  test('off-suit cards cannot win (even if higher rank)', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, '6') },
      { seat: 1, card: c(SUITS.CLUBS, 'A') },    // off-suit
      { seat: 2, card: c(SUITS.SPADES, 'A') },    // off-suit
      { seat: 3, card: c(SUITS.DIAMONDS, '8') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 4);
    expect(result.winnerSeat).toBe(3); // 8♦ beats 6♦; off-suit discarded
  });

  test('first player wins ties (same power, played first)', () => {
    // This shouldn't happen in practice (unique cards) but tests priority logic
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'K') },
      { seat: 1, card: c(SUITS.CLUBS, '6') },
      { seat: 2, card: c(SUITS.SPADES, '7') },
      { seat: 3, card: c(SUITS.HEARTS, '9') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 2);
    expect(result.winnerSeat).toBe(0); // Only lead-suit card
  });
});

// ─── Trump Revealed (Big Hierarchy) ─────────────────────

describe('TrickResolver - Revealed Trump (Big)', () => {
  const trump = trumpRevealed(SUITS.HEARTS, HIERARCHY.BIG);

  test('trump card beats lead-suit card', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'A') },  // Lead
      { seat: 1, card: c(SUITS.HEARTS, '5') },     // Trump (lowest rank but still trump)
      { seat: 2, card: c(SUITS.DIAMONDS, 'K') },
      { seat: 3, card: c(SUITS.DIAMONDS, 'Q') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 5);
    expect(result.winnerSeat).toBe(1); // 5♥ trumps everything
  });

  test('highest trump wins among multiple trumps', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'A') },
      { seat: 1, card: c(SUITS.HEARTS, '5') },
      { seat: 2, card: c(SUITS.HEARTS, 'K') },
      { seat: 3, card: c(SUITS.HEARTS, '9') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 6);
    expect(result.winnerSeat).toBe(2); // K♥ is highest trump in Big
  });

  test('unrevealed trump has no power (hidden)', () => {
    const hiddenTrump = trumpHidden(SUITS.HEARTS, HIERARCHY.BIG);
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, '6') },
      { seat: 1, card: c(SUITS.HEARTS, 'A') },     // Would be trump but it's hidden
      { seat: 2, card: c(SUITS.DIAMONDS, '8') },
      { seat: 3, card: c(SUITS.CLUBS, 'A') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, hiddenTrump, 4);
    expect(result.winnerSeat).toBe(2); // 8♦ wins (Hearts has no trump power yet)
  });
});

// ─── Small (Whole Game) Hierarchy ───────────────────────

describe('TrickResolver - Small Whole Hierarchy', () => {
  const trump = trumpRevealed(SUITS.CLUBS, HIERARCHY.SMALL_WHOLE);

  test('5 beats Ace in Small mode', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'A') },
      { seat: 1, card: c(SUITS.DIAMONDS, '5') },
      { seat: 2, card: c(SUITS.DIAMONDS, 'K') },
      { seat: 3, card: c(SUITS.DIAMONDS, '7') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 3);
    expect(result.winnerSeat).toBe(1); // 5♦ is highest in Small
  });

  test('trump 5 beats everything', () => {
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, '5') },
      { seat: 1, card: c(SUITS.CLUBS, 'A') },      // Trump, but A is lowest in Small
      { seat: 2, card: c(SUITS.CLUBS, '5') },       // Trump 5 — highest possible
      { seat: 3, card: c(SUITS.DIAMONDS, '6') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 4);
    expect(result.winnerSeat).toBe(2); // 5♣ (trump + highest in Small)
  });
});

// ─── Small (Colour Only) Hierarchy ──────────────────────

describe('TrickResolver - Small Colour Only', () => {
  test('non-trump suits use Big hierarchy even after reveal', () => {
    const trump = trumpRevealed(SUITS.HEARTS, HIERARCHY.SMALL_COLOUR);
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, '5') },
      { seat: 1, card: c(SUITS.DIAMONDS, 'A') },
      { seat: 2, card: c(SUITS.DIAMONDS, 'K') },
      { seat: 3, card: c(SUITS.DIAMONDS, '7') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 5);
    expect(result.winnerSeat).toBe(1); // A♦ wins — Diamonds uses Big
  });

  test('trump suit uses Small hierarchy after reveal', () => {
    const trump = trumpRevealed(SUITS.HEARTS, HIERARCHY.SMALL_COLOUR);
    const plays = [
      { seat: 0, card: c(SUITS.DIAMONDS, 'A') },
      { seat: 1, card: c(SUITS.HEARTS, 'A') },      // Trump but A is lowest in Small
      { seat: 2, card: c(SUITS.HEARTS, '5') },       // Trump 5 — highest in Small
      { seat: 3, card: c(SUITS.DIAMONDS, 'K') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, 6);
    expect(result.winnerSeat).toBe(2); // 5♥ trumps + highest in Small Colour
  });

  test('before reveal, trump suit uses Big hierarchy', () => {
    const trump = trumpHidden(SUITS.HEARTS, HIERARCHY.SMALL_COLOUR);
    const plays = [
      { seat: 0, card: c(SUITS.HEARTS, '5') },      // Lead with hearts
      { seat: 1, card: c(SUITS.HEARTS, 'A') },       // A should win in Big
      { seat: 2, card: c(SUITS.HEARTS, 'K') },
      { seat: 3, card: c(SUITS.HEARTS, '8') },
    ];
    // Hearts is led, but colour is hidden — no trump power, Big hierarchy
    const result = TrickResolver.resolve(plays, SUITS.HEARTS, trump, 3);
    expect(result.winnerSeat).toBe(1); // A♥ wins in Big hierarchy (not yet flipped)
  });
});

// ─── Joker Rules ────────────────────────────────────────

describe('TrickResolver - Joker Timing', () => {
  const trump = trumpRevealed(SUITS.HEARTS, HIERARCHY.BIG);

  test('Joker is supreme on tricks 2–9', () => {
    for (let trick = 2; trick <= 9; trick++) {
      const plays = [
        { seat: 0, card: c(SUITS.DIAMONDS, 'A') },
        { seat: 1, card: joker() },
        { seat: 2, card: c(SUITS.HEARTS, 'A') },  // Even trump Ace
        { seat: 3, card: c(SUITS.DIAMONDS, 'K') },
      ];
      const result = TrickResolver.resolve(plays, SUITS.DIAMONDS, trump, trick);
      expect(result.winnerSeat).toBe(1); // Joker wins on tricks 2–9
    }
  });

  test('Joker becomes 5♠ on trick 1 (penalty)', () => {
    const plays = [
      { seat: 0, card: c(SUITS.SPADES, 'A') },  // Lead spades
      { seat: 1, card: joker() },                  // Becomes 5♠ — lowest in Big
      { seat: 2, card: c(SUITS.SPADES, '6') },
      { seat: 3, card: c(SUITS.SPADES, '7') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.SPADES, trump, 1);
    expect(result.winnerSeat).toBe(0); // A♠ wins; Joker (as 5♠) is lowest
  });

  test('Joker becomes 5♠ on trick 10 (penalty)', () => {
    const plays = [
      { seat: 0, card: c(SUITS.SPADES, '8') },
      { seat: 1, card: c(SUITS.SPADES, '9') },
      { seat: 2, card: joker() },                  // Becomes 5♠
      { seat: 3, card: c(SUITS.SPADES, '6') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.SPADES, trump, 10);
    expect(result.winnerSeat).toBe(1); // 9♠ wins; Joker (5♠) is lowest
  });

  test('STRATEGIC EXPLOIT: Joker on trick 1 + Spades trump + Small = 5♠ is highest', () => {
    // This is the specific scenario from the rulebook!
    const spadesSmall = trumpRevealed(SUITS.SPADES, HIERARCHY.SMALL_WHOLE);
    const plays = [
      { seat: 0, card: c(SUITS.SPADES, 'A') },  // A♠ is lowest in Small
      { seat: 1, card: joker() },                  // Becomes 5♠ — highest in Small!
      { seat: 2, card: c(SUITS.SPADES, 'K') },
      { seat: 3, card: c(SUITS.SPADES, 'Q') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.SPADES, spadesSmall, 1);
    expect(result.winnerSeat).toBe(1); // Joker (5♠) wins because 5 is highest in Small!
  });

  test('STRATEGIC EXPLOIT: Joker on trick 10 + Spades trump + Small Colour', () => {
    const spadesSmallColour = trumpRevealed(SUITS.SPADES, HIERARCHY.SMALL_COLOUR);
    const plays = [
      { seat: 0, card: c(SUITS.SPADES, 'A') },  // A♠ lowest in Small Colour (trump suit flipped)
      { seat: 1, card: c(SUITS.SPADES, 'K') },
      { seat: 2, card: joker() },                  // Becomes 5♠ — highest trump in Small Colour!
      { seat: 3, card: c(SUITS.SPADES, 'Q') },
    ];
    const result = TrickResolver.resolve(plays, SUITS.SPADES, spadesSmallColour, 10);
    expect(result.winnerSeat).toBe(2); // Joker (5♠) is highest spade in Small Colour
  });
});

// ─── Legal Card Validation ──────────────────────────────

describe('TrickResolver - getLegalCards', () => {
  test('any card is legal when leading', () => {
    const hand = [
      c(SUITS.HEARTS, 'A'),
      c(SUITS.DIAMONDS, '7'),
      joker(),
    ];
    const legal = TrickResolver.getLegalCards(hand, null);
    expect(legal.length).toBe(3);
  });

  test('must follow suit if holding lead suit cards', () => {
    const hand = [
      c(SUITS.HEARTS, 'A'),
      c(SUITS.HEARTS, '6'),
      c(SUITS.DIAMONDS, 'K'),
      c(SUITS.CLUBS, '9'),
    ];
    const legal = TrickResolver.getLegalCards(hand, SUITS.HEARTS);
    expect(legal.length).toBe(2);
    expect(legal.every(c => c.suit === SUITS.HEARTS)).toBe(true);
  });

  test('Joker is always legal even when holding lead suit', () => {
    const hand = [
      c(SUITS.HEARTS, 'A'),
      c(SUITS.HEARTS, '6'),
      c(SUITS.DIAMONDS, 'K'),
      joker(),
    ];
    const legal = TrickResolver.getLegalCards(hand, SUITS.HEARTS);
    expect(legal.length).toBe(3); // 2 hearts + Joker
    expect(legal.some(c => c.isJoker)).toBe(true);
  });

  test('any card is legal when void in lead suit', () => {
    const hand = [
      c(SUITS.DIAMONDS, 'K'),
      c(SUITS.CLUBS, '9'),
      c(SUITS.SPADES, 'A'),
      joker(),
    ];
    const legal = TrickResolver.getLegalCards(hand, SUITS.HEARTS);
    expect(legal.length).toBe(4); // All cards legal
  });

  test('no forced winning — can play lower card of lead suit', () => {
    const hand = [
      c(SUITS.HEARTS, 'K'),
      c(SUITS.HEARTS, '6'), // Lower card — still legal
    ];
    const legal = TrickResolver.getLegalCards(hand, SUITS.HEARTS);
    expect(legal.length).toBe(2);
    expect(legal.some(c => c.rank === '6')).toBe(true);
  });
});

// ─── Unveil Colour Eligibility ──────────────────────────

describe('TrickResolver - canUnveilColour', () => {
  test('can unveil when void in lead suit and colour is hidden', () => {
    const hand = [c(SUITS.DIAMONDS, 'K'), c(SUITS.CLUBS, '7')];
    expect(TrickResolver.canUnveilColour(hand, SUITS.HEARTS, false)).toBe(true);
  });

  test('cannot unveil if holding lead suit cards', () => {
    const hand = [c(SUITS.HEARTS, '6'), c(SUITS.DIAMONDS, 'K')];
    expect(TrickResolver.canUnveilColour(hand, SUITS.HEARTS, false)).toBe(false);
  });

  test('cannot unveil if colour is already revealed', () => {
    const hand = [c(SUITS.DIAMONDS, 'K')];
    expect(TrickResolver.canUnveilColour(hand, SUITS.HEARTS, true)).toBe(false);
  });

  test('can unveil even without holding trump cards', () => {
    // Player is void in lead suit AND has no trump cards — still can unveil
    const hand = [c(SUITS.CLUBS, '8'), c(SUITS.DIAMONDS, 'Q')];
    expect(TrickResolver.canUnveilColour(hand, SUITS.HEARTS, false)).toBe(true);
  });

  test('Joker in hand does not count as having lead suit', () => {
    const hand = [joker(), c(SUITS.DIAMONDS, '9')];
    expect(TrickResolver.canUnveilColour(hand, SUITS.HEARTS, false)).toBe(true);
  });
});
