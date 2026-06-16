const { resolveOrderAfterTransaction, applyTransactionAndResolve } = require('./orderResolution');

const ids = (state) => state.cards.map((card) => card.id);
const c = (id, extra = {}) => ({ id, round: 0, appearanceIndex: 0, baseOrder: 0, ...extra });

describe('orderResolution', () => {
  test('replay identique deux fois', () => {
    const initial = { cards: [c('B', { manualOrder: 2 }), c('A', { manualOrder: 1 })] };
    const tx = { events: [{ type: 'card_moved', payload: { cardId: 'B' } }] };
    const apply = (state) => state;
    expect(applyTransactionAndResolve(initial, tx, apply)).toEqual(applyTransactionAndResolve(initial, tx, apply));
  });

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
