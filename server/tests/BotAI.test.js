/**
 * Tests for BotAI
 */

const BotAI = require('../src/game/BotAI');
const Card = require('../src/game/Card');
const { SUITS, HIERARCHY } = require('../src/utils/constants');

describe('BotAI', () => {
  test('evaluates hand strength', () => {
    const hand = [
      new Card(SUITS.HEARTS, 'A'),
      new Card(SUITS.HEARTS, 'K'),
      Card.createJoker(),
      new Card(SUITS.SPADES, '5'),
    ];
    const { estimatedTricks } = BotAI.evaluateHand(hand);
    expect(estimatedTricks).toBeGreaterThanOrEqual(4);
  });

  test('chooses trump based on longest suit', () => {
    const hand = [
      new Card(SUITS.DIAMONDS, 'A'),
      new Card(SUITS.DIAMONDS, 'K'),
      new Card(SUITS.DIAMONDS, 'Q'),
      new Card(SUITS.DIAMONDS, 'J'),
      new Card(SUITS.HEARTS, '5'),
    ];
    const { suit } = BotAI.chooseTrump(hand);
    expect(suit).toBe(SUITS.DIAMONDS);
  });

  test('avoids playing Joker on trick 1 penalty if non-Joker legal cards exist', () => {
    const hand = [
      new Card(SUITS.SPADES, 'A'),
      Card.createJoker(),
    ];
    const trump = { suit: SUITS.HEARTS, hierarchy: HIERARCHY.BIG, revealed: true };
    // Leading on Trick 1
    const chosen = BotAI.chooseCard(hand, null, trump, 1, [], 0);
    expect(chosen.isJoker).toBe(false);
    expect(chosen.rank).toBe('A');
  });

  test('plays Joker on tricks 2–9 to win against high cards', () => {
    const hand = [
      new Card(SUITS.DIAMONDS, '5'),
      Card.createJoker(),
    ];
    const trump = { suit: SUITS.HEARTS, hierarchy: HIERARCHY.BIG, revealed: true };
    const tableCards = [
      { seat: 0, card: new Card(SUITS.HEARTS, 'A') },
      { seat: 1, card: new Card(SUITS.HEARTS, 'K') },
    ];
    // Trick 4, void in lead suit, can play Joker
    const chosen = BotAI.chooseCard(hand, SUITS.HEARTS, trump, 4, tableCards, 2);
    expect(chosen.isJoker).toBe(true);
  });
});
