const { addPendingTransaction, getPendingTransactions, resetLocalDb } = require("../sync/localDb");

const { hydrateFromPayload } = require("./jamStore");

const cardIds = (state) => state.projection.cards.map((card) => card.id);
const tx = (id, events, extra = {}) => ({ id, transactionId: id, events, ...extra });
const addCard = (id, extra = {}) => ({ type: "participation_added", payload: { appearances: [{ id, round: 0, appearanceIndex: extra.appearanceIndex ?? 0, ...extra }] } });

describe("jamStore local-first hydration", () => {
  beforeEach(() => {
    resetLocalDb();
  });

  test("hydrate serveur conserve une transaction locale pending absente du payload", () => {
    addPendingTransaction("jam-1", tx("A", [addCard("A")], { localSequence: 1 }));

    const hydrated = hydrateFromPayload("jam-1", { initialState: { cards: [] }, transactions: [] });

    expect(cardIds(hydrated)).toEqual(["A"]);
    expect(getPendingTransactions("jam-1").map((transaction) => transaction.id)).toEqual(["A"]);
  });

  test("hydrate serveur ack une pending sans dupliquer la projection", () => {
    addPendingTransaction("jam-1", tx("A", [addCard("A")], { localSequence: 1 }));

    const hydrated = hydrateFromPayload("jam-1", {
      initialState: { cards: [] },
      transactions: [tx("A", [addCard("A")], { serverSequenceNumberStart: 1 })],
    });

    expect(cardIds(hydrated)).toEqual(["A"]);
    expect(hydrated.transactions).toHaveLength(1);
    expect(hydrated.transactions[0]).toMatchObject({ id: "A", syncStatus: "synced", serverSequenceNumberStart: 1 });
    expect(getPendingTransactions("jam-1")).toEqual([]);
  });

  test("ordre déterministe avec transactions serveur puis pending après refresh", () => {
    const payload = {
      initialState: { cards: [] },
      transactions: [
        tx("A", [addCard("A", { appearanceIndex: 0 })], { serverSequenceNumberStart: 1 }),
        tx("B", [addCard("B", { appearanceIndex: 1 })], { serverSequenceNumberStart: 2 }),
      ],
    };
    addPendingTransaction("jam-1", tx("C", [addCard("C", { appearanceIndex: 2 })], { localSequence: 1 }));

    const first = hydrateFromPayload("jam-1", payload);
    const second = hydrateFromPayload("jam-1", payload);

    expect(cardIds(first)).toEqual(["A", "B", "C"]);
    expect(cardIds(second)).toEqual(["A", "B", "C"]);
    expect(second.projection.columns[0].cards.map((card) => card.id)).toEqual(["A", "B", "C"]);
  });

  test("hydrate applique toujours le resolver avec serveur et pending locale", () => {
    const payload = {
      initialState: { cards: [] },
      transactions: [
        tx("seed", [
          addCard("A", { appearanceIndex: 0 }),
          addCard("B", { appearanceIndex: 1 }),
        ], { serverSequenceNumberStart: 1 }),
        tx("link", [{ type: "link_created", payload: { sourceId: "A", targetId: "B", anchorTarget: "A" } }], { serverSequenceNumberStart: 2 }),
        tx("played", [{ type: "plateau_played", payload: { cardIds: ["A"] } }], { serverSequenceNumberStart: 3 }),
      ],
    };
    addPendingTransaction("jam-1", tx("pending-C", [addCard("C", { appearanceIndex: 2 })], { localSequence: 1 }));

    const hydrated = hydrateFromPayload("jam-1", payload);

    expect(cardIds(hydrated)).toEqual(["A", "B", "C"]);
    expect(hydrated.projection.cards[0]).toMatchObject({ id: "A", played: true, playedAtPlateauIndex: 0 });
    expect(hydrated.projection.orderWarnings).toEqual([]);
  });
});
