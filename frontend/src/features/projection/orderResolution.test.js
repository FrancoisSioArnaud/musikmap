const { resolveOrderAfterTransaction, applyTransactionAndResolve, projectEventLog } = require('./orderResolution');

const ids = (state) => state.cards.map((card) => card.id);
const c = (id, extra = {}) => ({ id, round: 0, appearanceIndex: 0, baseOrder: 0, ...extra });

describe('orderResolution', () => {
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
