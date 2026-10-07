/**
 * Game Socket Handlers
 * Handles real-time gameplay: bidding, trump selection, unveiling, card play, and round transitions.
 */

function registerGameHandlers(io, socket, roomManager) {
  const getContext = () => {
    const room = roomManager.findRoomByPlayer(socket.id);
    if (!room || !room.match || !room.match.currentRound) {
      return { room: null, player: null, round: null };
    }
    const player = room.players.get(socket.data?.playerId) ||
      Array.from(room.players.values()).find(p => p.socketId === socket.id);
    return { room, player, round: room.match.currentRound };
  };

  // ─── Get Current Game State ─────────────────────────────
  socket.on('get_game_state', (data, callback) => {
    const { room, player } = getContext();
    if (!room || !player || !room.match || !room.match.currentRound) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }
    const sanitized = room.getSanitizedGameState(player.seat);
    socket.emit('game_state_update', sanitized);
    if (typeof callback === 'function') callback({ success: true, gameState: sanitized });
  });

  // ─── Place Bid ───────────────────────────────────────────
  socket.on('place_bid', ({ amount } = {}, callback) => {
    const { room, player, round } = getContext();
    if (!room || !player || !round) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }

    const res = round.placeBid(player.seat, Number(amount));
    if (typeof callback === 'function') callback(res);

    if (!res.success) return;

    if (res.bidWon) {
      io.to(room.code).emit('bid_won', {
        seat: round.highestBidder,
        amount: round.contractBid,
        playerName: room.seats[round.highestBidder]?.name,
      });
    }

    room.broadcastSanitizedGameState(io);
    room.triggerBotTurnIfNeeded(io);
  });

  // ─── Skip Bid ────────────────────────────────────────────
  socket.on('skip_bid', (data, callback) => {
    const { room, player, round } = getContext();
    if (!room || !player || !round) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }

    const res = round.skipBid(player.seat);
    if (typeof callback === 'function') callback(res);

    if (!res.success) return;

    if (res.redeal) {
      // All 3 non-dealers skipped -> trigger redeal with next dealer!
      const { round: newRound, dealerSeat, roundNumber } = room.match.handleRedeal();
      newRound.deal();

      io.to(room.code).emit('round_redeal', {
        roundNumber,
        dealerSeat,
        reason: 'First 3 players skipped. Cards redealt by next dealer.',
      });
    } else if (res.bidWon) {
      io.to(room.code).emit('bid_won', {
        seat: round.highestBidder,
        amount: round.contractBid,
        playerName: room.seats[round.highestBidder]?.name,
      });
    }

    room.broadcastSanitizedGameState(io);
    room.triggerBotTurnIfNeeded(io);
  });

  // ─── Set Trump (Bidder Only) ─────────────────────────────
  socket.on('set_trump', ({ suit, hierarchy } = {}, callback) => {
    const { room, player, round } = getContext();
    if (!room || !player || !round) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }

    const res = round.setTrump(player.seat, suit, hierarchy);
    if (typeof callback === 'function') callback(res);

    if (res.success) {
      io.to(room.code).emit('trump_set', {
        bidderSeat: player.seat,
        message: 'Trump suit and hierarchy have been secretly chosen!',
      });
      room.broadcastSanitizedGameState(io);
      room.triggerBotTurnIfNeeded(io);
    }
  });

  // ─── Unveil Colour ───────────────────────────────────────
  socket.on('unveil_colour', (data, callback) => {
    const { room, player, round } = getContext();
    if (!room || !player || !round) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }

    const res = round.unveilColour(player.seat);
    if (typeof callback === 'function') callback(res);

    if (res.success) {
      io.to(room.code).emit('colour_unveiled', {
        unveiledBySeat: player.seat,
        unveiledByName: player.name,
        trumpSuit: res.trumpSuit,
        hierarchy: res.hierarchy,
      });
      room.broadcastSanitizedGameState(io);
    }
  });

  // ─── Play Card ───────────────────────────────────────────
  socket.on('play_card', ({ cardId } = {}, callback) => {
    const { room, player, round } = getContext();
    if (!room || !player || !round) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active game' });
      return;
    }

    const seat = player.seat;
    const res = round.playCard(seat, cardId);
    if (typeof callback === 'function') callback(res);

    if (!res.success) return;

    // Public announcement of the card played
    io.to(room.code).emit('card_played', {
      seat,
      cardId,
      trickNumber: round.currentTrick,
    });

    if (res.trickComplete) {
      io.to(room.code).emit('trick_result', res.trickResult);

      if (res.roundComplete) {
        room.match.recordRoundResult(res.roundResult);
        io.to(room.code).emit('round_ended', {
          roundResult: res.roundResult,
          matchScores: room.match.scores,
        });

        if (room.match.isOver()) {
          io.to(room.code).emit('match_ended', {
            winner: room.match.winner,
            finalScores: room.match.scores,
            matchResults: room.match.roundResults,
          });
        }
      }
    }

    room.broadcastSanitizedGameState(io);
    room.triggerBotTurnIfNeeded(io);
  });

  // ─── Start Next Round (When Round Complete) ──────────────
  socket.on('start_next_round', (data, callback) => {
    const { room, player } = getContext();
    if (!room || !player || !room.match) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not in active match' });
      return;
    }

    if (room.match.isOver()) {
      if (typeof callback === 'function') callback({ success: false, error: 'Match is already complete' });
      return;
    }

    if (room.hostId !== player.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can start the next round' });
      return;
    }

    const next = room.match.startNextRound();
    next.round.deal();

    io.to(room.code).emit('round_started', {
      roundNumber: next.roundNumber,
      dealerSeat: next.dealerSeat,
    });

    room.broadcastSanitizedGameState(io);
    room.triggerBotTurnIfNeeded(io);
    if (typeof callback === 'function') callback({ success: true, roundNumber: next.roundNumber });
  });
}

module.exports = registerGameHandlers;
