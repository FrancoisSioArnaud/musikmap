const REMOVED_STATUSES = new Set(["removed", "left", "hidden"]);
const PLAYED_STATUSES = new Set(["played"]);
const LOCKED_STATUSES = new Set(["locked"]);

function stableId(value) {
  return value === null || value === undefined ? "" : String(value);
}

function cardId(card) {
  return stableId(card && (card.id || card.cardId || card.appearanceId));
}

function columnId(card) {
  return stableId(card && (card.columnId || card.column || "default"));
}

function isRemoved(card) {
  return Boolean(card && (card.removed || card.left || card.hidden || REMOVED_STATUSES.has(card.status)));
}

function isPlayed(card) {
  return Boolean(card && (card.played || card.playedAt || PLAYED_STATUSES.has(card.status)));
}

function isLocked(card) {
  return Boolean(card && (card.locked || card.lockedAt || LOCKED_STATUSES.has(card.status)));
}

function numberOrInfinity(value) {
  return Number.isFinite(value) ? value : Infinity;
}


function basePosition(card, fallbackIndex) {
  return [
    numberOrInfinity(card.manualOrder),
    numberOrInfinity(card.orderIndex),
    numberOrInfinity(card.round),
    numberOrInfinity(card.roundIndex),
    numberOrInfinity(card.appearanceIndex),
    numberOrInfinity(card.baseOrder),
    fallbackIndex,
  ];
}

function compareKeys(left, right) {
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const a = left[index] === null || left[index] === undefined ? Infinity : left[index];
    const b = right[index] === null || right[index] === undefined ? Infinity : right[index];
    if (a < b) {return -1;}
    if (a > b) {return 1;}
  }
  return 0;
}

function collectActiveCardsByColumn(state) {
  const cards = Array.isArray(state && state.cards) ? state.cards : [];
  return cards.reduce((columns, card, fallbackIndex) => {
    if (isRemoved(card)) {return columns;}
    const key = columnId(card);
    if (!columns[key]) {columns[key] = [];}
    columns[key].push({ ...card, __fallbackIndex: fallbackIndex });
    return columns;
  }, {});
}

function collectEventCards(events, names) {
  return events.flatMap((event) => {
    if (!event || !names.has(event.type)) {return [];}
    const payload = event.payload || event;
    return payload.cardIds || payload.appearanceIds || (payload.cardId ? [payload.cardId] : payload.appearanceId ? [payload.appearanceId] : []);
  }).map(stableId);
}

function identifyAnchors(context) {
  const events = Array.isArray(context && context.events) ? context.events : Array.isArray(context && context.transaction && context.transaction.events) ? context.transaction.events : [];
  const anchors = [];
  events.forEach((event) => {
    const payload = (event && event.payload) || event || {};
    if (!event) {return;}
    if (["card_moved", "manual_order_changed", "manual_drag"].includes(event.type)) {anchors.push(payload.cardId || payload.appearanceId || payload.id);}
    if (event.type === "link_created") {anchors.push(payload.anchorTarget || payload.anchorTargetId || payload.targetId || payload.toId);}
    if (event.type === "conflict_created") {anchors.push(payload.anchorTargetId || payload.anchorTarget || payload.targetId);}
    if (event.type === "participation_added") {anchors.push(...(payload.newAppearanceIds || payload.appearanceIds || payload.cardIds || []));}
    if (event.type === "hole_added") {anchors.push(payload.holeId || payload.cardId || payload.appearanceId || payload.id);}
    if (event.type === "appearance_skipped") {anchors.push(payload.cardId || payload.appearanceId || payload.id);}
    if (event.type === "plateau_played") {anchors.push(...(payload.targets || payload.cardIds || payload.appearanceIds || []));}
  });
  return new Set(anchors.filter(Boolean).map(stableId));
}

function relationPairs(state, key) {
  return (Array.isArray(state && state[key]) ? state[key] : []).map((relation) => [
    stableId(relation.sourceId || relation.fromId || relation.a || relation.leftId || relation.cardId),
    stableId(relation.targetId || relation.toId || relation.b || relation.rightId || relation.linkedCardId || relation.conflictCardId),
  ]).filter(([a, b]) => a && b && a !== b);
}

function resolveOrderAfterTransaction(state, context = {}) {
  const warnings = [];
  const byColumn = collectActiveCardsByColumn(state);
  const anchors = identifyAnchors(context);
  const links = relationPairs(state, "links");
  const conflicts = relationPairs(state, "conflicts");
  const movedDecisionIds = new Set(collectEventCards(Array.isArray(context.events) ? context.events : [], new Set(["appearance_skipped", "replacement_selected", "without_musician_selected"])));
  const resolvedColumns = {};

  Object.entries(byColumn).forEach(([col, cards]) => {
    const ids = new Set(cards.map(cardId));
    const directConflicts = new Set(conflicts.flatMap(([a, b]) => [`${a}\u0000${b}`, `${b}\u0000${a}`]));
    const parent = {};
    ids.forEach((id) => { parent[id] = id; });
    const find = (id) => parent[id] === id ? id : (parent[id] = find(parent[id]));
    const union = (a, b) => { if (!ids.has(a) || !ids.has(b)) {return;} const ra = find(a); const rb = find(b); if (ra !== rb) { parent[rb] = ra; } };
    links.forEach(([a, b]) => {
      if (directConflicts.has(`${a}\u0000${b}`)) {
        warnings.push({ code: "LINK_CONFLICT_DIRECT", cardIds: [a, b].sort() });
        return;
      }
      union(a, b);
    });
    conflicts.forEach(([a, b]) => {
      const ca = cards.find((card) => cardId(card) === a);
      const cb = cards.find((card) => cardId(card) === b);
      if (!ca || !cb) {return;}
      if ((anchors.has(a) && !isPlayed(cb) && !isLocked(cb)) || (anchors.has(b) && !isPlayed(ca) && !isLocked(ca))) {union(a, b);}
    });

    const groups = new Map();
    cards.forEach((card) => {
      const id = cardId(card);
      const groupId = (isPlayed(card) || isLocked(card)) ? id : find(id);
      if (!groups.has(groupId)) {groups.set(groupId, []);}
      groups.get(groupId).push(card);
    });

    const units = Array.from(groups.values()).map((members) => {
      const anchorIds = new Set(members.filter((card) => anchors.has(cardId(card))).map(cardId));
      const linkedToAnchorIds = new Set();
      const conflictToAnchorIds = new Set();
      links.forEach(([a, b]) => {
        if (anchorIds.has(a)) {linkedToAnchorIds.add(b);}
        if (anchorIds.has(b)) {linkedToAnchorIds.add(a);}
      });
      conflicts.forEach(([a, b]) => {
        if (anchorIds.has(a)) {conflictToAnchorIds.add(b);}
        if (anchorIds.has(b)) {conflictToAnchorIds.add(a);}
      });
      const memberRank = (card) => {
        const id = cardId(card);
        if (anchorIds.has(id)) {return 0;}
        if (linkedToAnchorIds.has(id)) {return 1;}
        if (conflictToAnchorIds.has(id)) {return 2;}
        return 3;
      };
      const sortedMembers = [...members].sort((a, b) => memberRank(a) - memberRank(b) || compareKeys(basePosition(a, a.__fallbackIndex), basePosition(b, b.__fallbackIndex)) || cardId(a).localeCompare(cardId(b)));
      const hasPlayed = sortedMembers.some(isPlayed);
      const hasLocked = sortedMembers.some(isLocked);
      const hasAnchor = sortedMembers.some((card) => anchors.has(cardId(card)));
      const hasDecision = sortedMembers.some((card) => movedDecisionIds.has(cardId(card)) || card.callDecision || card.appearanceSkipped);
      const minFrozen = Math.min(...sortedMembers.map((card) => isPlayed(card) ? numberOrInfinity(card.playedAtPlateauIndex ?? card.frozenOrderKey) : isLocked(card) ? numberOrInfinity(card.lockedOrderKey ?? card.frozenOrderKey) : Infinity));
      const minManual = hasAnchor
        ? Math.min(...sortedMembers.filter((card) => anchors.has(cardId(card))).map((card) => numberOrInfinity(card.manualOrder)))
        : Math.min(...sortedMembers.map((card) => numberOrInfinity(card.manualOrder)));
      const minBase = hasAnchor
        ? sortedMembers.filter((card) => anchors.has(cardId(card))).reduce((best, card) => compareKeys(basePosition(card, card.__fallbackIndex), best) < 0 ? basePosition(card, card.__fallbackIndex) : best, [Infinity])
        : sortedMembers.reduce((best, card) => compareKeys(basePosition(card, card.__fallbackIndex), best) < 0 ? basePosition(card, card.__fallbackIndex) : best, [Infinity]);
      return { members: sortedMembers, key: [hasPlayed ? 0 : hasLocked ? 1 : 2, hasPlayed || hasLocked ? minFrozen : Infinity, hasAnchor ? 0 : 1, hasDecision ? 0 : 1, minManual, ...minBase] };
    });

    resolvedColumns[col] = units.sort((a, b) => compareKeys(a.key, b.key) || cardId(a.members[0]).localeCompare(cardId(b.members[0]))).flatMap((unit) => unit.members);
  });

  const resolvedCards = Object.values(resolvedColumns).flatMap((cards) => cards).map((card, index) => {
    const next = { ...card, resolvedOrder: index };
    delete next.__fallbackIndex;
    if (isPlayed(next) && (next.playedAtPlateauIndex === null || next.playedAtPlateauIndex === undefined)) {next.playedAtPlateauIndex = index;}
    if (isLocked(next) && (next.lockedOrderKey === null || next.lockedOrderKey === undefined)) {next.lockedOrderKey = index;}
    if ((next.frozenOrderKey === null || next.frozenOrderKey === undefined) && (isPlayed(next) || isLocked(next))) {next.frozenOrderKey = index;}
    return next;
  });

  return { ...state, cards: resolvedCards, orderWarnings: warnings };
}

function applyTransactionAndResolve(state, transaction, applyEvent) {
  const events = Array.isArray(transaction && transaction.events) ? transaction.events : [];
  const applied = events.reduce((current, event, index) => applyEvent(current, event, { transaction, eventIndex: index }), state);
  return resolveOrderAfterTransaction(applied, { transaction, events });
}

module.exports = {
  resolveOrderAfterTransaction,
  applyTransactionAndResolve,
  collectActiveCardsByColumn,
  identifyAnchors,
  isPlayed,
  isLocked,
};
