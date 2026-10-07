/**
 * GameRound
 * State machine for a single round of Taash.
 * Lifecycle: DEALING → BIDDING → SETTING_TRUMP → PLAYING (×10 tricks) → SCORING
 */

const Deck = require('./Deck');
const TrickResolver = require('./TrickResolver');
const {
  PHASE, CONFIG, HIERARCHY, SUITS,
  getTeamForSeat, JOKER_ID,
} = require('../utils/constants');

class GameRound {
  /**
   * @param {number} roundNumber - Which round (1–5)
   * @param {number} dealerSeat - Seat index (0–3) of the dealer
   */
  constructor(roundNumber, dealerSeat) {
    this.roundNumber = roundNumber;
    this.dealerSeat = dealerSeat;
    this.phase = PHASE.DEALING;

    // Bidding state
    this.bids = [null, null, null, null]; // null = hasn't bid yet
    this.bidActions = [];                  // ordered list of { seat, action: 'bid'|'skip', amount? }
    this.highestBidder = null;
    this.contractBid = 0;
    this.currentBidderIndex = 0;          // index into the bid order array

    // Trump state (hidden until unveiled)
    this.trump = {
      suit: null,
      hierarchy: null,
      revealed: false,
    };

    // Hands
    this.hands = [[], [], [], []];

    // Trick state
    this.currentTrick = 0;
    this.leadSeat = null;
    this.leadSuit = null;
    this.cardsOnTable = [];    // { seat, card } for current trick
    this.trickHistory = [];    // completed tricks

    // Scoring
    this.tricksWon = { A: 0, B: 0 };

    // Track who needs to play next in a trick
    this.currentPlayerSeat = null;

    // The order of play within a trick
    this.trickPlayOrder = [];
  }

  // ─── Bidding Order ─────────────────────────────────────

  /**
   * Get the bid order: 3 non-dealer seats go first, then dealer.
   * Sequence is clockwise from the seat after the dealer.
   */
  getBidOrder() {
    const order = [];
    for (let i = 1; i <= 3; i++) {
      order.push((this.dealerSeat + i) % 4);
    }
    // Dealer can bid last (only if at least one non-dealer bid)
    order.push(this.dealerSeat);
    return order;
  }

  // ─── Phase: DEALING ────────────────────────────────────

  /**
   * Deal cards to all 4 players.
   * @returns {{ hands: Card[][] }} - Each player's hand (for server use)
   */
  deal() {
    if (this.phase !== PHASE.DEALING) {
      throw new Error(`Cannot deal in phase: ${this.phase}`);
    }

    const deck = new Deck();
    deck.shuffle();
    this.hands = deck.deal();
    this.phase = PHASE.BIDDING;
    this.currentBidderIndex = 0;

    const bidOrder = this.getBidOrder();
    this.currentPlayerSeat = bidOrder[0];

    return { hands: this.hands };
  }

  // ─── Phase: BIDDING ────────────────────────────────────

  /**
   * Get the seat of the player whose turn it is to bid.
   */
  getCurrentBidderSeat() {
    if (this.phase !== PHASE.BIDDING) return null;
    const bidOrder = this.getBidOrder();
    if (this.currentBidderIndex >= bidOrder.length) return null;
    return bidOrder[this.currentBidderIndex];
  }

  /**
   * Place a bid.
   * @param {number} seat - The seat placing the bid
   * @param {number} amount - Bid amount (5–10)
   * @returns {{ success: boolean, error?: string, bidWon?: boolean, redeal?: boolean }}
   */
  placeBid(seat, amount) {
    if (this.phase !== PHASE.BIDDING) {
      return { success: false, error: 'Not in bidding phase' };
    }
    if (seat !== this.getCurrentBidderSeat()) {
      return { success: false, error: 'Not your turn to bid' };
    }
    if (amount < CONFIG.MIN_BID || amount > CONFIG.MAX_BID) {
      return { success: false, error: `Bid must be between ${CONFIG.MIN_BID} and ${CONFIG.MAX_BID}` };
    }
    if (amount <= this.contractBid) {
      return { success: false, error: `Bid must be higher than current highest (${this.contractBid})` };
    }

    this.bids[seat] = amount;
    this.bidActions.push({ seat, action: 'bid', amount });
    this.highestBidder = seat;
    this.contractBid = amount;

    return this._advanceBidding();
  }

  /**
   * Skip bidding.
   * @param {number} seat - The seat skipping
   * @returns {{ success: boolean, error?: string, bidWon?: boolean, redeal?: boolean }}
   */
  skipBid(seat) {
    if (this.phase !== PHASE.BIDDING) {
      return { success: false, error: 'Not in bidding phase' };
    }
    if (seat !== this.getCurrentBidderSeat()) {
      return { success: false, error: 'Not your turn to bid' };
    }

    this.bids[seat] = 'SKIP';
    this.bidActions.push({ seat, action: 'skip' });

    return this._advanceBidding();
  }

  /**
   * Advance to the next bidder or conclude bidding.
   * @private
   */
  _advanceBidding() {
    const bidOrder = this.getBidOrder();
    const nonDealerSeats = bidOrder.slice(0, 3);

    // Check if all 3 non-dealers have skipped → REDEAL
    const allNonDealersSkipped = nonDealerSeats.every(s => this.bids[s] === 'SKIP');
    if (allNonDealersSkipped) {
      return { success: true, redeal: true };
    }

    this.currentBidderIndex++;

    // Check if we've gone through all possible bidders
    // The dealer only gets to bid if at least one non-dealer has bid
    if (this.currentBidderIndex >= bidOrder.length) {
      // Bidding is over — highest bidder wins
      this.phase = PHASE.SETTING_TRUMP;
      this.currentPlayerSeat = this.highestBidder;
      return { success: true, bidWon: true };
    }

    // If we've reached the dealer slot and all non-dealers skipped except with bids,
    // dealer gets their chance
    const nextSeat = bidOrder[this.currentBidderIndex];

    // If the next bidder is the dealer but no one has actually placed a numeric bid,
    // this shouldn't happen (we check allNonDealersSkipped above), but guard anyway
    this.currentPlayerSeat = nextSeat;

    // Check if everyone who can bid has bid/skipped
    // If all remaining players have been processed
    const allBidsDone = bidOrder.slice(0, this.currentBidderIndex).length >= 4;
    if (allBidsDone || this.currentBidderIndex >= 4) {
      if (this.highestBidder !== null) {
        this.phase = PHASE.SETTING_TRUMP;
        this.currentPlayerSeat = this.highestBidder;
        return { success: true, bidWon: true };
      }
    }

    return { success: true };
  }

  // ─── Phase: SETTING_TRUMP ──────────────────────────────

  /**
   * The highest bidder sets the hidden trump suit and hierarchy.
   * @param {number} seat - Must be the highest bidder
   * @param {string} suit - One of SUITS values
   * @param {string} hierarchy - One of HIERARCHY values
   * @returns {{ success: boolean, error?: string }}
   */
  setTrump(seat, suit, hierarchy) {
    if (this.phase !== PHASE.SETTING_TRUMP) {
      return { success: false, error: 'Not in trump-setting phase' };
    }
    if (seat !== this.highestBidder) {
      return { success: false, error: 'Only the highest bidder can set trump' };
    }
    if (!Object.values(SUITS).includes(suit)) {
      return { success: false, error: `Invalid suit: ${suit}` };
    }
    if (!Object.values(HIERARCHY).includes(hierarchy)) {
      return { success: false, error: `Invalid hierarchy: ${hierarchy}` };
    }

    this.trump.suit = suit;
    this.trump.hierarchy = hierarchy;
    this.trump.revealed = false;

    this.phase = PHASE.PLAYING;
    this.currentTrick = 1;

    // The player after the dealer leads the first trick (highest bidder leads)
    this.leadSeat = this.highestBidder;
    this.currentPlayerSeat = this.leadSeat;
    this._buildTrickPlayOrder();

    return { success: true };
  }

  // ─── Phase: PLAYING ────────────────────────────────────

  /**
   * Build the play order for the current trick.
   * Clockwise from the lead seat.
   */
  _buildTrickPlayOrder() {
    this.trickPlayOrder = [];
    for (let i = 0; i < 4; i++) {
      this.trickPlayOrder.push((this.leadSeat + i) % 4);
    }
    this.cardsOnTable = [];
    this.leadSuit = null;
  }

  /**
   * Get the seat of the player whose turn it is right now.
   * Works across all phases (Bidding -> Trump Setting -> Trick Playing).
   */
  getCurrentPlayerSeat() {
    if (this.phase === PHASE.BIDDING) {
      return this.getCurrentBidderSeat();
    }
    if (this.phase === PHASE.SETTING_TRUMP) {
      return this.highestBidder;
    }
    if (this.phase !== PHASE.PLAYING) return null;
    if (this.cardsOnTable.length >= 4) return null;
    return this.trickPlayOrder[this.cardsOnTable.length];
  }

  /**
   * Attempt to unveil the colour.
   * @param {number} seat - The seat requesting the unveil
   * @returns {{ success: boolean, error?: string, trumpSuit?: string, hierarchy?: string }}
   */
  unveilColour(seat) {
    if (this.phase !== PHASE.PLAYING) {
      return { success: false, error: 'Not in playing phase' };
    }
    if (this.trump.revealed) {
      return { success: false, error: 'Colour already revealed' };
    }
    if (seat !== this.getCurrentPlayerSeat()) {
      return { success: false, error: 'Not your turn' };
    }

    // Must be void in lead suit to unveil
    if (this.cardsOnTable.length === 0) {
      return { success: false, error: 'Cannot unveil when leading a trick' };
    }

    const hand = this.hands[seat];
    const canUnveil = TrickResolver.canUnveilColour(hand, this.leadSuit, this.trump.revealed);

    if (!canUnveil) {
      return { success: false, error: 'You still have cards of the lead suit' };
    }

    // Reveal the colour!
    this.trump.revealed = true;

    return {
      success: true,
      trumpSuit: this.trump.suit,
      hierarchy: this.trump.hierarchy,
    };
  }

  /**
   * Play a card.
   * @param {number} seat - The seat playing
   * @param {string} cardId - The card ID to play (e.g., "HEARTS_A" or "JOKER")
   * @returns {{ success: boolean, error?: string, trickComplete?: boolean, trickResult?: Object, roundComplete?: boolean }}
   */
  playCard(seat, cardId) {
    if (this.phase !== PHASE.PLAYING) {
      return { success: false, error: 'Not in playing phase' };
    }
    if (seat !== this.getCurrentPlayerSeat()) {
      return { success: false, error: 'Not your turn' };
    }

    const hand = this.hands[seat];
    const cardIndex = hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      return { success: false, error: 'Card not in your hand' };
    }

    const card = hand[cardIndex];

    // Validate the play is legal
    const legalCards = TrickResolver.getLegalCards(hand, this.leadSuit);
    if (!legalCards.some(c => c.id === cardId)) {
      return { success: false, error: 'Illegal play — you must follow suit' };
    }

    // Remove card from hand
    hand.splice(cardIndex, 1);

    // If this is the first card of the trick, set the lead suit
    if (this.cardsOnTable.length === 0) {
      // Joker when leading: the lead suit is not set by the Joker itself
      // The next non-Joker card determines lead suit? No — per rules, 
      // the Joker ignores suit rules. If Joker leads, there is no lead suit constraint.
      if (card.isJoker) {
        this.leadSuit = null; // No suit to follow
      } else {
        this.leadSuit = card.suit;
      }
    }

    // Add card to table
    this.cardsOnTable.push({ seat, card });

    // Check if trick is complete (4 cards played)
    if (this.cardsOnTable.length === 4) {
      return this._resolveTrick();
    }

    // Update current player
    this.currentPlayerSeat = this.getCurrentPlayerSeat();

    return { success: true };
  }

  /**
   * Resolve a completed trick.
   * @private
   */
  _resolveTrick() {
    const result = TrickResolver.resolve(
      this.cardsOnTable,
      this.leadSuit,
      this.trump,
      this.currentTrick
    );

    // Award trick to the winning team
    const winnerTeam = getTeamForSeat(result.winnerSeat);
    this.tricksWon[winnerTeam]++;

    // Save trick history
    this.trickHistory.push({
      trickNumber: this.currentTrick,
      plays: [...this.cardsOnTable],
      winner: result.winnerSeat,
      winnerTeam,
      leadSuit: this.leadSuit,
    });

    // Check if round is complete
    if (this.currentTrick >= CONFIG.TRICKS_PER_ROUND) {
      return this._completeRound(result);
    }

    // Next trick: winner leads
    this.currentTrick++;
    this.leadSeat = result.winnerSeat;
    this.currentPlayerSeat = this.leadSeat;
    this._buildTrickPlayOrder();

    return {
      success: true,
      trickComplete: true,
      trickResult: {
        winnerSeat: result.winnerSeat,
        winnerTeam,
        trickNumber: this.currentTrick - 1,
        tricksWon: { ...this.tricksWon },
      },
    };
  }

  /**
   * Complete the round and calculate scores.
   * @private
   */
  _completeRound(lastTrickResult) {
    this.phase = PHASE.SCORING;

    const bidderTeam = getTeamForSeat(this.highestBidder);
    const bidMet = this.tricksWon[bidderTeam] >= this.contractBid;

    const roundResult = {
      roundNumber: this.roundNumber,
      dealerSeat: this.dealerSeat,
      highestBidder: this.highestBidder,
      contractBid: this.contractBid,
      bidderTeam,
      tricksWon: { ...this.tricksWon },
      bidMet,
      trump: { ...this.trump },
      lastTrickWinner: lastTrickResult.winnerSeat,
    };

    return {
      success: true,
      trickComplete: true,
      roundComplete: true,
      trickResult: {
        winnerSeat: lastTrickResult.winnerSeat,
        winnerTeam: getTeamForSeat(lastTrickResult.winnerSeat),
        trickNumber: this.currentTrick,
        tricksWon: { ...this.tricksWon },
      },
      roundResult,
    };
  }

  // ─── Query Methods ─────────────────────────────────────

  /**
   * Get the hand for a specific player.
   */
  getHand(seat) {
    return [...this.hands[seat]];
  }

  /**
   * Get legal cards for the current player.
   */
  getLegalCards(seat) {
    if (seat !== this.getCurrentPlayerSeat()) return [];
    return TrickResolver.getLegalCards(this.hands[seat], this.leadSuit);
  }

  /**
   * Get sanitized state for a specific player (hides other hands + hidden trump).
   */
  getStateForPlayer(seat) {
    const state = {
      roundNumber: this.roundNumber,
      dealerSeat: this.dealerSeat,
      phase: this.phase,
      currentTrick: this.currentTrick,
      leadSeat: this.leadSeat,
      leadSuit: this.leadSuit,
      cardsOnTable: this.cardsOnTable.map(p => ({
        seat: p.seat,
        card: p.card.toJSON(),
      })),
      tricksWon: { ...this.tricksWon },
      hand: this.hands[seat].map(c => c.toJSON()),
      currentPlayerSeat: this.getCurrentPlayerSeat(),
      currentBidderSeat: this.getCurrentBidderSeat(),
      isYourTurn: seat === this.getCurrentPlayerSeat(),
      canBid: this.phase === PHASE.BIDDING && seat === this.getCurrentBidderSeat(),
      canSetTrump: this.phase === PHASE.SETTING_TRUMP && seat === this.highestBidder,
      minBid: Math.max(CONFIG.MIN_BID, (this.contractBid || 0) + 1),
      maxBid: CONFIG.MAX_BID,
      highestBidder: this.highestBidder,
      contractBid: this.contractBid,
      bids: [...this.bids],
    };

    // Only show trump info if revealed OR if this player is the bidder
    if (this.trump.revealed) {
      state.trump = { ...this.trump };
    } else if (seat === this.highestBidder && this.trump.suit) {
      state.trump = { ...this.trump, revealedToBidder: true };
    } else {
      state.trump = { suit: null, hierarchy: null, revealed: false };
    }

    // Legal cards for this player's turn
    if (seat === this.getCurrentPlayerSeat() && this.phase === PHASE.PLAYING) {
      state.legalCards = this.getLegalCards(seat).map(c => c.id);
      state.canUnveil = this.cardsOnTable.length > 0 &&
        TrickResolver.canUnveilColour(this.hands[seat], this.leadSuit, this.trump.revealed);
    }

    // Other players' card counts (not their actual cards)
    state.otherPlayers = {};
    for (let i = 0; i < 4; i++) {
      if (i !== seat) {
        state.otherPlayers[i] = { cardsRemaining: this.hands[i].length };
      }
    }

    return state;
  }
}

module.exports = GameRound;
