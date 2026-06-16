const REMOVED_STATUSES = new Set(["removed", "left", "hidden"]);
const PLAYED_STATUSES = new Set(["played"]);
const LOCKED_STATUSES = new Set(["locked"]);
const MANUAL_REORDER_EVENT_TYPES = new Set(["card_moved", "manual_order_changed", "manual_drag", "appearance_moved_between"]);
const CALL_DECISION_EVENT_TYPES = new Set(["appearance_skipped", "appearance_replaced", "replacement_selected", "without_musician_selected"]);

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

function frozenOrderKey(card) {
  if (isPlayed(card)) {return numberOrInfinity(card.playedAtPlateauIndex ?? card.frozenOrderKey ?? card.__fallbackIndex);}
  if (isLocked(card)) {return numberOrInfinity(card.lockedOrderKey ?? card.frozenOrderKey ?? card.__fallbackIndex);}
  return Infinity;
}

function withCapturedFrozenOrder(card, fallbackIndex) {
  const next = { ...card, __fallbackIndex: fallbackIndex };
  if (isPlayed(next) && (next.playedAtPlateauIndex === null || next.playedAtPlateauIndex === undefined)) {next.playedAtPlateauIndex = fallbackIndex;}
  if (isLocked(next) && (next.lockedOrderKey === null || next.lockedOrderKey === undefined)) {next.lockedOrderKey = fallbackIndex;}
  if ((next.frozenOrderKey === null || next.frozenOrderKey === undefined) && (isPlayed(next) || isLocked(next))) {next.frozenOrderKey = fallbackIndex;}
  return next;
}

function warningIdentity(warning) {
  return `${warning.code}:${(warning.cardIds || [warning.cardId, warning.anchorId].filter(Boolean)).join(",")}`;
}

function pushOrderWarning(warnings, warning) {
  const key = warningIdentity(warning);
  if (!warnings.some((item) => warningIdentity(item) === key)) {warnings.push(warning);}
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
    columns[key].push(withCapturedFrozenOrder(card, fallbackIndex));
    return columns;
  }, {});
}


function targetKey(target) {
  if (typeof target === "string" || typeof target === "number") {return stableId(target);}
  return stableId(target && (target.cardId || target.appearanceId || target.id || target.targetId));
}

function getVisibleColumns(state) {
  if (Array.isArray(state && state.columns)) {
    return state.columns.map((column) => ({
      ...column,
      cards: (Array.isArray(column.cards) ? column.cards : []).filter((card) => !isRemoved(card)),
    }));
  }
  const grouped = collectActiveCardsByColumn(state);
  return Object.entries(grouped).map(([instrumentId, cards]) => ({
    instrument: { instrumentId },
    instrumentId,
    cards,
  }));
}

function getCardsForInstrument(state, instrumentId) {
  const key = stableId(instrumentId);
  const column = getVisibleColumns(state).find((item) => stableId(item.instrument && item.instrument.instrumentId || item.instrumentId || item.id) === key);
  return column ? column.cards : [];
}

function findCardByTarget(state, target) {
  const key = targetKey(target);
  return getVisibleColumns(state).flatMap((column) => column.cards).find((card) => targetKey(card) === key);
}

function getVisiblePlateauIndex(state, target) {
  const key = targetKey(target);
  for (const column of getVisibleColumns(state)) {
    const index = column.cards.findIndex((card) => targetKey(card) === key);
    if (index !== -1) {return index;}
  }
  return -1;
}

function collectEventCards(events, names) {
  return events.flatMap((event) => {
    if (!event || !names.has(event.type)) {return [];}
    const payload = event.payload || event;
    return payloadValues(payload, ["cardIds", "appearanceIds", "replacementAppearanceIds", "cardId", "appearanceId", "replacementAppearanceId", "targetAppearanceId", "id"]);
  }).map(stableId);
}

function firstPayloadValue(payload, names) {
  return names.map((name) => payload[name]).find((value) => value !== null && value !== undefined);
}

function payloadValues(payload, names) {
  const value = firstPayloadValue(payload, names);
  return Array.isArray(value) ? value : value ? [value] : [];
}

function manualReorderAnchor(payload) {
  return firstPayloadValue(payload, ["cardId", "appearanceId", "id", "movedAppearanceId", "movedCardId"]);
}

const EVENT_ANCHOR_READERS = {
  link_created: (payload) => payloadValues(payload, ["anchorTarget", "anchorTargetId", "targetId", "toId"]),
  conflict_created: (payload) => payloadValues(payload, ["anchorTargetId", "anchorTarget", "targetId"]),
  participation_added: (payload) => payloadValues(payload, ["newAppearanceIds", "appearanceIds", "cardIds"]).slice(0, 1),
  hole_added: (payload) => payloadValues(payload, ["holeId", "cardId", "appearanceId", "id"]),
  appearance_skipped: (payload) => payloadValues(payload, ["cardId", "appearanceId", "id"]),
  appearance_replaced: (payload) => payloadValues(payload, ["replacementAppearanceId", "appearanceId", "cardId", "targetAppearanceId", "id"]),
  replacement_selected: (payload) => payloadValues(payload, ["replacementAppearanceId", "appearanceId", "cardId", "targetAppearanceId", "id"]),
  without_musician_selected: (payload) => payloadValues(payload, ["appearanceId", "cardId", "targetAppearanceId", "id"]),
  plateau_played: (payload) => payloadValues(payload, ["targets", "cardIds", "appearanceIds"]),
};

function eventAnchors(event) {
  if (!event) {return [];}
  const payload = event.payload || event;
  if (MANUAL_REORDER_EVENT_TYPES.has(event.type)) {return payloadValues({ anchor: manualReorderAnchor(payload) }, ["anchor"]);}
  const reader = EVENT_ANCHOR_READERS[event.type];
  return reader ? reader(payload) : [];
}

function identifyAnchors(context) {
  const events = Array.isArray(context && context.events) ? context.events : Array.isArray(context && context.transaction && context.transaction.events) ? context.transaction.events : [];
  return new Set(events.flatMap(eventAnchors).filter(Boolean).map(stableId));
}

function relationPairs(state, key) {
  return (Array.isArray(state && state[key]) ? state[key] : []).map((relation) => [
    stableId(relation.sourceId || relation.fromId || relation.a || relation.leftId || relation.cardId),
    stableId(relation.targetId || relation.toId || relation.b || relation.rightId || relation.linkedCardId || relation.conflictCardId),
  ]).filter(([a, b]) => a && b && a !== b);
}


function relationEndpoint(relation, names) {
  return stableId(names.map((name) => relation && relation[name]).find((value) => value !== null && value !== undefined));
}

function activeLinks(state) {
  return (Array.isArray(state && state.links) ? state.links : []).filter((link) =>
    link && link.status !== "removed" && link.status !== "deleted" && link.status !== "inactive" && link.status !== "suppressed" && link.active !== false && link.suppressedByConflict !== true
  ).map((link) => {
    const sourceId = relationEndpoint(link, ["sourceId", "fromId", "a", "leftId", "cardId"]);
    const targetId = relationEndpoint(link, ["targetId", "toId", "b", "rightId", "linkedCardId"]);
    return {
      ...link,
      sourceId,
      targetId,
      anchorId: targetKey(link.anchorTarget) || stableId(link.anchorTargetId) || stableId(link.anchorId) || sourceId,
    };
  }).filter((link) => link.sourceId && link.targetId && link.sourceId !== link.targetId);
}

function cardColumnLookup(columns) {
  const lookup = new Map();
  Object.entries(columns).forEach(([columnKey, cards]) => {
    cards.forEach((card, index) => lookup.set(cardId(card), { card, columnKey, index }));
  });
  return lookup;
}

function moveCardToPlateauIndex(cards, id, targetIndex) {
  const fromIndex = cards.findIndex((card) => cardId(card) === id);
  if (fromIndex === -1) {return cards;}
  const next = [...cards];
  const [card] = next.splice(fromIndex, 1);
  const boundedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(boundedIndex, 0, card);
  return next;
}

function suppressLinks(state, suppressedKeys) {
  if (!suppressedKeys.size || !Array.isArray(state && state.links)) {return state && state.links;}
  return state.links.map((link) => {
    const sourceId = relationEndpoint(link, ["sourceId", "fromId", "a", "leftId", "cardId"]);
    const targetId = relationEndpoint(link, ["targetId", "toId", "b", "rightId", "linkedCardId"]);
    const key = [sourceId, targetId].sort().join("\u0000");
    return suppressedKeys.has(key) ? { ...link, status: "suppressed", suppressedByConflict: true } : link;
  });
}

function resolveActiveLinksInColumns(state, columns, warnings) {
  const conflicts = relationPairs(state, "conflicts");
  const directConflicts = new Set(conflicts.flatMap(([a, b]) => [[a, b].sort().join("\u0000")]));
  let resolvedColumns = Object.fromEntries(Object.entries(columns).map(([key, cards]) => [key, [...cards]]));
  const suppressedKeys = new Set();

  activeLinks(state).forEach((link) => {
    const linkKey = [link.sourceId, link.targetId].sort().join("\u0000");
    if (directConflicts.has(linkKey)) {
      suppressedKeys.add(linkKey);
      pushOrderWarning(warnings, { code: "LINK_CONFLICT_DIRECT", cardIds: [link.sourceId, link.targetId].sort() });
      return;
    }

    const lookup = cardColumnLookup(resolvedColumns);
    const source = lookup.get(link.sourceId);
    const target = lookup.get(link.targetId);
    if (!source || !target) {return;}

    const anchorId = link.anchorId === link.targetId ? link.targetId : link.sourceId;
    const followerId = anchorId === link.sourceId ? link.targetId : link.sourceId;
    const anchor = lookup.get(anchorId);
    const follower = lookup.get(followerId);
    if (!anchor || !follower) {return;}

    if (isPlayed(follower.card) || isLocked(follower.card)) {
      suppressedKeys.add(linkKey);
      pushOrderWarning(warnings, { code: "LINKED_CARD_FROZEN", anchorId, cardId: followerId });
      return;
    }
    if (anchor.columnKey === follower.columnKey) {return;}

    const nextColumn = moveCardToPlateauIndex(resolvedColumns[follower.columnKey], followerId, anchor.index);
    const movedFollower = nextColumn.findIndex((card) => cardId(card) === followerId);
    if (movedFollower !== anchor.index) {
      suppressedKeys.add(linkKey);
      pushOrderWarning(warnings, { code: "LINK_PLATEAU_INDEX_UNREACHABLE", cardIds: [link.sourceId, link.targetId].sort() });
      return;
    }
    resolvedColumns = { ...resolvedColumns, [follower.columnKey]: nextColumn };
  });

  return { columns: resolvedColumns, suppressedLinks: suppressLinks(state, suppressedKeys) };
}

function resolveOrderAfterTransaction(state, context = {}) {
  const warnings = [];
  const byColumn = collectActiveCardsByColumn(state);
  const anchors = identifyAnchors(context);
  const links = relationPairs(state, "links");
  const conflicts = relationPairs(state, "conflicts");
  const movedDecisionIds = new Set(collectEventCards(Array.isArray(context.events) ? context.events : [], CALL_DECISION_EVENT_TYPES));
  const resolvedColumns = {};

  Object.entries(byColumn).forEach(([col, cards]) => {
    const ids = new Set(cards.map(cardId));
    const directConflicts = new Set(conflicts.flatMap(([a, b]) => [`${a}\u0000${b}`, `${b}\u0000${a}`]));
    const cardsById = new Map(cards.map((card) => [cardId(card), card]));
    const warnFrozenBlockedAnchor = (code, anchorId, frozenId) => pushOrderWarning(warnings, { code, anchorId, cardId: frozenId });

    cards.forEach((card) => {
      const id = cardId(card);
      if (!anchors.has(id) || isPlayed(card) || isLocked(card)) {return;}
      const desiredPosition = numberOrInfinity(card.manualOrder ?? card.orderIndex);
      if (desiredPosition === Infinity) {return;}
      cards.forEach((candidate) => {
        const candidateId = cardId(candidate);
        if (candidateId !== id && (isPlayed(candidate) || isLocked(candidate)) && desiredPosition < frozenOrderKey(candidate)) {
          warnFrozenBlockedAnchor("FROZEN_BOUNDARY_BLOCKED", id, candidateId);
        }
      });
    });

    links.forEach(([a, b]) => {
      const ca = cardsById.get(a);
      const cb = cardsById.get(b);
      if (anchors.has(a) && cb && (isPlayed(cb) || isLocked(cb))) {warnFrozenBlockedAnchor("LINKED_CARD_FROZEN", a, b);}
      if (anchors.has(b) && ca && (isPlayed(ca) || isLocked(ca))) {warnFrozenBlockedAnchor("LINKED_CARD_FROZEN", b, a);}
    });

    conflicts.forEach(([a, b]) => {
      const ca = cardsById.get(a);
      const cb = cardsById.get(b);
      if (anchors.has(a) && cb && (isPlayed(cb) || isLocked(cb))) {warnFrozenBlockedAnchor("CONFLICT_TARGET_FROZEN", a, b);}
      if (anchors.has(b) && ca && (isPlayed(ca) || isLocked(ca))) {warnFrozenBlockedAnchor("CONFLICT_TARGET_FROZEN", b, a);}
    });

    const parent = {};
    ids.forEach((id) => { parent[id] = id; });
    const find = (id) => parent[id] === id ? id : (parent[id] = find(parent[id]));
    const union = (a, b) => { if (!ids.has(a) || !ids.has(b)) {return;} const ra = find(a); const rb = find(b); if (ra !== rb) { parent[rb] = ra; } };
    const componentContains = (root, id) => ids.has(id) && find(id) === root;
    const componentConflict = (leftRoot, rightRoot) => conflicts.find(([x, y]) =>
      (componentContains(leftRoot, x) && componentContains(rightRoot, y)) ||
      (componentContains(leftRoot, y) && componentContains(rightRoot, x))
    );
    links.forEach(([a, b]) => {
      if (directConflicts.has(`${a}\u0000${b}`)) {
        pushOrderWarning(warnings, { code: "LINK_CONFLICT_DIRECT", cardIds: [a, b].sort() });
        return;
      }
      if (!ids.has(a) || !ids.has(b)) {return;}
      const conflict = componentConflict(find(a), find(b));
      if (conflict) {
        pushOrderWarning(warnings, { code: "LINK_CONFLICT_TRANSITIVE", cardIds: conflict.slice().sort(), linkCardIds: [a, b].sort() });
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
      const hasDecision = sortedMembers.some((card) => movedDecisionIds.has(cardId(card)) || card.callDecision || card.appearanceSkipped || card.appearanceReplaced || card.withoutMusician);
      const minFrozen = Math.min(...sortedMembers.map(frozenOrderKey));
      const minManual = hasAnchor
        ? Math.min(...sortedMembers.filter((card) => anchors.has(cardId(card))).map((card) => numberOrInfinity(card.manualOrder)))
        : Math.min(...sortedMembers.map((card) => numberOrInfinity(card.manualOrder)));
      const minBase = hasAnchor
        ? sortedMembers.filter((card) => anchors.has(cardId(card))).reduce((best, card) => compareKeys(basePosition(card, card.__fallbackIndex), best) < 0 ? basePosition(card, card.__fallbackIndex) : best, [Infinity])
        : sortedMembers.reduce((best, card) => compareKeys(basePosition(card, card.__fallbackIndex), best) < 0 ? basePosition(card, card.__fallbackIndex) : best, [Infinity]);
      const minFallbackIndex = Math.min(...sortedMembers.map((card) => numberOrInfinity(card.__fallbackIndex)));
      const shouldRespectFrozenBoundary = (key) => hasAnchor || hasDecision || minFallbackIndex > key;
      const blockingFrozenKeys = sortedMembers.some((card) => isPlayed(card) || isLocked(card)) || minManual === Infinity
        ? []
        : cards.map(frozenOrderKey).filter((key) => key !== Infinity && minManual < key && shouldRespectFrozenBoundary(key));
      const effectiveManual = blockingFrozenKeys.length ? Math.max(minManual, Math.max(...blockingFrozenKeys) + 0.1) : minManual;
      return { members: sortedMembers, key: [hasPlayed || hasLocked ? minFrozen : effectiveManual, hasPlayed ? 0 : hasLocked ? 1 : 2, hasAnchor ? 0 : 1, hasDecision ? 0 : 1, minManual, ...minBase] };
    });

    resolvedColumns[col] = units.sort((a, b) => compareKeys(a.key, b.key) || cardId(a.members[0]).localeCompare(cardId(b.members[0]))).flatMap((unit) => unit.members);
  });

  const linkResolution = resolveActiveLinksInColumns(state, resolvedColumns, warnings);
  const finalColumns = linkResolution.columns;

  const resolvedCards = Object.values(finalColumns).flatMap((cards) => cards).map((card, index) => {
    const next = { ...card, resolvedOrder: index };
    delete next.__fallbackIndex;
    if (isPlayed(next) && (next.playedAtPlateauIndex === null || next.playedAtPlateauIndex === undefined)) {next.playedAtPlateauIndex = index;}
    if (isLocked(next) && (next.lockedOrderKey === null || next.lockedOrderKey === undefined)) {next.lockedOrderKey = index;}
    if ((next.frozenOrderKey === null || next.frozenOrderKey === undefined) && (isPlayed(next) || isLocked(next))) {next.frozenOrderKey = frozenOrderKey(next) === Infinity ? index : frozenOrderKey(next);}
    return next;
  });

  return { ...state, cards: resolvedCards, links: linkResolution.suppressedLinks || state.links, orderWarnings: warnings };
}

function transactionEvents(transaction) {
  if (Array.isArray(transaction && transaction.events)) {return transaction.events;}
  return transaction && transaction.type ? [transaction] : [];
}

function isTransactionActive(transaction) {
  return !(transaction && (transaction.undone || transaction.reverted || transaction.active === false));
}

function applyTransactionAndResolve(state, transaction, applyEvent) {
  const events = transactionEvents(transaction);
  const applied = events.reduce((current, event, index) => applyEvent(current, event, { transaction, eventIndex: index }), state);
  return resolveOrderAfterTransaction(applied, { transaction, events });
}

function projectEventLog(initialState, eventLog, applyEvent) {
  const transactions = Array.isArray(eventLog) ? eventLog : [];
  return transactions.reduce((state, transaction, transactionIndex) => {
    if (!isTransactionActive(transaction)) {return state;}
    const resolved = applyTransactionAndResolve(state, transaction, (current, event, eventContext) => applyEvent(current, event, {
      ...eventContext,
      transactionIndex,
    }));
    return {
      ...resolved,
      lastResolvedTransactionIndex: transactionIndex,
    };
  }, initialState);
}

module.exports = {
  resolveOrderAfterTransaction,
  applyTransactionAndResolve,
  projectEventLog,
  getVisibleColumns,
  getCardsForInstrument,
  getVisiblePlateauIndex,
  findCardByTarget,
  targetKey,
  collectActiveCardsByColumn,
  identifyAnchors,
  isPlayed,
  isLocked,
};
