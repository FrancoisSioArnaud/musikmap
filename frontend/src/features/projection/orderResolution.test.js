const { applyEvent, applyTransaction } = require('./applyEvent');
const {
  resolveOrderAfterTransaction,
  applyTransactionAndResolve,
  projectEventLog,
  cardTarget,
  getCardsByInstrument,
  getInstrumentIdForCard,
  identifyAnchors,
  isCardActive,
  isCardLocked,
  isCardPlayed,
  sortCardsByCurrentResolvedOrder,
  targetKey,
} = require('./orderResolution');
const { projectJamState } = require('./projectJamState');

const ids = (state) => state.cards.map((card) => card.id);
const c = (id, extra = {}) => ({ id, round: 0, appearanceIndex: 0, baseOrder: 0, ...extra });

describe('orderResolution', () => {
  test("ajout après des cards jouées du round 2 conserve le préfixe frozen", () => {
    const initial = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0 }),
      c("B'", { round: 1, appearanceIndex: 1 }),
      c("C'", { round: 1, appearanceIndex: 2 }),
    ] };
    const eventLog = [
      { events: [{ type: 'plateau_played', payload: { cardIds: ['A', 'B', 'C', "A'"] } }] },
      { events: [{ type: 'participation_added', payload: { newAppearanceIds: ['D', "D'"] } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'plateau_played') {
        return { ...state, cards: state.cards.map((card) => event.payload.cardIds.includes(card.id) ? { ...card, played: true } : card) };
      }
      if (event.type === 'participation_added') {
        return { ...state, cards: [...state.cards, c('D', { round: 0, appearanceIndex: 3 }), c("D'", { round: 1, appearanceIndex: 3 })] };
      }
      return state;
    };

    const projected = projectEventLog(initial, eventLog, apply);

    expect(ids(projected)).toEqual(['A', 'B', 'C', "A'", 'D', "B'", "C'", "D'"]);
    expect(projected.cards.slice(0, 4).map((card) => card.playedAtPlateauIndex)).toEqual([0, 1, 2, 3]);
    expect(projected.cards.slice(0, 4).map((card) => card.resolvedPlateauIndex)).toEqual([0, 1, 2, 3]);
  });

  test("ajout autour d’une card locked ne décale pas A'", () => {
    const state = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0, locked: true, lockedAtPlateauIndex: 3 }),
      c("B'", { round: 1, appearanceIndex: 1 }),
      c("C'", { round: 1, appearanceIndex: 2 }),
      c('D', { round: 0, appearanceIndex: 3 }),
    ] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'participation_added', payload: { newAppearanceIds: ['D'] } }] });

    expect(resolved.cards.find((card) => card.id === "A'").resolvedPlateauIndex).toBe(3);
    expect(ids(resolved).indexOf('D')).toBeGreaterThan(ids(resolved).indexOf("A'"));
  });

  test("played ne bouge pas lors d’un drag autour de A'", () => {
    const state = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0, played: true, playedAtPlateauIndex: 3 }),
      c("B'", { round: 1, appearanceIndex: 1, manualOrder: -1 }),
    ] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'appearance_moved_between', payload: { appearanceId: "B'", beforeTargetId: "A'" } }] });

    expect(resolved.cards.find((card) => card.id === "A'").resolvedPlateauIndex).toBe(3);
  });

  test("locked ne bouge pas lors d’un drag autour de A'", () => {
    const state = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0, locked: true, lockedAtPlateauIndex: 3 }),
      c("B'", { round: 1, appearanceIndex: 1, manualOrder: -1 }),
    ] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'appearance_moved_between', payload: { appearanceId: "B'", beforeTargetId: "A'" } }] });

    expect(resolved.cards.find((card) => card.id === "A'").resolvedPlateauIndex).toBe(3);
  });

  test('replay déterministe avec reveal, played, ajout, lock et drag', () => {
    const initial = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c("A'", { round: 1, appearanceIndex: 0 }),
    ] };
    const eventLog = [
      { events: [{ type: 'round_revealed', payload: { round: 1 } }] },
      { events: [{ type: 'plateau_played', payload: { cardIds: ['A'] } }] },
      { events: [{ type: 'participation_added', payload: { newAppearanceIds: ['D'] } }] },
      { events: [{ type: 'lock_toggled', payload: { appearanceId: "A'", locked: true } }] },
      { events: [{ type: 'appearance_moved_between', payload: { appearanceId: 'D', manualOrder: -1 } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'plateau_played') {
        return { ...state, cards: state.cards.map((card) => event.payload.cardIds.includes(card.id) ? { ...card, played: true } : card) };
      }
      if (event.type === 'participation_added') {
        return { ...state, cards: [...state.cards, c('D', { round: 0, appearanceIndex: 2 })] };
      }
      if (event.type === 'lock_toggled') {
        return { ...state, cards: state.cards.map((card) => card.id === event.payload.appearanceId ? { ...card, locked: event.payload.locked } : card) };
      }
      if (event.type === 'appearance_moved_between') {
        return { ...state, cards: state.cards.map((card) => card.id === event.payload.appearanceId ? { ...card, manualOrder: event.payload.manualOrder } : card) };
      }
      return state;
    };

    expect(projectEventLog(initial, eventLog, apply)).toEqual(projectEventLog(initial, eventLog, apply));
  });

  test('participant_updated reste un fait métier et ne change pas l’ordre', () => {
    const state = { cards: [c('A', { resolvedOrder: 0 }), c('B', { resolvedOrder: 1 })], participants: [{ id: 'p1', name: 'Ana' }] };

    const next = applyEvent(state, { type: 'participant_updated', payload: { participantId: 'p1', name: 'Anne' } });

    expect(ids(next)).toEqual(['A', 'B']);
    expect(next.participants).toEqual([{ id: 'p1', participantId: 'p1', name: 'Anne' }]);
  });

  test('link_created crée une contrainte et laisse l’ordre final au resolver', () => {
    const initial = { cards: [c('B', { manualOrder: 0 }), c('A', { manualOrder: 1 })] };
    const transaction = { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'B', anchorTarget: 'A', strategy: 'same_plateau_index' } }] };

    const factOnly = applyTransaction(initial, transaction);
    const resolved = resolveOrderAfterTransaction(factOnly, { transaction });

    expect(ids(factOnly)).toEqual(['B', 'A']);
    expect(factOnly.links).toEqual([{ id: 'A:B', sourceId: 'A', targetId: 'B', anchorTarget: 'A', anchorTargetId: undefined, strategy: 'same_plateau_index', status: 'active' }]);
    expect(ids(resolved)).toEqual(['A', 'B']);
  });

  test('conflict_created crée une contrainte et le resolver applique le conflit', () => {
    const initial = {
      cards: [c('B', { manualOrder: 10 }), c('A', { manualOrder: 20 })],
      links: [{ sourceId: 'A', targetId: 'B' }],
    };
    const transaction = { events: [{ type: 'conflict_created', payload: { sourceId: 'A', targetId: 'B' } }] };

    const factOnly = applyTransaction(initial, transaction);
    const resolved = resolveOrderAfterTransaction(factOnly, { transaction });

    expect(ids(factOnly)).toEqual(['B', 'A']);
    expect(factOnly.conflicts).toEqual([{ id: 'A:B', sourceId: 'A', targetId: 'B', anchorTargetId: undefined, status: 'active' }]);
    expect(ids(resolved)).toEqual(['B', 'A']);
    expect(resolved.orderWarnings).toEqual([{ code: 'LINK_CONFLICT_DIRECT', cardIds: ['A', 'B'] }]);
  });

  test('appearance_moved_between enregistre une intention puis le resolver finalise l’ordre', () => {
    const initial = { cards: [c('B', { manualOrder: 0 }), c('A', { manualOrder: 10 })] };
    const transaction = { events: [{ type: 'appearance_moved_between', payload: { appearanceId: 'A', beforeTargetId: 'B', manualOrder: -1 } }] };

    const factOnly = applyTransaction(initial, transaction);
    const resolved = resolveOrderAfterTransaction(factOnly, { transaction });

    expect(ids(factOnly)).toEqual(['B', 'A']);
    expect(factOnly.cards[1].manualOrderIntent).toEqual({ targetId: 'A', beforeTargetId: 'B', afterTargetId: undefined, anchorTargetId: 'A' });
    expect(ids(resolved)).toEqual(['A', 'B']);
  });

  test('projectJamState rejoue le même event log sans interaction UX avec le même ordre final', () => {
    const initial = { cards: [c('C', { manualOrder: 2 }), c('A', { manualOrder: 0 }), c('B', { manualOrder: 1 })] };
    const eventLog = [
      { events: [{ type: 'appearance_moved_between', payload: { appearanceId: 'C', manualOrder: -1 } }] },
      { events: [{ type: 'link_created', payload: { sourceId: 'C', targetId: 'A', anchorTarget: 'C' } }] },
      { events: [{ type: 'plateau_played', payload: { cardIds: ['C'] } }] },
    ];

    const first = projectJamState(initial, eventLog);
    const second = projectJamState(initial, eventLog);

    expect(first).toEqual(second);
    expect(first.columns).toEqual(second.columns);
    expect(first.columns[0].cards.map((card) => card.id)).toEqual(['C', 'A', 'B']);
  });

  test('helpers exposent des cibles, instruments et tris stables', () => {
    const state = { cards: [
      c('B', { columnId: 'chant', resolvedOrder: 2 }),
      c('A', { columnId: 'chant', resolvedOrder: 1 }),
      c('C', { columnId: 'guitare', status: 'hidden' }),
    ] };

    expect(cardTarget(state.cards[0])).toEqual({ type: 'card', id: 'B' });
    expect(targetKey(cardTarget(state.cards[0]))).toBe('B');
    expect(getInstrumentIdForCard(state.cards[0])).toBe('chant');
    expect(getCardsByInstrument(state).chant.map((card) => card.id)).toEqual(['B', 'A']);
    expect(sortCardsByCurrentResolvedOrder(state.cards).map((card) => card.id)).toEqual(['A', 'B', 'C']);
    expect(isCardActive(state.cards[0])).toBe(true);
    expect(isCardActive(state.cards[2])).toBe(false);
    expect(isCardPlayed({ status: 'played' })).toBe(true);
    expect(isCardLocked({ lockedAt: 1 })).toBe(true);
  });

  test('identifyAnchors prépare les events anchor demandés par le replay', () => {
    const transaction = { events: [
      { type: 'appearance_moved_between', payload: { appearanceId: 'A' } },
      { type: 'hole_moved', payload: { holeId: 'H' } },
      { type: 'link_created', payload: { anchorTarget: { id: 'L' } } },
      { type: 'conflict_created', payload: { anchorTargetId: 'C' } },
      { type: 'participation_added', payload: { newAppearanceIds: ['P', 'P2'] } },
      { type: 'hole_added', payload: { holeId: 'HA' } },
      { type: 'appearance_skipped', payload: { appearanceId: 'S' } },
      { type: 'plateau_played', payload: { cardIds: ['PL'] } },
    ] };

    expect([...identifyAnchors({ transaction })].sort()).toEqual(['A', 'C', 'H', 'HA', 'L', 'P', 'PL', 'S']);
  });

  test('replay identique deux fois', () => {
    const initial = { cards: [c('B', { manualOrder: 2 }), c('A', { manualOrder: 1 })] };
    const tx = { events: [{ type: 'card_moved', payload: { cardId: 'B' } }] };
    const apply = (state) => state;
    expect(applyTransactionAndResolve(initial, tx, apply)).toEqual(applyTransactionAndResolve(initial, tx, apply));
  });

  test('projectEventLog résout globalement après chaque transaction', () => {
    const initial = { cards: [c('B', { manualOrder: 0 }), c('A', { manualOrder: 10 })] };
    const eventLog = [
      { id: 'tx-1', events: [{ type: 'card_moved', payload: { cardId: 'A', manualOrder: -1 } }] },
      { id: 'tx-2', events: [{ type: 'plateau_played', payload: { cardIds: ['A'] } }] },
      { id: 'tx-3', events: [{ type: 'card_moved', payload: { cardId: 'B', manualOrder: -10 } }] },
    ];
    const snapshots = [];
    const apply = (state, event) => {
      const payload = event.payload || {};
      if (event.type === 'card_moved') {
        return { ...state, cards: state.cards.map((card) => card.id === payload.cardId ? { ...card, manualOrder: payload.manualOrder } : card) };
      }
      if (event.type === 'plateau_played') {
        return { ...state, cards: state.cards.map((card) => payload.cardIds.includes(card.id) ? { ...card, played: true } : card) };
      }
      return state;
    };
    const projected = projectEventLog(initial, eventLog, (state, event, context) => {
      const next = apply(state, event, context);
      if (context.eventIndex === eventLog[context.transactionIndex].events.length - 1) {
        snapshots.push(ids(resolveOrderAfterTransaction(next, { transaction: eventLog[context.transactionIndex], events: eventLog[context.transactionIndex].events })));
      }
      return next;
    });

    expect(snapshots).toEqual([['A', 'B'], ['A', 'B'], ['A', 'B']]);
    expect(ids(projected)).toEqual(['A', 'B']);
    expect(projected.cards[0].playedAtPlateauIndex).toBe(0);
    expect(projected.lastResolvedTransactionIndex).toBe(2);
  });

  test('projectEventLog rejoue uniquement les transactions actives pour undo et redo', () => {
    const initial = { cards: [c('A', { manualOrder: 0 }), c('B', { manualOrder: 1 })] };
    const moveBFirst = { id: 'tx-1', events: [{ type: 'card_moved', payload: { cardId: 'B', manualOrder: -1 } }] };
    const apply = (state, event) => ({
      ...state,
      cards: state.cards.map((card) => card.id === event.payload.cardId ? { ...card, manualOrder: event.payload.manualOrder } : card),
    });

    const afterMove = projectEventLog(initial, [moveBFirst], apply);
    const afterUndo = projectEventLog(initial, [{ ...moveBFirst, undone: true }], apply);
    const afterRedo = projectEventLog(initial, [{ ...moveBFirst, undone: false }], apply);

    expect(ids(afterMove)).toEqual(['B', 'A']);
    expect(ids(afterUndo)).toEqual(['A', 'B']);
    expect(afterUndo.lastResolvedTransactionIndex).toBeUndefined();
    expect(afterRedo).toEqual(afterMove);
  });

  test('projectEventLog produit le même tableau final à chaque replay', () => {
    const initial = { cards: [c('C', { manualOrder: 2 }), c('A', { manualOrder: 0 }), c('B', { manualOrder: 1 })] };
    const eventLog = [
      { events: [{ type: 'card_moved', payload: { cardId: 'C', manualOrder: -1 } }] },
      { events: [{ type: 'link_created', payload: { targetId: 'A' } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'card_moved') {
        return { ...state, cards: state.cards.map((card) => card.id === event.payload.cardId ? { ...card, manualOrder: event.payload.manualOrder } : card) };
      }
      if (event.type === 'link_created') {
        return { ...state, links: [{ sourceId: 'A', targetId: 'B' }] };
      }
      return state;
    };

    expect(projectEventLog(initial, eventLog, apply)).toEqual(projectEventLog(initial, eventLog, apply));
  });

  test('plateau_played capture la position courante avant les insertions suivantes', () => {
    const initial = { cards: [c('B', { manualOrder: 0 }), c('A', { manualOrder: 10 })] };
    const eventLog = [
      { events: [{ type: 'plateau_played', payload: { cardIds: ['A'] } }] },
      { events: [{ type: 'participation_added', payload: { newAppearanceIds: ['D'] } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'plateau_played') {
        return { ...state, cards: state.cards.map((card) => event.payload.cardIds.includes(card.id) ? { ...card, played: true } : card) };
      }
      if (event.type === 'participation_added') {
        return { ...state, cards: [...state.cards, c('D', { manualOrder: -10 })] };
      }
      return state;
    };

    const projected = projectEventLog(initial, eventLog, apply);

    expect(ids(projected)).toEqual(['B', 'A', 'D']);
    expect(projected.cards[1].playedAtPlateauIndex).toBe(1);
    expect(projected.cards[1].frozenOrderKey).toBe(1);
    expect(projected.orderWarnings).toEqual([{ code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'D', cardId: 'A' }]);
  });

  test('manual reorder qui tente de passer devant played ou locked produit des warnings déterministes', () => {
    const state = { cards: [
      c('P', { played: true, playedAtPlateauIndex: 0 }),
      c('L', { locked: true, lockedOrderKey: 1 }),
      c('A', { manualOrder: -1 }),
    ] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['P', 'L', 'A']);
    expect(resolved.orderWarnings).toEqual([
      { code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'A', cardId: 'P' },
      { code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'A', cardId: 'L' },
    ]);
  });

  test('link avec cible frozen avertit et ne déplace pas la cible', () => {
    const state = { cards: [c('C', { locked: true, lockedOrderKey: 0 }), c('A', { manualOrder: -1 })], links: [{ sourceId: 'A', targetId: 'C' }] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['C', 'A']);
    expect(resolved.orderWarnings).toEqual([
      { code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'A', cardId: 'C' },
      { code: 'LINKED_CARD_FROZEN', anchorId: 'A', cardId: 'C' },
    ]);
  });

  test('round_revealed n’insère pas de nouvelle appearance avant un frozen sans warning', () => {
    const state = { cards: [
      c('A', { played: true, playedAtPlateauIndex: 0, round: 0 }),
      c('B', { locked: true, lockedOrderKey: 1, round: 1 }),
      c('R', { round: 2, appearanceIndex: 0, manualOrder: -1 }),
    ] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'round_revealed', payload: { round: 2 } }] });

    expect(ids(resolved)).toEqual(['A', 'B', 'R']);
    expect(resolved.orderWarnings).toEqual([]);
  });

});

describe('orderResolution non-regression', () => {
  test('regression: participation ajoutée après des cartes jouées du round 2 reste après le dernier frozen', () => {
    const initial = { cards: [
      c('A', { round: 0, appearanceIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0 }),
      c("B'", { round: 1, appearanceIndex: 1 }),
      c("C'", { round: 1, appearanceIndex: 2 }),
    ] };
    const eventLog = [
      { events: [{ type: 'plateau_played', payload: { cardIds: ['A', 'B', 'C', "A'"] } }] },
      { events: [{ type: 'participation_added', payload: { newAppearanceIds: ['D', "D'"] } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'plateau_played') {
        return { ...state, cards: state.cards.map((card) => event.payload.cardIds.includes(card.id) ? { ...card, played: true } : card) };
      }
      if (event.type === 'participation_added') {
        return { ...state, cards: [...state.cards, c('D', { round: 0, appearanceIndex: 3 }), c("D'", { round: 1, appearanceIndex: 3 })] };
      }
      return state;
    };

    const projected = projectEventLog(initial, eventLog, apply);

    expect(ids(projected)).toEqual(['A', 'B', 'C', "A'", 'D', "B'", "C'", "D'"]);
    expect(projectEventLog(initial, eventLog, apply)).toEqual(projected);
  });

  test('regression: replay mixte undo, link et conflict produit un état et des warnings déterministes', () => {
    const initial = { cards: [
      c('A', { manualOrder: 10 }),
      c('B', { manualOrder: 11 }),
      c('C', { manualOrder: 30 }),
    ] };
    const eventLog = [
      { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'B' } }] },
      { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C' } }] },
      { events: [{ type: 'conflict_created', payload: { sourceId: 'B', targetId: 'C' } }] },
      { undone: true, events: [{ type: 'card_moved', payload: { cardId: 'C', manualOrder: -10 } }] },
      { events: [{ type: 'card_moved', payload: { cardId: 'A', manualOrder: 0 } }] },
    ];
    const apply = (state, event) => {
      if (event.type === 'link_created') {
        return { ...state, links: [...(state.links || []), { sourceId: event.payload.sourceId, targetId: event.payload.targetId }] };
      }
      if (event.type === 'conflict_created') {
        return { ...state, conflicts: [...(state.conflicts || []), { sourceId: event.payload.sourceId, targetId: event.payload.targetId }] };
      }
      if (event.type === 'card_moved') {
        return { ...state, cards: state.cards.map((card) => card.id === event.payload.cardId ? { ...card, manualOrder: event.payload.manualOrder } : card) };
      }
      return state;
    };

    const projected = projectEventLog(initial, eventLog, apply);

    expect(ids(projected)).toEqual(['A', 'B', 'C']);
    expect(projected.orderWarnings).toEqual([{ code: 'LINK_CONFLICT_TRANSITIVE', cardIds: ['B', 'C'], linkCardIds: ['A', 'C'] }]);
    expect(projectEventLog(initial, eventLog, apply)).toEqual(projected);
  });
});

describe('orderResolution hierarchy', () => {
  test("ajout D après A' joué", () => {
    const state = { cards: [
      c('A', { round: 0, appearanceIndex: 0, played: true, playedAtPlateauIndex: 0 }),
      c('B', { round: 0, appearanceIndex: 1, played: true, playedAtPlateauIndex: 1 }),
      c('C', { round: 0, appearanceIndex: 2, played: true, playedAtPlateauIndex: 2 }),
      c("A'", { round: 1, appearanceIndex: 0, played: true, playedAtPlateauIndex: 3 }),
      c("B'", { round: 1, appearanceIndex: 1 }),
      c("C'", { round: 1, appearanceIndex: 2 }),
      c('D', { round: 0, appearanceIndex: 3 }),
      c("D'", { round: 1, appearanceIndex: 3 }),
    ] };
    expect(ids(resolveOrderAfterTransaction(state))).toEqual(['A', 'B', 'C', "A'", 'D', "B'", "C'", "D'"]);
  });

  test('appearance_skipped reste une décision d’appel ancrée', () => {
    const state = { cards: [c('S', { manualOrder: 20 }), c('B', { manualOrder: 30 })] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'appearance_skipped', payload: { appearanceId: 'S' } }] });

    expect(ids(resolved)).toEqual(['S', 'B']);
  });

  test('appearance_replaced utilise la replacementAppearanceId comme anchor de décision', () => {
    const state = { cards: [c('A', { manualOrder: 20 }), c('R', { manualOrder: 5 }), c('B', { manualOrder: 30 })] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'appearance_replaced', payload: { replacementAppearanceId: 'R' } }] });

    expect(ids(resolved)).toEqual(['R', 'A', 'B']);
  });

  test('replacement_selected est traité comme décision d’appel et suit les links mobiles', () => {
    const state = { cards: [c('R', { manualOrder: 20 }), c('C', { manualOrder: 10 }), c('B', { manualOrder: 30 })], links: [{ sourceId: 'R', targetId: 'C' }] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'replacement_selected', payload: { replacementAppearanceId: 'R' } }] });

    expect(ids(resolved)).toEqual(['R', 'C', 'B']);
  });

  test('without_musician_selected respecte locked avec warning déterministe', () => {
    const state = { cards: [c('L', { locked: true, lockedOrderKey: 0 }), c('A', { manualOrder: -1 })] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'without_musician_selected', payload: { appearanceId: 'A' } }] });

    expect(ids(resolved)).toEqual(['L', 'A']);
    expect(resolved.orderWarnings).toEqual([{ code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'A', cardId: 'L' }]);
  });

  test('appearance_moved_between définit l’anchor du déplacement manuel avec conflict mobile', () => {
    const state = { cards: [c('A', { manualOrder: 20 }), c('B', { manualOrder: 10 }), c('C', { manualOrder: 30 })], conflicts: [{ sourceId: 'A', targetId: 'B' }] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'appearance_moved_between', payload: { appearanceId: 'A' } }] });

    expect(ids(resolved)).toEqual(['A', 'B', 'C']);
  });

  test('manual_order_changed respecte une frontière locked avec warning déterministe', () => {
    const state = { cards: [c('L', { locked: true, lockedOrderKey: 0 }), c('A', { manualOrder: -1 })] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'manual_order_changed', payload: { cardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['L', 'A']);
    expect(resolved.orderWarnings).toEqual([{ code: 'FROZEN_BOUNDARY_BLOCKED', anchorId: 'A', cardId: 'L' }]);
  });

  test('manual_drag conserve le follower linké derrière son anchor', () => {
    const state = { cards: [c('A', { manualOrder: 20 }), c('C', { manualOrder: 10 }), c('B', { manualOrder: 30 })], links: [{ sourceId: 'A', targetId: 'C' }] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'manual_drag', payload: { movedCardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['A', 'C', 'B']);
  });

  test('drag avec conflict, target mobile', () => {
    const state = { cards: [c('A', { manualOrder: 20 }), c('B', { manualOrder: 10 }), c('C', { manualOrder: 30 })], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['A', 'B', 'C']);
  });

  test('drag avec conflict, target played', () => {
    const state = { cards: [c('B', { played: true, playedAtPlateauIndex: 0 }), c('A', { manualOrder: 0 })], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['B', 'A']);
  });

  test('drag avec conflict, target locked', () => {
    const state = { cards: [c('B', { locked: true, lockedOrderKey: 0 }), c('A', { manualOrder: 0 })], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['B', 'A']);
  });

  test('drag d’une card linkée', () => {
    const state = { cards: [c('A', { manualOrder: 20 }), c('C', { manualOrder: 10 }), c('B', { manualOrder: 30 })], links: [{ sourceId: 'A', targetId: 'C' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['A', 'C', 'B']);
  });

  test('drag d’une card linkée avec conflict externe', () => {
    const state = { cards: [c('A', { manualOrder: 30 }), c('C', { manualOrder: 10 }), c('B', { manualOrder: 20 })], links: [{ sourceId: 'A', targetId: 'C' }], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['A', 'C', 'B']);
  });


  test('conflict gagne contre un link transitif incompatible', () => {
    const state = {
      cards: [c('A', { manualOrder: 10 }), c('B', { manualOrder: 11 }), c('C', { manualOrder: 30 })],
      links: [{ sourceId: 'A', targetId: 'B' }, { sourceId: 'A', targetId: 'C' }],
      conflicts: [{ sourceId: 'B', targetId: 'C' }],
    };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['A', 'B', 'C']);
    expect(resolved.orderWarnings).toEqual([{ code: 'LINK_CONFLICT_TRANSITIVE', cardIds: ['B', 'C'], linkCardIds: ['A', 'C'] }]);
  });

  test('conflict direct gagne contre link direct sans warning transitif en double', () => {
    const state = { cards: [c('B', { manualOrder: 10 }), c('A', { manualOrder: 20 })], links: [{ sourceId: 'A', targetId: 'B' }], conflicts: [{ sourceId: 'A', targetId: 'B' }] };

    const resolved = resolveOrderAfterTransaction(state, { events: [{ type: 'card_moved', payload: { cardId: 'A' } }] });

    expect(ids(resolved)).toEqual(['A', 'B']);
    expect(resolved.orderWarnings).toEqual([{ code: 'LINK_CONFLICT_DIRECT', cardIds: ['A', 'B'] }]);
  });
  test('link direct refusé si conflict direct', () => {
    const state = { cards: [c('B', { manualOrder: 10 }), c('A', { manualOrder: 20 })], links: [{ sourceId: 'A', targetId: 'B' }], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    const resolved = resolveOrderAfterTransaction(state);
    expect(ids(resolved)).toEqual(['B', 'A']);
    expect(resolved.orderWarnings).toEqual([{ code: 'LINK_CONFLICT_DIRECT', cardIds: ['A', 'B'] }]);
  });

  test('lock empêchant une insertion de passer devant', () => {
    const state = { cards: [c('L', { locked: true, lockedOrderKey: 0 }), c('N', { manualOrder: -1 })] };
    expect(ids(resolveOrderAfterTransaction(state))).toEqual(['L', 'N']);
  });

  test('link_removed et conflict_removed ne provoquent pas de retour magique', () => {
    const state = { cards: [c('A', { manualOrder: 0 }), c('B', { manualOrder: 1 }), c('C', { manualOrder: 2 })], links: [], conflicts: [] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'link_removed', payload: { sourceId: 'A', targetId: 'B' } }, { type: 'conflict_removed', payload: { sourceId: 'B', targetId: 'C' } }] }))).toEqual(['A', 'B', 'C']);
  });

  test('round_revealed respecte played/locked/manual/link/conflict', () => {
    const state = { cards: [
      c('P', { played: true, playedAtPlateauIndex: 0, round: 1 }),
      c('L', { locked: true, lockedOrderKey: 1, round: 1 }),
      c('A', { manualOrder: 5, round: 2 }),
      c('C', { manualOrder: 6, round: 0 }),
      c('B', { manualOrder: 7, round: 0 }),
      c('R', { round: 0, appearanceIndex: 0 }),
    ], links: [{ sourceId: 'A', targetId: 'C' }], conflicts: [{ sourceId: 'A', targetId: 'B' }] };
    expect(ids(resolveOrderAfterTransaction(state, { events: [{ type: 'round_revealed', payload: { round: 2 } }, { type: 'card_moved', payload: { cardId: 'A' } }] }))).toEqual(['P', 'L', 'A', 'C', 'B', 'R']);
  });
});

describe('orderResolution links plateauIndex', () => {
  const card = (id, columnId, extra = {}) => c(id, { columnId, ...extra });
  const getCardPlateauIndex = (state, instrumentId, cardId) => {
    const column = state.cards.filter((item) => item.columnId === instrumentId);
    return column.findIndex((item) => item.id === cardId);
  };
  const project = (initial, eventLog) => projectEventLog(initial, eventLog, (state, event) => {
    const payload = event.payload || {};
    if (event.type === 'link_created') {
      return { ...state, links: [...(state.links || []), { sourceId: payload.sourceId, targetId: payload.targetId, anchorTarget: payload.anchorTarget, status: 'active' }] };
    }
    if (event.type === 'conflict_created') {
      return { ...state, conflicts: [...(state.conflicts || []), { sourceId: payload.sourceId, targetId: payload.targetId }] };
    }
    if (event.type === 'card_moved') {
      return { ...state, cards: state.cards.map((item) => item.id === payload.cardId ? { ...item, manualOrder: payload.manualOrder } : item) };
    }
    if (event.type === 'without_musician_selected') {
      return { ...state, cards: [...state.cards, card(payload.holeId, payload.columnId, { manualOrder: payload.manualOrder })], links: [...(state.links || []), { sourceId: payload.appearanceId, targetId: payload.holeId, anchorTarget: payload.appearanceId, status: 'active' }] };
    }
    return state;
  });

  test('link_created aligne deux appearances sur la même ligne visible', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 0 }), card('B', 'chant', { manualOrder: 1 }), card('C', 'chant', { manualOrder: 2 }), card('X', 'guitare', { manualOrder: 0 }), card('Y', 'guitare', { manualOrder: 1 }), card('Z', 'guitare', { manualOrder: 2 })] };
    const projected = project(initial, [{ events: [{ type: 'link_created', payload: { sourceId: 'B', targetId: 'Z', anchorTarget: 'B' } }] }]);
    expect(getCardPlateauIndex(projected, 'chant', 'B')).toBe(getCardPlateauIndex(projected, 'guitare', 'Z'));
  });

  test('link avec colonnes de tailles différentes réorganise autour du follower', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 0 }), card('B', 'chant', { manualOrder: 1 }), card('X', 'guitare', { manualOrder: 0 }), card('Y', 'guitare', { manualOrder: 1 }), card('Z', 'guitare', { manualOrder: 2 }), card('T', 'guitare', { manualOrder: 3 })] };
    const projected = project(initial, [{ events: [{ type: 'link_created', payload: { sourceId: 'B', targetId: 'T', anchorTarget: 'B' } }] }]);
    expect(getCardPlateauIndex(projected, 'chant', 'B')).toBe(getCardPlateauIndex(projected, 'guitare', 'T'));
    expect(projected.cards.filter((item) => item.columnId === 'guitare').map((item) => item.id)).toEqual(['X', 'T', 'Y', 'Z']);
  });

  test('drag d’une card linkée conserve le groupe au même plateauIndex', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 0 }), card('B', 'chant', { manualOrder: 1 }), card('C', 'guitare', { manualOrder: 0 }), card('D', 'guitare', { manualOrder: 1 })] };
    const projected = project(initial, [
      { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C', anchorTarget: 'A' } }] },
      { events: [{ type: 'card_moved', payload: { cardId: 'A', manualOrder: 10 } }] },
    ]);
    expect(getCardPlateauIndex(projected, 'chant', 'A')).toBe(getCardPlateauIndex(projected, 'guitare', 'C'));
  });

  test('link ne déplace pas played', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 1 }), card('B', 'chant', { manualOrder: 0 }), card('C', 'guitare', { manualOrder: 0, played: true, playedAtPlateauIndex: 0 }), card('D', 'guitare', { manualOrder: 1 })] };
    const projected = project(initial, [{ events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C', anchorTarget: 'A' } }] }]);
    expect(getCardPlateauIndex(projected, 'guitare', 'C')).toBe(0);
    expect(projected.links[0]).toMatchObject({ status: 'suppressed', suppressedByConflict: true });
    expect(projected.orderWarnings).toContainEqual({ code: 'LINKED_CARD_FROZEN', anchorId: 'A', cardId: 'C' });
  });

  test('link ne déplace pas locked', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 1 }), card('B', 'chant', { manualOrder: 0 }), card('C', 'guitare', { manualOrder: 0, locked: true, lockedOrderKey: 0 }), card('D', 'guitare', { manualOrder: 1 })] };
    const projected = project(initial, [{ events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C', anchorTarget: 'A' } }] }]);
    expect(getCardPlateauIndex(projected, 'guitare', 'C')).toBe(0);
    expect(projected.links[0]).toMatchObject({ status: 'suppressed', suppressedByConflict: true });
  });

  test('conflict gagne contre link et désactive le link affichable', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 0 }), card('C', 'guitare', { manualOrder: 1 })] };
    const projected = project(initial, [
      { events: [{ type: 'conflict_created', payload: { sourceId: 'A', targetId: 'C' } }] },
      { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C', anchorTarget: 'A' } }] },
    ]);
    expect(projected.links[0]).toMatchObject({ status: 'suppressed', suppressedByConflict: true });
    expect(projected.orderWarnings).toContainEqual({ code: 'LINK_CONFLICT_DIRECT', cardIds: ['A', 'C'] });
  });

  test('play without aligne le hole et la source', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 1 }), card('B', 'chant', { manualOrder: 0 }), card('X', 'guitare', { manualOrder: 0 }), card('Y', 'guitare', { manualOrder: 1 })] };
    const projected = project(initial, [{ events: [{ type: 'without_musician_selected', payload: { appearanceId: 'A', holeId: 'A-hole', columnId: 'guitare', manualOrder: 10 } }] }]);
    expect(getCardPlateauIndex(projected, 'chant', 'A')).toBe(getCardPlateauIndex(projected, 'guitare', 'A-hole'));
  });

  test('replay déterministe avec link_created et drag linké', () => {
    const initial = { cards: [card('A', 'chant', { manualOrder: 0 }), card('B', 'chant', { manualOrder: 1 }), card('C', 'guitare', { manualOrder: 0 }), card('D', 'guitare', { manualOrder: 1 })] };
    const eventLog = [
      { events: [{ type: 'link_created', payload: { sourceId: 'A', targetId: 'C', anchorTarget: 'A' } }] },
      { events: [{ type: 'card_moved', payload: { cardId: 'A', manualOrder: 10 } }] },
    ];
    expect(project(initial, eventLog)).toEqual(project(initial, eventLog));
  });
});
