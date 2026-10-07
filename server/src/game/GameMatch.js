/**
 * GameMatch
 * Orchestrates a full 5-round match of Taash.
 * Manages dealer rotation, round lifecycle, and aggregate scoring.
 */

const GameRound = require('./GameRound');
const { CONFIG, PHASE, getTeamForSeat } = require('../utils/constants');

class GameMatch {
  /**
   * @param {number} startingDealer - Seat index (0–3) of the first dealer
   */
  constructor(startingDealer = 0) {
    this.startingDealer = startingDealer;
    this.currentRoundNumber = 0;
    this.currentRound = null;

    // Aggregate scores across all rounds
    this.scores = {
      A: 0, // Team A total
      B: 0, // Team B total
    };

    // History of all completed rounds
    this.roundResults = [];

    // Match state
    this.phase = PHASE.WAITING; // WAITING → active rounds → MATCH_OVER
    this.winner = null;
  }

  /**
   * Get the dealer seat for a given round number.
   * Rotates: starting dealer → +1 → +2 → +3 → back to start.
   */
  getDealerForRound(roundNumber) {
    return (this.startingDealer + (roundNumber - 1)) % 4;
  }

  /**
   * Start the next round.
   * @returns {{ round: GameRound, dealerSeat: number, roundNumber: number }}
   */
  startNextRound() {
    if (this.phase === PHASE.MATCH_OVER) {
      throw new Error('Match is already over');
    }

    this.currentRoundNumber++;

    if (this.currentRoundNumber > CONFIG.TOTAL_ROUNDS) {
      throw new Error('All rounds have been played');
    }

    const dealerSeat = this.getDealerForRound(this.currentRoundNumber);
    this.currentRound = new GameRound(this.currentRoundNumber, dealerSeat);
    this.phase = PHASE.PLAYING;

    return {
      round: this.currentRound,
      dealerSeat,
      roundNumber: this.currentRoundNumber,
    };
  }

  /**
   * Record the result of a completed round and update scores.
   * @param {Object} roundResult - From GameRound._completeRound()
   */
  recordRoundResult(roundResult) {
    this.roundResults.push(roundResult);

    // Scoring logic:
    // If the bidding team met their bid: they score their bid amount
    // If not: they lose that many points
    // The non-bidding team scores the tricks they won
    const bidderTeam = roundResult.bidderTeam;
    const opposingTeam = bidderTeam === 'A' ? 'B' : 'A';

    if (roundResult.bidMet) {
      // Bidder's team scores their contract bid
      this.scores[bidderTeam] += roundResult.contractBid;
    } else {
      // Bidder's team loses the contract bid
      this.scores[bidderTeam] -= roundResult.contractBid;
    }

    // Opposing team scores the tricks they won
    this.scores[opposingTeam] += roundResult.tricksWon[opposingTeam];

    // Check if all rounds are done
    if (this.currentRoundNumber >= CONFIG.TOTAL_ROUNDS) {
      this.phase = PHASE.MATCH_OVER;
      this._determineWinner();
    }
  }

  /**
   * Determine the overall match winner.
   * @private
   */
  _determineWinner() {
    if (this.scores.A > this.scores.B) {
      this.winner = 'A';
    } else if (this.scores.B > this.scores.A) {
      this.winner = 'B';
    } else {
      this.winner = 'TIE';
    }
  }

  /**
   * Handle a redeal (all non-dealers skipped).
   * The same round number is used with the next dealer.
   * @returns {{ round: GameRound, dealerSeat: number, roundNumber: number }}
   */
  handleRedeal() {
    // Move dealer to the next seat
    const currentDealer = this.getDealerForRound(this.currentRoundNumber);
    const newDealer = (currentDealer + 1) % 4;

    // Create a new round with the same number but different dealer
    this.currentRound = new GameRound(this.currentRoundNumber, newDealer);

    return {
      round: this.currentRound,
      dealerSeat: newDealer,
      roundNumber: this.currentRoundNumber,
    };
  }

  /**
   * Get the current match state summary.
   */
  getMatchState() {
    return {
      currentRoundNumber: this.currentRoundNumber,
      totalRounds: CONFIG.TOTAL_ROUNDS,
      scores: { ...this.scores },
      roundResults: this.roundResults.map(r => ({
        roundNumber: r.roundNumber,
        bidderTeam: r.bidderTeam,
        contractBid: r.contractBid,
        tricksWon: { ...r.tricksWon },
        bidMet: r.bidMet,
      })),
      phase: this.phase,
      winner: this.winner,
    };
  }

  /**
   * Is the match over?
   */
  isOver() {
    return this.phase === PHASE.MATCH_OVER;
  }
}

module.exports = GameMatch;
