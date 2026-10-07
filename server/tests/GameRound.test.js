/**
 * Tests for GameRound
 * Covers bidding, trump setting, full round lifecycle, and edge cases.
 */

const GameRound = require('../src/game/GameRound');
const Card = require('../src/game/Card');
const { SUITS, HIERARCHY, PHASE } = require('../src/utils/constants');

describe('GameRound - Dealing', () => {
  test('deals 10 cards to each player', () => {
    const round = new GameRound(1, 0);
    const { hands } = round.deal();
    for (let i = 0; i < 4; i++) {
      expect(hands[i].length).toBe(10);
    }
    expect(round.phase).toBe(PHASE.BIDDING);
  });
});

describe('GameRound - Bidding', () => {
  let round;

  beforeEach(() => {
    round = new GameRound(1, 0); // Dealer is seat 0
    round.deal();
  });

  test('bid order: non-dealers (1, 2, 3) go first, dealer (0) last', () => {
    const order = round.getBidOrder();
    expect(order).toEqual([1, 2, 3, 0]);
  });

  test('first bidder is seat 1 (after dealer 0)', () => {
    expect(round.getCurrentBidderSeat()).toBe(1);
  });

  test('valid bid advances to next bidder', () => {
    const result = round.placeBid(1, 5);
    expect(result.success).toBe(true);
    expect(round.getCurrentBidderSeat()).toBe(2);
  });

  test('bid must be higher than current highest', () => {
    round.placeBid(1, 6);
    const result = round.placeBid(2, 5); // Too low
    expect(result.success).toBe(false);
    expect(result.error).toContain('higher');
  });

  test('skip advances to next bidder', () => {
    round.skipBid(1);
    expect(round.getCurrentBidderSeat()).toBe(2);
  });

  test('all 3 non-dealers skip → redeal', () => {
    round.skipBid(1);
    round.skipBid(2);
    const result = round.skipBid(3);
    expect(result.success).toBe(true);
    expect(result.redeal).toBe(true);
  });

  test('highest bidder wins the auction', () => {
    round.placeBid(1, 5);
    round.skipBid(2);
    round.skipBid(3);
    // Dealer gets to bid since at least one non-dealer bid
    const result = round.placeBid(0, 7);
    expect(result.success).toBe(true);
    expect(result.bidWon).toBe(true);
    expect(round.highestBidder).toBe(0);
    expect(round.contractBid).toBe(7);
    expect(round.phase).toBe(PHASE.SETTING_TRUMP);
  });

  test('cannot bid out of turn', () => {
    const result = round.placeBid(2, 5); // Seat 2 is not first
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not your turn');
  });

  test('bid below minimum is rejected', () => {
    const result = round.placeBid(1, 3);
    expect(result.success).toBe(false);
  });

  test('bid above maximum is rejected', () => {
    const result = round.placeBid(1, 11);
    expect(result.success).toBe(false);
  });
});

describe('GameRound - Setting Trump', () => {
  let round;

  beforeEach(() => {
    round = new GameRound(1, 0);
    round.deal();
    round.placeBid(1, 6);
    round.skipBid(2);
    round.skipBid(3);
    round.skipBid(0);
    // Seat 1 is highest bidder with 6
  });

  test('bidder can set trump', () => {
    const result = round.setTrump(1, SUITS.HEARTS, HIERARCHY.BIG);
    expect(result.success).toBe(true);
    expect(round.phase).toBe(PHASE.PLAYING);
    expect(round.trump.suit).toBe(SUITS.HEARTS);
    expect(round.trump.hierarchy).toBe(HIERARCHY.BIG);
    expect(round.trump.revealed).toBe(false);
  });

  test('non-bidder cannot set trump', () => {
    const result = round.setTrump(2, SUITS.HEARTS, HIERARCHY.BIG);
    expect(result.success).toBe(false);
  });

  test('invalid suit is rejected', () => {
    const result = round.setTrump(1, 'STARS', HIERARCHY.BIG);
    expect(result.success).toBe(false);
  });

  test('invalid hierarchy is rejected', () => {
    const result = round.setTrump(1, SUITS.HEARTS, 'MEGA');
    expect(result.success).toBe(false);
  });
});

describe('GameRound - Playing Cards', () => {
  let round;

  /**
   * Helper to set up a round ready for play with controlled hands.
   */
  function setupPlayableRound(hands, trumpSuit = SUITS.HEARTS, hierarchy = HIERARCHY.BIG) {
    round = new GameRound(1, 0);
    round.phase = PHASE.BIDDING;

    // Force bidding to complete
    round.highestBidder = 1;
    round.contractBid = 6;

    // Force hands
    round.hands = hands;

    // Set trump
    round.phase = PHASE.SETTING_TRUMP;
    round.setTrump(1, trumpSuit, hierarchy);
  }

  test('player can play a card from their hand', () => {
    const hands = [
      [new Card(SUITS.DIAMONDS, 'A')],
      [new Card(SUITS.DIAMONDS, 'K')],
      [new Card(SUITS.DIAMONDS, 'Q')],
      [new Card(SUITS.DIAMONDS, 'J')],
    ];
    setupPlayableRound(hands);

    // Seat 1 leads (highest bidder)
    const result = round.playCard(1, 'DIAMONDS_K');
    expect(result.success).toBe(true);
    expect(round.leadSuit).toBe(SUITS.DIAMONDS);
  });

  test('cannot play a card not in hand', () => {
    const hands = [
      [new Card(SUITS.DIAMONDS, 'A')],
      [new Card(SUITS.DIAMONDS, 'K')],
      [new Card(SUITS.DIAMONDS, 'Q')],
      [new Card(SUITS.DIAMONDS, 'J')],
    ];
    setupPlayableRound(hands);
    const result = round.playCard(1, 'HEARTS_A');
    expect(result.success).toBe(false);
  });

  test('sanitized state hides trump from non-bidder', () => {
    const hands = Array(4).fill(null).map(() =>
      [new Card(SUITS.DIAMONDS, 'A'), new Card(SUITS.CLUBS, '7')]
    );
    setupPlayableRound(hands);

    const state = round.getStateForPlayer(0); // Not the bidder
    expect(state.trump.suit).toBeNull();
    expect(state.trump.revealed).toBe(false);
  });

  test('sanitized state shows trump to bidder', () => {
    const hands = Array(4).fill(null).map(() =>
      [new Card(SUITS.DIAMONDS, 'A'), new Card(SUITS.CLUBS, '7')]
    );
    setupPlayableRound(hands);

    const state = round.getStateForPlayer(1); // The bidder
    expect(state.trump.suit).toBe(SUITS.HEARTS);
    expect(state.trump.revealedToBidder).toBe(true);
  });

  test('sanitized state hides other players hands', () => {
    const hands = Array(4).fill(null).map(() =>
      [new Card(SUITS.DIAMONDS, 'A')]
    );
    setupPlayableRound(hands);

    const state = round.getStateForPlayer(0);
    expect(state.hand.length).toBe(1);
    expect(state.otherPlayers[1].cardsRemaining).toBe(1);
    expect(state.otherPlayers[1].cards).toBeUndefined(); // No actual cards exposed
  });
});

describe('GameRound - Unveil Colour', () => {
  test('unveil reveals trump suit and hierarchy', () => {
    const round = new GameRound(1, 0);
    round.phase = PHASE.PLAYING;
    round.highestBidder = 1;
    round.trump = { suit: SUITS.HEARTS, hierarchy: HIERARCHY.SMALL_COLOUR, revealed: false };
    round.currentTrick = 1;
    round.leadSeat = 0;
    round.leadSuit = SUITS.DIAMONDS;
    round.cardsOnTable = [{ seat: 0, card: new Card(SUITS.DIAMONDS, 'A') }];
    round.trickPlayOrder = [0, 1, 2, 3];

    // Seat 1 is void in diamonds
    round.hands = [
      [],
      [new Card(SUITS.CLUBS, '7'), new Card(SUITS.HEARTS, 'K')], // No diamonds
      [new Card(SUITS.DIAMONDS, 'Q')],
      [new Card(SUITS.DIAMONDS, 'J')],
    ];

    const result = round.unveilColour(1);
    expect(result.success).toBe(true);
    expect(result.trumpSuit).toBe(SUITS.HEARTS);
    expect(result.hierarchy).toBe(HIERARCHY.SMALL_COLOUR);
    expect(round.trump.revealed).toBe(true);
  });

  test('cannot unveil if holding lead suit', () => {
    const round = new GameRound(1, 0);
    round.phase = PHASE.PLAYING;
    round.highestBidder = 1;
    round.trump = { suit: SUITS.HEARTS, hierarchy: HIERARCHY.BIG, revealed: false };
    round.currentTrick = 1;
    round.leadSeat = 0;
    round.leadSuit = SUITS.DIAMONDS;
    round.cardsOnTable = [{ seat: 0, card: new Card(SUITS.DIAMONDS, 'A') }];
    round.trickPlayOrder = [0, 1, 2, 3];

    // Seat 1 HAS diamonds
    round.hands = [
      [],
      [new Card(SUITS.DIAMONDS, '7')],
      [],
      [],
    ];

    const result = round.unveilColour(1);
    expect(result.success).toBe(false);
  });

  test('cannot unveil if already revealed', () => {
    const round = new GameRound(1, 0);
    round.phase = PHASE.PLAYING;
    round.trump = { suit: SUITS.HEARTS, hierarchy: HIERARCHY.BIG, revealed: true };
    round.currentTrick = 1;
    round.leadSeat = 0;
    round.leadSuit = SUITS.DIAMONDS;
    round.cardsOnTable = [{ seat: 0, card: new Card(SUITS.DIAMONDS, 'A') }];
    round.trickPlayOrder = [0, 1, 2, 3];
    round.hands = [[], [new Card(SUITS.CLUBS, '7')], [], []];

    const result = round.unveilColour(1);
    expect(result.success).toBe(false);
  });
});

describe('GameRound - Dealer Rotation', () => {
  test('dealer 0: bid order is 1, 2, 3, 0', () => {
    const round = new GameRound(1, 0);
    expect(round.getBidOrder()).toEqual([1, 2, 3, 0]);
  });

  test('dealer 1: bid order is 2, 3, 0, 1', () => {
    const round = new GameRound(2, 1);
    expect(round.getBidOrder()).toEqual([2, 3, 0, 1]);
  });

  test('dealer 2: bid order is 3, 0, 1, 2', () => {
    const round = new GameRound(3, 2);
    expect(round.getBidOrder()).toEqual([3, 0, 1, 2]);
  });

  test('dealer 3: bid order is 0, 1, 2, 3', () => {
    const round = new GameRound(4, 3);
    expect(round.getBidOrder()).toEqual([0, 1, 2, 3]);
  });
});
