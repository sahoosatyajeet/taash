/**
 * TrickResolver
 * Determines the winner of a trick based on:
 * - Lead suit
 * - Trump state (suit, hierarchy, revealed or not)
 * - Joker timing rules (supreme on tricks 2–9, penalty on 1 & 10)
 * - The three hierarchy modes (Big, Small/Whole, Small/Colour)
 */

const { SUITS, HIERARCHY, BIG_POWER, SMALL_POWER, CONFIG, JOKER_ID } = require('../utils/constants');

class TrickResolver {
  /**
   * Resolve which seat wins a trick.
   *
   * @param {Array<{seat: number, card: Card}>} plays - Exactly 4 plays in order
   * @param {string} leadSuit - The suit of the first card played
   * @param {Object} trump - { suit, hierarchy, revealed }
   * @param {number} trickNumber - Current trick number (1–10)
   * @returns {{ winnerSeat: number, winnerCard: Card }}
   */
  static resolve(plays, leadSuit, trump, trickNumber) {
    if (plays.length !== 4) {
      throw new Error(`Trick must have exactly 4 plays, got ${plays.length}`);
    }

    // Step 1: Check for Joker — may be supreme or may revert to 5♠
    const jokerPlay = plays.find(p => p.card.isJoker);
    const jokerIsSupreme = jokerPlay && TrickResolver.isJokerSupreme(trickNumber);

    // If Joker is supreme (tricks 2–9), it wins unconditionally
    if (jokerPlay && jokerIsSupreme) {
      return { winnerSeat: jokerPlay.seat, winnerCard: jokerPlay.card };
    }

    // Step 2: Evaluate each card's effective power
    const evaluatedPlays = plays.map(play => {
      const effectiveCard = TrickResolver.getEffectiveCard(play.card, trickNumber);
      const category = TrickResolver.getCardCategory(effectiveCard, leadSuit, trump);
      const power = TrickResolver.getCardPower(effectiveCard, trump, category);

      return {
        seat: play.seat,
        card: play.card,
        effectiveCard,
        category, // 'trump', 'lead', 'discard'
        power,
      };
    });

    // Step 3: Determine winner by category priority: trump > lead > discard
    // Among same category, highest power wins
    return TrickResolver.pickWinner(evaluatedPlays);
  }

  /**
   * Is the Joker in supreme mode for this trick number?
   */
  static isJokerSupreme(trickNumber) {
    return trickNumber >= CONFIG.JOKER_POWER_TRICKS.min &&
           trickNumber <= CONFIG.JOKER_POWER_TRICKS.max;
  }

  /**
   * Get the effective card — Joker on penalty tricks becomes 5♠.
   */
  static getEffectiveCard(card, trickNumber) {
    if (card.isJoker && !TrickResolver.isJokerSupreme(trickNumber)) {
      // Joker reverts to 5 of Spades on tricks 1 and 10
      const Card = require('./Card');
      return Card.createFiveOfSpades();
    }
    return card;
  }

  /**
   * Classify a card as 'trump', 'lead', or 'discard'.
   */
  static getCardCategory(card, leadSuit, trump) {
    // A card is trump ONLY if the colour has been revealed
    if (trump.revealed && card.suit === trump.suit) {
      return 'trump';
    }
    if (card.suit === leadSuit) {
      return 'lead';
    }
    return 'discard';
  }

  /**
   * Get the numeric power of a card based on hierarchy rules.
   *
   * Hierarchy logic:
   * - BIG: All suits use BIG_POWER (A highest)
   * - SMALL_WHOLE: All suits use SMALL_POWER (5 highest)
   * - SMALL_COLOUR: Big by default. If trump is revealed, trump suit uses SMALL_POWER.
   *   All other suits stay BIG_POWER.
   */
  static getCardPower(card, trump, category) {
    const hierarchy = trump.hierarchy;

    switch (hierarchy) {
      case HIERARCHY.BIG:
        return BIG_POWER[card.rank];

      case HIERARCHY.SMALL_WHOLE:
        return SMALL_POWER[card.rank];

      case HIERARCHY.SMALL_COLOUR:
        // Trump suit uses Small power ONLY after unveil
        if (trump.revealed && card.suit === trump.suit) {
          return SMALL_POWER[card.rank];
        }
        // Everything else uses Big
        return BIG_POWER[card.rank];

      default:
        throw new Error(`Unknown hierarchy: ${hierarchy}`);
    }
  }

  /**
   * From evaluated plays, pick the winner.
   * Priority: trump cards beat lead-suit cards beat discards.
   * Within the same category, highest power wins.
   */
  static pickWinner(evaluatedPlays) {
    // Separate by category
    const trumpPlays = evaluatedPlays.filter(p => p.category === 'trump');
    const leadPlays = evaluatedPlays.filter(p => p.category === 'lead');

    let candidates;

    if (trumpPlays.length > 0) {
      candidates = trumpPlays;
    } else if (leadPlays.length > 0) {
      candidates = leadPlays;
    } else {
      // All discards — first player wins (lead player, should always be in leadPlays though)
      // This shouldn't normally happen since the lead card is always in lead category
      candidates = evaluatedPlays;
    }

    // Highest power wins; if tie, the one who played first wins (earlier in array)
    candidates.sort((a, b) => b.power - a.power);
    return {
      winnerSeat: candidates[0].seat,
      winnerCard: candidates[0].card,
    };
  }

  /**
   * Determine which cards in a player's hand are legal to play.
   *
   * Rules:
   * - If this is the lead play (no cards on table yet), any card is legal.
   * - If the player has cards of the lead suit, they must play one (unless Joker).
   * - The Joker is ALWAYS legal (breaks suit rule).
   * - Player is never forced to play a higher card.
   * - Player is never forced to play trump or unveil.
   *
   * @param {Card[]} hand - Player's current hand
   * @param {string|null} leadSuit - The lead suit (null if this player leads)
   * @returns {Card[]} Array of legal cards to play
   */
  static getLegalCards(hand, leadSuit) {
    // Leading the trick — any card is legal
    if (!leadSuit) {
      return [...hand];
    }

    // Check if player has any cards of the lead suit
    const hasLeadSuit = hand.some(c => !c.isJoker && c.suit === leadSuit);

    if (hasLeadSuit) {
      // Must follow suit, but Joker is always an option
      return hand.filter(c => c.isJoker || c.suit === leadSuit);
    }

    // Void in lead suit — can play anything
    return [...hand];
  }

  /**
   * Check if a player is eligible to unveil the colour.
   * Requirements:
   * - Colour is not already revealed
   * - Player is void in the lead suit (cannot follow suit)
   * - Player does NOT need to hold trump cards to unveil
   *
   * @param {Card[]} hand - Player's hand
   * @param {string} leadSuit - The current lead suit
   * @param {boolean} colourRevealed - Whether trump is already unveiled
   * @returns {boolean}
   */
  static canUnveilColour(hand, leadSuit, colourRevealed) {
    if (colourRevealed) return false;
    // Player must be void in lead suit (Joker doesn't count as lead suit)
    const hasLeadSuit = hand.some(c => !c.isJoker && c.suit === leadSuit);
    return !hasLeadSuit;
  }
}

module.exports = TrickResolver;
