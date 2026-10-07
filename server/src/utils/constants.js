/**
 * Taash Game Constants
 * All suit, rank, hierarchy, and game configuration values.
 */

// ─── Suits ───────────────────────────────────────────────
const SUITS = {
  SPADES: 'SPADES',
  HEARTS: 'HEARTS',
  DIAMONDS: 'DIAMONDS',
  CLUBS: 'CLUBS',
};

const SUIT_SYMBOLS = {
  [SUITS.SPADES]: '♠',
  [SUITS.HEARTS]: '♥',
  [SUITS.DIAMONDS]: '♦',
  [SUITS.CLUBS]: '♣',
};

// ─── Ranks ───────────────────────────────────────────────
const RANKS = ['5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ─── Hierarchy Modes ─────────────────────────────────────
const HIERARCHY = {
  BIG: 'BIG',               // A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5
  SMALL_WHOLE: 'SMALL_WHOLE', // 5 > 6 > 7 > 8 > 9 > 10 > J > Q > K > A (entire deck reversed)
  SMALL_COLOUR: 'SMALL_COLOUR', // Big by default, but trump suit flips to Small on unveil
};

// Power maps: higher number = more powerful
const BIG_POWER = {
  '5': 0, '6': 1, '7': 2, '8': 3, '9': 4,
  '10': 5, 'J': 6, 'Q': 7, 'K': 8, 'A': 9,
};

const SMALL_POWER = {
  'A': 0, 'K': 1, 'Q': 2, 'J': 3, '10': 4,
  '9': 5, '8': 6, '7': 7, '6': 8, '5': 9,
};

// ─── Game Phases ─────────────────────────────────────────
const PHASE = {
  WAITING: 'WAITING',
  DEALING: 'DEALING',
  BIDDING: 'BIDDING',
  SETTING_TRUMP: 'SETTING_TRUMP',
  PLAYING: 'PLAYING',
  SCORING: 'SCORING',
  MATCH_OVER: 'MATCH_OVER',
};

// ─── Seating & Teams ─────────────────────────────────────
const SEATS = {
  NORTH: 0,
  EAST: 1,
  SOUTH: 2,
  WEST: 3,
};

// Partners sit across: North+South vs East+West
const TEAMS = {
  A: { seats: [SEATS.NORTH, SEATS.SOUTH], name: 'Team A' },
  B: { seats: [SEATS.EAST, SEATS.WEST], name: 'Team B' },
};

/**
 * Get the team key ('A' or 'B') for a given seat index.
 */
function getTeamForSeat(seatIndex) {
  if (TEAMS.A.seats.includes(seatIndex)) return 'A';
  if (TEAMS.B.seats.includes(seatIndex)) return 'B';
  throw new Error(`Invalid seat index: ${seatIndex}`);
}

/**
 * Get the partner's seat index.
 */
function getPartnerSeat(seatIndex) {
  const team = getTeamForSeat(seatIndex);
  const seats = TEAMS[team].seats;
  return seats.find(s => s !== seatIndex);
}

// ─── Game Config ─────────────────────────────────────────
const CONFIG = {
  TOTAL_ROUNDS: 5,
  TRICKS_PER_ROUND: 10,
  CARDS_PER_PLAYER: 10,
  TOTAL_PLAYERS: 4,
  MIN_BID: 5,
  MAX_BID: 10,
  JOKER_POWER_TRICKS: { min: 2, max: 9 }, // Tricks 2–9: Joker is supreme
  JOKER_PENALTY_TRICKS: [1, 10],            // Tricks 1 & 10: Joker becomes 5♠
};

// ─── Special Cards ───────────────────────────────────────
const JOKER_ID = 'JOKER';
const FIVE_OF_SPADES_ID = 'SPADES_5'; // The card the Joker replaces / reverts to

module.exports = {
  SUITS,
  SUIT_SYMBOLS,
  RANKS,
  HIERARCHY,
  BIG_POWER,
  SMALL_POWER,
  PHASE,
  SEATS,
  TEAMS,
  getTeamForSeat,
  getPartnerSeat,
  CONFIG,
  JOKER_ID,
  FIVE_OF_SPADES_ID,
};
