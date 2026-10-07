/**
 * BotAI
 * Heuristic bot decision logic for Taash:
 * - Hand strength estimation
 * - Strategic bidding (5–10) or skipping
 * - Trump suit & hierarchy selection
 * - Legal card selection honoring partner & Joker timing rules
 * - Unveil decision making
 */

const { SUITS, HIERARCHY } = require('../utils/constants');
const TrickResolver = require('./TrickResolver');

class BotAI {
  /**
   * Evaluate hand power (approximate trick expectation).
   */
  static evaluateHand(hand) {
    let power = 0;
    const suitCounts = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };

    for (const card of hand) {
      if (card.isJoker) {
        power += 2.0; // Joker is guaranteed trick on 2–9
      } else {
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
        if (card.rank === 'A') power += 1.3;
        else if (card.rank === 'K') power += 0.9;
        else if (card.rank === 'Q') power += 0.5;
        else if (card.rank === 'J') power += 0.2;
      }
    }

    // Long suit bonus
    const longestSuitCount = Math.max(...Object.values(suitCounts));
    if (longestSuitCount >= 4) power += 1.0;
    if (longestSuitCount >= 5) power += 1.5;

    return { estimatedTricks: Math.round(power), suitCounts };
  }

  /**
   * Choose a bid (amount or 'SKIP').
   */
  static chooseBid(hand, currentHighest = 0) {
    const { estimatedTricks } = this.evaluateHand(hand);
    const minViableBid = Math.max(5, currentHighest + 1);

    // If bot has at least 6 estimated tricks, it might bid
    if (estimatedTricks >= minViableBid && minViableBid <= 8) {
      return { action: 'bid', amount: minViableBid };
    }
    return { action: 'skip' };
  }

  /**
   * Choose trump suit and hierarchy.
   */
  static chooseTrump(hand) {
    const { suitCounts } = this.evaluateHand(hand);

    // Longest suit becomes trump
    let bestSuit = 'HEARTS';
    let maxCount = -1;
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestSuit = suit;
      }
    }

    // Check count of small cards (5s, 6s, 7s) in trump suit
    const trumpCards = hand.filter(c => c.suit === bestSuit);
    const smallCards = trumpCards.filter(c => ['5', '6', '7'].includes(c.rank));

    let hierarchy = HIERARCHY.BIG;
    if (smallCards.length >= 3) {
      hierarchy = HIERARCHY.SMALL_COLOUR;
    }

    return { suit: bestSuit, hierarchy };
  }

  /**
   * Decide whether to unveil colour if void in lead suit.
   */
  static shouldUnveil(hand, leadSuit, trump) {
    if (trump.revealed) return false;
    // If bot holds cards in the potential trump suit or wants to cut
    return true; // Bots unveil when void to unlock trump power
  }

  /**
   * Choose which card to play from hand.
   */
  static chooseCard(hand, leadSuit, trump, trickNumber, cardsOnTable, mySeat) {
    const legalCards = TrickResolver.getLegalCards(hand, leadSuit);
    if (legalCards.length === 1) return legalCards[0];

    // Trick 1 or 10: avoid playing Joker if possible (penalty reverts to 5♠)
    // unless Spades is trump and hierarchy is Small
    const isPenaltyTrick = trickNumber === 1 || trickNumber === 10;
    const isSpadesSmallExploit =
      trump.revealed &&
      trump.suit === 'SPADES' &&
      (trump.hierarchy === HIERARCHY.SMALL_WHOLE || trump.hierarchy === HIERARCHY.SMALL_COLOUR);

    if (isPenaltyTrick && !isSpadesSmallExploit) {
      const nonJokerLegals = legalCards.filter(c => !c.isJoker);
      if (nonJokerLegals.length > 0) {
        return nonJokerLegals[0];
      }
    }

    // Tricks 2–9: If Joker is available and opponent is currently winning, play Joker!
    if (trickNumber >= 2 && trickNumber <= 9) {
      const jokerCard = legalCards.find(c => c.isJoker);
      if (jokerCard && cardsOnTable.length >= 2) {
        return jokerCard;
      }
    }

    // If leading the trick: lead an Ace or highest card
    if (!leadSuit || cardsOnTable.length === 0) {
      const aces = legalCards.filter(c => c.rank === 'A');
      if (aces.length > 0) return aces[0];
      return legalCards[0];
    }

    // Default: play lowest legal card to preserve high cards
    return legalCards[legalCards.length - 1] || legalCards[0];
  }
}

module.exports = BotAI;
