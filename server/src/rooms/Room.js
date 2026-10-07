/**
 * Room Model
 * Represents a game lobby & match container for 4 players.
 * Manages seating (North, East, South, West), teams, readiness, and GameMatch integration.
 */

const GameMatch = require('../game/GameMatch');
const { SEATS, TEAMS, PHASE, getTeamForSeat } = require('../utils/constants');

class Room {
  /**
   * @param {string} code - Unique 4-6 char room code
   * @param {Object} host - { id, name, socketId }
   */
  constructor(code, host) {
    this.code = code;
    this.hostId = host.id;
    this.createdAt = Date.now();

    // 4 seats: 0 (North), 1 (East), 2 (South), 3 (West)
    // Team A: 0 & 2, Team B: 1 & 3
    this.seats = [null, null, null, null];

    // Players map: id -> { id, name, socketId, seat, isReady, isConnected }
    this.players = new Map();

    // Match orchestrator (created when game starts)
    this.match = null;

    // Turn timer tracker: NodeJS.Timeout
    this.turnTimer = null;
    this.turnStartedAt = 0;
    this.turnExpiresAt = 0;
    this.turnDuration = 25;

    // Disconnect timeout tracker: id -> NodeJS.Timeout
    this.disconnectTimeouts = new Map();

    // Add host to seat 0
    this.addPlayer(host, SEATS.NORTH);
  }

  /**
   * Add a player to the room in an available seat.
   * @param {Object} player - { id, name, socketId }
   * @param {number|null} preferredSeat
   * @returns {{ success: boolean, seat?: number, error?: string }}
   */
  addPlayer(player, preferredSeat = null) {
    if (this.players.has(player.id)) {
      // Reconnection or duplicate join
      const existing = this.players.get(player.id);
      existing.socketId = player.socketId;
      existing.isConnected = true;
      existing.name = player.name || existing.name;

      if (this.disconnectTimeouts.has(player.id)) {
        clearTimeout(this.disconnectTimeouts.get(player.id));
        this.disconnectTimeouts.delete(player.id);
      }
      return { success: true, seat: existing.seat, reconnected: true };
    }

    if (this.players.size >= 4) {
      return { success: false, error: 'Room is full (max 4 players)' };
    }

    // Find seat
    let targetSeat = preferredSeat;
    if (targetSeat === null || this.seats[targetSeat] !== null) {
      targetSeat = this.seats.findIndex(s => s === null);
    }

    if (targetSeat === -1 || targetSeat > 3) {
      return { success: false, error: 'No available seats' };
    }

    const playerObj = {
      id: player.id,
      name: player.name,
      socketId: player.socketId,
      seat: targetSeat,
      team: getTeamForSeat(targetSeat),
      isReady: player.id === this.hostId, // Host default ready
      isConnected: true,
    };

    this.seats[targetSeat] = playerObj;
    this.players.set(player.id, playerObj);

    return { success: true, seat: targetSeat };
  }

  /**
   * Change player seat in lobby.
   */
  switchSeat(playerId, targetSeat) {
    if (this.match) {
      return { success: false, error: 'Cannot switch seats during an active game' };
    }
    if (targetSeat < 0 || targetSeat > 3) {
      return { success: false, error: 'Invalid seat' };
    }
    if (this.seats[targetSeat] !== null) {
      return { success: false, error: 'Seat already taken' };
    }

    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, error: 'Player not found in room' };
    }

    this.seats[player.seat] = null;
    player.seat = targetSeat;
    player.team = getTeamForSeat(targetSeat);
    this.seats[targetSeat] = player;

    return { success: true, newSeat: targetSeat };
  }

  /**
   * Set ready state.
   */
  setReady(playerId, isReady) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };
    player.isReady = Boolean(isReady);
    return { success: true, isReady: player.isReady };
  }

  /**
   * Mark player disconnected with 60-second grace period.
   */
  handleDisconnect(socketId) {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) {
        player.isConnected = false;

        // Grace period before removing or forfeiting
        const timeout = setTimeout(() => {
          this.removePlayer(player.id);
        }, 60000);
        this.disconnectTimeouts.set(player.id, timeout);

        return { player, roomEmpty: this.players.size === 0 };
      }
    }
    return null;
  }

  /**
   * Remove player completely from room.
   */
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;

    if (this.disconnectTimeouts.has(playerId)) {
      clearTimeout(this.disconnectTimeouts.get(playerId));
      this.disconnectTimeouts.delete(playerId);
    }

    this.seats[player.seat] = null;
    this.players.delete(playerId);

    // If host left, elect new host
    if (this.hostId === playerId && this.players.size > 0) {
      this.hostId = Array.from(this.players.values())[0].id;
    }

    return true;
  }

  /**
   * Check if game can start.
   */
  canStart() {
    if (this.players.size !== 4) return false;
    for (const seat of this.seats) {
      if (!seat || !seat.isReady) return false;
    }
    return true;
  }

  /**
   * Start the match (starts Round 1).
   */
  startMatch() {
    if (!this.canStart()) {
      return { success: false, error: 'All 4 players must be seated and ready' };
    }

    // Dealer rotates 0 -> 1 -> 2 -> 3 sequentially
    this.match = new GameMatch(SEATS.NORTH);
    const { round, dealerSeat, roundNumber } = this.match.startNextRound();
    round.deal();

    return {
      success: true,
      roundNumber,
      dealerSeat,
    };
  }

  /**
   * Lobby state summary for UI.
   */
  getLobbyState() {
    return {
      roomCode: this.code,
      hostId: this.hostId,
      playerCount: this.players.size,
      canStart: this.canStart(),
      gameStarted: Boolean(this.match),
      seats: this.seats.map((p, idx) => {
        if (!p) return { seat: idx, team: getTeamForSeat(idx), player: null };
        return {
          seat: idx,
          team: p.team,
          player: {
            id: p.id,
            name: p.name,
            isReady: p.isReady,
            isConnected: p.isConnected,
            isHost: p.id === this.hostId,
          },
        };
      }),
      teams: {
        A: { name: TEAMS.A.name, seats: TEAMS.A.seats },
        B: { name: TEAMS.B.name, seats: TEAMS.B.seats },
      },
    };
  }

  /**
   * Get private, sanitized game state for a specific seat.
   */
  getSanitizedGameState(seat) {
    if (!this.match || !this.match.currentRound) return null;
    const round = this.match.currentRound;
    const seatedPlayer = this.seats[seat];

    const privateState = round.getStateForPlayer(seat);
    privateState.match = this.match.getMatchState();
    privateState.roomCode = this.code;
    privateState.yourSeat = seat;
    privateState.yourTeam = seatedPlayer ? seatedPlayer.team : getTeamForSeat(seat);
    privateState.players = this.seats.map((s, idx) => ({
      seat: idx,
      name: s ? s.name : `Seat ${idx}`,
      team: getTeamForSeat(idx),
      isConnected: s ? s.isConnected : false,
      isBot: s ? Boolean(s.isBot) : false,
    }));
    privateState.turnDuration = this.turnDuration || 25;
    privateState.turnStartedAt = this.turnStartedAt || 0;
    privateState.turnExpiresAt = this.turnExpiresAt || 0;

    return privateState;
  }

  /**
   * Emit individual sanitized game state to all connected players in this room.
   */
  broadcastSanitizedGameState(io) {
    if (!this.match || !this.match.currentRound) return;

    for (let seat = 0; seat < 4; seat++) {
      const seatedPlayer = this.seats[seat];
      if (seatedPlayer && seatedPlayer.socketId && seatedPlayer.isConnected) {
        const privateState = this.getSanitizedGameState(seat);
        if (privateState) {
          io.to(seatedPlayer.socketId).emit('game_state_update', privateState);
        }
      }
    }
  }

  /**
   * Fill remaining empty seats with AI bots.
   */
  fillWithBots() {
    const BOT_NAMES = ['Bot East', 'Bot South', 'Bot West', 'Bot North'];
    for (let seat = 0; seat < 4; seat++) {
      if (this.seats[seat] === null) {
        const botId = `bot-${seat}`;
        const botPlayer = {
          id: botId,
          name: BOT_NAMES[seat],
          socketId: null,
          seat,
          team: getTeamForSeat(seat),
          isReady: true,
          isConnected: true,
          isBot: true,
        };
        this.seats[seat] = botPlayer;
        this.players.set(botId, botPlayer);
      }
    }
    return { success: true };
  }

  /**
   * Check if current turn belongs to an AI bot and automate their move.
   */
  triggerBotTurnIfNeeded(io) {
    if (!this.match || !this.match.currentRound) return;
    const round = this.match.currentRound;
    const BotAI = require('../game/BotAI');

    // ─── 1. Bidding Phase ───
    if (round.phase === PHASE.BIDDING) {
      const bidderSeat = round.getCurrentBidderSeat();
      if (bidderSeat !== null) {
        const player = this.seats[bidderSeat];
        if (player && player.isBot) {
          setTimeout(() => {
            if (round.phase !== PHASE.BIDDING || round.getCurrentBidderSeat() !== bidderSeat) return;
            const hand = round.hands[bidderSeat];
            const decision = BotAI.chooseBid(hand, round.contractBid);

            let res;
            if (decision.action === 'bid') {
              res = round.placeBid(bidderSeat, decision.amount);
            } else {
              res = round.skipBid(bidderSeat);
            }

            if (res.redeal) {
              const { round: newRound, dealerSeat, roundNumber } = this.match.handleRedeal();
              newRound.deal();
              io.to(this.code).emit('round_redeal', {
                roundNumber,
                dealerSeat,
                reason: 'First 3 players skipped. Cards redealt by next dealer.',
              });
            } else if (res.bidWon) {
              io.to(this.code).emit('bid_won', {
                seat: round.highestBidder,
                amount: round.contractBid,
                playerName: this.seats[round.highestBidder]?.name,
              });
            }

            this.broadcastSanitizedGameState(io);
            this.triggerBotTurnIfNeeded(io);
          }, 450);
        }
      }
    }

    // ─── 2. Setting Trump Phase ───
    else if (round.phase === PHASE.SETTING_TRUMP) {
      const bidderSeat = round.highestBidder;
      const player = this.seats[bidderSeat];
      if (player && player.isBot) {
        setTimeout(() => {
          if (round.phase !== PHASE.SETTING_TRUMP) return;
          const hand = round.hands[bidderSeat];
          const { suit, hierarchy } = BotAI.chooseTrump(hand);
          round.setTrump(bidderSeat, suit, hierarchy);

          io.to(this.code).emit('trump_set', {
            bidderSeat,
            message: `${player.name} has secretly chosen trump & hierarchy!`,
          });

          this.broadcastSanitizedGameState(io);
          this.triggerBotTurnIfNeeded(io);
        }, 500);
      }
    }

    // ─── 3. Playing Phase ───
    else if (round.phase === PHASE.PLAYING) {
      const currentSeat = round.getCurrentPlayerSeat();
      if (currentSeat !== null) {
        const player = this.seats[currentSeat];
        if (player && player.isBot) {
          setTimeout(() => {
            if (round.phase !== PHASE.PLAYING || round.getCurrentPlayerSeat() !== currentSeat) return;
            const hand = round.hands[currentSeat];

            // Check if bot should unveil
            if (
              round.cardsOnTable.length > 0 &&
              !round.trump.revealed &&
              BotAI.shouldUnveil(hand, round.leadSuit, round.trump)
            ) {
              const unveilRes = round.unveilColour(currentSeat);
              if (unveilRes.success) {
                io.to(this.code).emit('colour_unveiled', {
                  unveiledBySeat: currentSeat,
                  unveiledByName: player.name,
                  trumpSuit: unveilRes.trumpSuit,
                  hierarchy: unveilRes.hierarchy,
                });
              }
            }

            // Choose and play card
            const cardToPlay = BotAI.chooseCard(
              hand,
              round.leadSuit,
              round.trump,
              round.currentTrick,
              round.cardsOnTable,
              currentSeat
            );

            if (cardToPlay) {
              const res = round.playCard(currentSeat, cardToPlay.id);
              io.to(this.code).emit('card_played', {
                seat: currentSeat,
                cardId: cardToPlay.id,
                trickNumber: round.currentTrick,
              });

              if (res.trickComplete) {
                io.to(this.code).emit('trick_result', res.trickResult);

                if (res.roundComplete) {
                  this.match.recordRoundResult(res.roundResult);
                  io.to(this.code).emit('round_ended', {
                    roundResult: res.roundResult,
                    matchScores: this.match.scores,
                  });

                  if (this.match.isOver()) {
                    io.to(this.code).emit('match_ended', {
                      winner: this.match.winner,
                      finalScores: this.match.scores,
                      matchResults: this.match.roundResults,
                    });
                  }
                }
              }

              this.broadcastSanitizedGameState(io);
              this.triggerBotTurnIfNeeded(io);
            }
          }, 600);
        }
      }
    }

    // Always reset the AFK safety timer whenever turn or phase changes
    this.resetTurnTimer(io);
  }

  /**
   * Clear any active turn timer.
   */
  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnStartedAt = 0;
    this.turnExpiresAt = 0;
  }

  /**
   * Reset 25s AFK turn timer for players.
   */
  resetTurnTimer(io) {
    this.clearTurnTimer();
    if (!this.match || !this.match.currentRound) return;
    const round = this.match.currentRound;

    const currentSeat = round.getCurrentPlayerSeat();
    if (currentSeat === null) return;
    const player = this.seats[currentSeat];

    this.turnDuration = 25;
    this.turnStartedAt = Date.now();
    this.turnExpiresAt = this.turnStartedAt + (this.turnDuration * 1000);

    // Broadcast timer start event to all clients in the room
    if (io) {
      io.to(this.code).emit('turn_timer_start', {
        seat: currentSeat,
        duration: this.turnDuration,
        startedAt: this.turnStartedAt,
        expiresAt: this.turnExpiresAt,
        isBot: player ? Boolean(player.isBot) : false,
      });
    }

    if (!player || player.isBot) return; // Bots are automated

    // 25 second safety timer
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout(io, currentSeat);
    }, 25000);
  }

  /**
   * Auto-resolve move if player is AFK or disconnected.
   */
  handleTurnTimeout(io, seat) {
    if (!this.match || !this.match.currentRound) return;
    const round = this.match.currentRound;
    const player = this.seats[seat];
    if (!player) return;

    const BotAI = require('../game/BotAI');

    if (round.phase === PHASE.BIDDING && round.getCurrentBidderSeat() === seat) {
      const res = round.skipBid(seat);
      io.to(this.code).emit('turn_timeout', {
        seat,
        name: player.name,
        action: 'Skipped bid due to timer',
      });
      if (res.redeal) {
        const { round: newRound, dealerSeat, roundNumber } = this.match.handleRedeal();
        newRound.deal();
        io.to(this.code).emit('round_redeal', {
          roundNumber,
          dealerSeat,
          reason: 'All non-dealers skipped. Redealing.',
        });
      } else if (res.bidWon) {
        io.to(this.code).emit('bid_won', {
          seat: round.highestBidder,
          amount: round.contractBid,
          playerName: this.seats[round.highestBidder]?.name,
        });
      }
      this.broadcastSanitizedGameState(io);
      this.triggerBotTurnIfNeeded(io);
    } else if (round.phase === PHASE.SETTING_TRUMP && round.highestBidder === seat) {
      const hand = round.hands[seat];
      const { suit, hierarchy } = BotAI.chooseTrump(hand);
      round.setTrump(seat, suit, hierarchy);
      io.to(this.code).emit('turn_timeout', {
        seat,
        name: player.name,
        action: 'Auto-locked trump due to timer',
      });
      io.to(this.code).emit('trump_set', {
        bidderSeat: seat,
        message: `${player.name} secretly locked trump & hierarchy!`,
      });
      this.broadcastSanitizedGameState(io);
      this.triggerBotTurnIfNeeded(io);
    } else if (round.phase === PHASE.PLAYING && round.getCurrentPlayerSeat() === seat) {
      const hand = round.hands[seat];
      const cardToPlay = BotAI.chooseCard(
        hand,
        round.leadSuit,
        round.trump,
        round.currentTrick,
        round.cardsOnTable,
        seat
      );
      if (cardToPlay) {
        const res = round.playCard(seat, cardToPlay.id);
        io.to(this.code).emit('turn_timeout', {
          seat,
          name: player.name,
          action: 'Auto-played legal card due to timer',
        });
        io.to(this.code).emit('card_played', {
          seat,
          cardId: cardToPlay.id,
          trickNumber: round.currentTrick,
        });
        if (res.trickComplete) {
          io.to(this.code).emit('trick_result', res.trickResult);
          if (res.roundComplete) {
            this.match.recordRoundResult(res.roundResult);
            io.to(this.code).emit('round_ended', {
              roundResult: res.roundResult,
              matchScores: this.match.scores,
            });
            if (this.match.isOver()) {
              io.to(this.code).emit('match_ended', {
                winner: this.match.winner,
                finalScores: this.match.scores,
                matchResults: this.match.roundResults,
              });
            }
          }
        }
        this.broadcastSanitizedGameState(io);
        this.triggerBotTurnIfNeeded(io);
      }
    }
  }
}

module.exports = Room;
