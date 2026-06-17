function eventPayload(event) {
  return event && event.payload ? event.payload : {};
}

function eventTargetId(payload) {
  return payload.cardId || payload.appearanceId || payload.targetId || payload.id;
}

function upsertById(items, nextItem) {
  const list = Array.isArray(items) ? items : [];
  const id = nextItem && nextItem.id;
  if (!id) {return list;}
  const index = list.findIndex((item) => item && item.id === id);
  if (index === -1) {return [...list, nextItem];}
  return list.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextItem } : item);
}

function updateCards(state, predicate, updater) {
  const cards = Array.isArray(state && state.cards) ? state.cards : [];
  return {
    ...state,
    cards: cards.map((card) => predicate(card) ? updater(card) : card),
  };
}

function applyParticipantUpdated(state, payload) {
  const id = payload.participantId || payload.id;
  if (!id) {return state;}
  return {
    ...state,
    participants: upsertById(state.participants, { id, ...payload }),
  };
}

function applyLinkCreated(state, payload) {
  const sourceId = payload.sourceId || payload.fromId || payload.cardId || payload.appearanceId;
  const targetId = payload.targetId || payload.toId || payload.linkedCardId;
  if (!sourceId || !targetId) {return state;}
  const link = {
    id: payload.id || `${sourceId}:${targetId}`,
    sourceId,
    targetId,
    anchorTarget: payload.anchorTarget,
    anchorTargetId: payload.anchorTargetId,
    strategy: payload.strategy,
    status: payload.status || "active",
  };
  return { ...state, links: upsertById(state.links, link) };
}

function applyLinkRemoved(state, payload) {
  const sourceId = payload.sourceId || payload.fromId || payload.cardId || payload.appearanceId;
  const targetId = payload.targetId || payload.toId || payload.linkedCardId;
  const links = Array.isArray(state && state.links) ? state.links : [];
  return {
    ...state,
    links: links.map((link) => (
      (link.id && link.id === payload.id) ||
      (sourceId && targetId && link.sourceId === sourceId && link.targetId === targetId)
        ? { ...link, status: "removed" }
        : link
    )),
  };
}

function applyConflictCreated(state, payload) {
  const sourceId = payload.sourceId || payload.fromId || payload.cardId || payload.appearanceId;
  const targetId = payload.targetId || payload.toId || payload.conflictCardId;
  if (!sourceId || !targetId) {return state;}
  const conflict = {
    id: payload.id || `${sourceId}:${targetId}`,
    sourceId,
    targetId,
    anchorTargetId: payload.anchorTargetId,
    status: payload.status || "active",
  };
  return { ...state, conflicts: upsertById(state.conflicts, conflict) };
}

function applyConflictRemoved(state, payload) {
  const sourceId = payload.sourceId || payload.fromId || payload.cardId || payload.appearanceId;
  const targetId = payload.targetId || payload.toId || payload.conflictCardId;
  const conflicts = Array.isArray(state && state.conflicts) ? state.conflicts : [];
  return {
    ...state,
    conflicts: conflicts.map((conflict) => (
      (conflict.id && conflict.id === payload.id) ||
      (sourceId && targetId && conflict.sourceId === sourceId && conflict.targetId === targetId)
        ? { ...conflict, status: "removed" }
        : conflict
    )),
  };
}

function applyAppearanceMovedBetween(state, payload) {
  const targetId = eventTargetId(payload);
  if (!targetId) {return state;}
  return updateCards(
    state,
    (card) => [card.id, card.cardId, card.appearanceId].includes(targetId),
    (card) => ({
      ...card,
      manualOrder: payload.manualOrder ?? payload.manualOrderKey ?? card.manualOrder,
      manualOrderIntent: {
        targetId,
        beforeTargetId: payload.beforeTargetId,
        afterTargetId: payload.afterTargetId,
        anchorTargetId: targetId,
      },
    })
  );
}

function applyPlateauPlayed(state, payload) {
  const targetIds = new Set([...(payload.cardIds || []), ...(payload.appearanceIds || []), eventTargetId(payload)].filter(Boolean));
  if (!targetIds.size) {return state;}
  return updateCards(
    state,
    (card) => targetIds.has(card.id) || targetIds.has(card.cardId) || targetIds.has(card.appearanceId),
    (card) => ({ ...card, played: true, playedAtTransactionId: payload.transactionId || card.playedAtTransactionId })
  );
}

function applyLockToggled(state, payload) {
  const targetId = eventTargetId(payload);
  if (!targetId) {return state;}
  return updateCards(
    state,
    (card) => [card.id, card.cardId, card.appearanceId].includes(targetId),
    (card) => ({ ...card, locked: payload.locked !== undefined ? Boolean(payload.locked) : !card.locked })
  );
}

function applyRoundRevealed(state, payload) {
  const round = payload.round ?? payload.roundIndex;
  if (round === undefined || round === null) {return state;}
  return { ...state, revealedRounds: [...new Set([...(state.revealedRounds || []), round])].sort((a, b) => a - b) };
}

function applyParticipationAdded(state, payload) {
  const cards = Array.isArray(state && state.cards) ? state.cards : [];
  const appearances = payload.appearances || payload.cards || (payload.newAppearanceIds || payload.appearanceIds || []).map((id, index) => ({
    id,
    round: payload.round ?? 0,
    appearanceIndex: payload.appearanceIndex ?? cards.length + index,
  }));
  return {
    ...state,
    cards: [...cards, ...appearances],
  };
}

function applyHoleAdded(state, payload) {
  const holeId = payload.holeId || payload.id;
  if (!holeId) {return state;}
  const hole = {
    id: holeId,
    columnId: payload.columnId || payload.instrumentId || payload.column,
    round: payload.round ?? 0,
    appearanceIndex: payload.appearanceIndex,
    manualOrder: payload.manualOrder,
    isHole: true,
  };
  return {
    ...state,
    cards: [...(Array.isArray(state && state.cards) ? state.cards : []), hole],
  };
}

function applyParticipantLeft(state, payload) {
  const participantId = payload.participantId || payload.id;
  if (!participantId) {return state;}
  return updateCards(
    state,
    (card) => card.participantId === participantId,
    (card) => ({ ...card, status: "left", left: true })
  );
}

function applyAppearanceSkipped(state, payload) {
  const targetId = eventTargetId(payload);
  if (!targetId) {return state;}
  return updateCards(
    state,
    (card) => [card.id, card.cardId, card.appearanceId].includes(targetId),
    (card) => ({ ...card, appearanceSkipped: true, callDecision: "skipped" })
  );
}

function applyEvent(state, event) {
  const payload = eventPayload(event);
  switch (event && event.type) {
    case "participant_updated":
      return applyParticipantUpdated(state, payload);
    case "link_created":
      return applyLinkCreated(state, payload);
    case "link_removed":
      return applyLinkRemoved(state, payload);
    case "conflict_created":
      return applyConflictCreated(state, payload);
    case "conflict_removed":
      return applyConflictRemoved(state, payload);
    case "appearance_moved_between":
      return applyAppearanceMovedBetween(state, payload);
    case "plateau_played":
      return applyPlateauPlayed(state, payload);
    case "lock_toggled":
      return applyLockToggled(state, payload);
    case "round_revealed":
      return applyRoundRevealed(state, payload);
    case "participation_added":
      return applyParticipationAdded(state, payload);
    case "hole_added":
      return applyHoleAdded(state, payload);
    case "appearance_skipped":
      return applyAppearanceSkipped(state, payload);
    case "participant_left":
    case "participant_removed":
      return applyParticipantLeft(state, payload);
    default:
      return state;
  }
}

function applyTransaction(state, transaction) {
  const events = Array.isArray(transaction && transaction.events) ? transaction.events : [];
  return events.reduce((current, event) => applyEvent(current, event), state);
}

module.exports = {
  applyEvent,
  applyTransaction,
};
