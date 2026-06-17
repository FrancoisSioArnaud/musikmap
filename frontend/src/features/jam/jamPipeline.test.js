const { resetLocalDb } = require("../sync/localDb");

const { applyLocalTransaction, hydrateFromPayload, reloadFromLocalDb } = require("./jamStore");

const tx = (id, events, extra = {}) => ({ id, transactionId: id, events, ...extra });
const card = (id, columnId = "chant", extra = {}) => ({ id, columnId, round: 0, appearanceIndex: 0, baseOrder: 0, ...extra });

function bootstrap(jamId, cards) {
  return hydrateFromPayload(jamId, { initialState: { cards }, transactions: [] });
}

function getCardPlateauIndex(projection, instrumentId, cardId) {
  const column = projection.columns.find((item) => item.instrument && item.instrument.instrumentId === instrumentId);
  return column ? column.cards.findIndex((item) => item.id === cardId) : -1;
}

function expectRefreshStable(jamId, beforeReload) {
  const afterReload = reloadFromLocalDb(jamId);
  expect(afterReload.projection.columns).toEqual(beforeReload.projection.columns);
  return afterReload;
}

describe("jam full local-first pipeline", () => {
  beforeEach(() => {
    resetLocalDb();
  });

  test("link créé puis refresh conserve le même plateauIndex", () => {
    const jamId = "pipeline-link";
    bootstrap(jamId, [
      card("A", "chant", { appearanceIndex: 0 }),
      card("B", "chant", { appearanceIndex: 1 }),
      card("C", "chant", { appearanceIndex: 2 }),
      card("X", "guitare", { appearanceIndex: 0 }),
      card("Y", "guitare", { appearanceIndex: 1 }),
      card("Z", "guitare", { appearanceIndex: 2 }),
    ]);

    const beforeReload = applyLocalTransaction(jamId, tx("link-B-Z", [{ type: "link_created", payload: { sourceId: "B", targetId: "Z", anchorTarget: "B" } }]));

    expect(getCardPlateauIndex(beforeReload.projection, "chant", "B")).toBe(getCardPlateauIndex(beforeReload.projection, "guitare", "Z"));
    const afterReload = expectRefreshStable(jamId, beforeReload);
    expect(getCardPlateauIndex(afterReload.projection, "chant", "B")).toBe(getCardPlateauIndex(afterReload.projection, "guitare", "Z"));
  });

  test("drag linké puis refresh conserve le follower au même plateauIndex", () => {
    const jamId = "pipeline-drag-link";
    bootstrap(jamId, [
      card("A", "chant", { manualOrder: 0 }),
      card("B", "chant", { manualOrder: 1 }),
      card("C", "guitare", { manualOrder: 0 }),
      card("D", "guitare", { manualOrder: 1 }),
    ]);

    applyLocalTransaction(jamId, tx("link-A-C", [{ type: "link_created", payload: { sourceId: "A", targetId: "C", anchorTarget: "A" } }]));
    const beforeReload = applyLocalTransaction(jamId, tx("drag-A", [{ type: "appearance_moved_between", payload: { appearanceId: "A", manualOrder: 10 } }]));

    expect(getCardPlateauIndex(beforeReload.projection, "chant", "A")).toBe(getCardPlateauIndex(beforeReload.projection, "guitare", "C"));
    expectRefreshStable(jamId, beforeReload);
  });

  test("played A' puis ajout D puis refresh conserve l’ordre visible", () => {
    const jamId = "pipeline-played-add";
    bootstrap(jamId, [
      card("A", "chant", { round: 0, appearanceIndex: 0 }),
      card("B", "chant", { round: 0, appearanceIndex: 1 }),
      card("C", "chant", { round: 0, appearanceIndex: 2 }),
      card("A'", "chant", { round: 1, appearanceIndex: 0 }),
      card("B'", "chant", { round: 1, appearanceIndex: 1 }),
      card("C'", "chant", { round: 1, appearanceIndex: 2 }),
    ]);

    applyLocalTransaction(jamId, tx("played-prefix", [{ type: "plateau_played", payload: { cardIds: ["A", "B", "C", "A'"] } }]));
    const beforeReload = applyLocalTransaction(jamId, tx("add-D", [{ type: "participation_added", payload: { appearances: [card("D", "chant", { round: 0, appearanceIndex: 3 }), card("D'", "chant", { round: 1, appearanceIndex: 3 })] } }]));

    expect(beforeReload.projection.columns[0].cards.map((item) => item.id)).toEqual(["A", "B", "C", "A'", "D", "B'", "C'", "D'"]);
    expectRefreshStable(jamId, beforeReload);
  });

  test("conflict + drag puis refresh garde l’anchor et la cible mobile", () => {
    const jamId = "pipeline-conflict-drag";
    bootstrap(jamId, [card("A", "chant", { manualOrder: 20 }), card("B", "chant", { manualOrder: 10 }), card("C", "chant", { manualOrder: 30 })]);

    applyLocalTransaction(jamId, tx("conflict-A-B", [{ type: "conflict_created", payload: { sourceId: "A", targetId: "B" } }]));
    const beforeReload = applyLocalTransaction(jamId, tx("drag-A", [{ type: "appearance_moved_between", payload: { appearanceId: "A" } }]));

    expect(beforeReload.projection.columns[0].cards.map((item) => item.id)).toEqual(["A", "B", "C"]);
    expectRefreshStable(jamId, beforeReload);
  });

  test("lock + ajout puis refresh ne déplace pas la card locked", () => {
    const jamId = "pipeline-lock-add";
    bootstrap(jamId, [
      card("A", "chant", { round: 0, appearanceIndex: 0 }),
      card("B", "chant", { round: 0, appearanceIndex: 1 }),
      card("C", "chant", { round: 0, appearanceIndex: 2 }),
      card("A'", "chant", { round: 1, appearanceIndex: 0 }),
      card("B'", "chant", { round: 1, appearanceIndex: 1 }),
      card("C'", "chant", { round: 1, appearanceIndex: 2 }),
    ]);

    applyLocalTransaction(jamId, tx("lock-A2", [{ type: "lock_toggled", payload: { appearanceId: "A'", locked: true } }]));
    const beforeReload = applyLocalTransaction(jamId, tx("add-D", [{ type: "participation_added", payload: { appearances: [card("D", "chant", { round: 0, appearanceIndex: 3 })] } }]));

    expect(getCardPlateauIndex(beforeReload.projection, "chant", "A'")).toBe(3);
    expectRefreshStable(jamId, beforeReload);
  });

  test("play without puis refresh aligne l’apparence et le hole", () => {
    const jamId = "pipeline-without";
    bootstrap(jamId, [
      card("A", "chant", { manualOrder: 1 }),
      card("B", "chant", { manualOrder: 0 }),
      card("X", "guitare", { manualOrder: 0 }),
      card("Y", "guitare", { manualOrder: 1 }),
    ]);

    const beforeReload = applyLocalTransaction(jamId, tx("without-A", [
      { type: "hole_added", payload: { holeId: "A-hole", columnId: "guitare", manualOrder: 10 } },
      { type: "link_created", payload: { sourceId: "A", targetId: "A-hole", anchorTarget: "A" } },
    ]));

    expect(getCardPlateauIndex(beforeReload.projection, "chant", "A")).toBe(getCardPlateauIndex(beforeReload.projection, "guitare", "A-hole"));
    expectRefreshStable(jamId, beforeReload);
  });

  test("undo puis refresh retire le link et conserve un ordre déterministe", () => {
    const jamId = "pipeline-undo";
    bootstrap(jamId, [card("A", "chant", { manualOrder: 0 }), card("B", "chant", { manualOrder: 1 })]);

    applyLocalTransaction(jamId, tx("link-A-B", [{ type: "link_created", payload: { sourceId: "A", targetId: "B", anchorTarget: "A" } }]));
    const beforeReload = applyLocalTransaction(jamId, tx("link-A-B", [{ type: "link_created", payload: { sourceId: "A", targetId: "B", anchorTarget: "A" } }], { undone: true }));

    expect(beforeReload.projection.links || []).toEqual([]);
    expect(beforeReload.projection.columns[0].cards.map((item) => item.id)).toEqual(["A", "B"]);
    expectRefreshStable(jamId, beforeReload);
  });

  test("actions de structure diverses restent stables après refresh", () => {
    const jamId = "pipeline-misc-actions";
    bootstrap(jamId, [card("A", "chant", { participantId: "p1" }), card("B", "chant")]);

    const beforeReload = applyLocalTransaction(jamId, tx("misc", [
      { type: "participant_updated", payload: { participantId: "p1", name: "Anne" } },
      { type: "round_revealed", payload: { round: 1 } },
      { type: "appearance_skipped", payload: { appearanceId: "B" } },
      { type: "link_created", payload: { sourceId: "A", targetId: "B", anchorTarget: "A" } },
      { type: "link_removed", payload: { sourceId: "A", targetId: "B" } },
      { type: "conflict_created", payload: { sourceId: "A", targetId: "B" } },
      { type: "conflict_removed", payload: { sourceId: "A", targetId: "B" } },
      { type: "participant_left", payload: { participantId: "p1" } },
    ]));

    expect(beforeReload.projection.participants).toEqual([{ id: "p1", participantId: "p1", name: "Anne" }]);
    expect(beforeReload.projection.cards.find((item) => item.id === "A")).toBeUndefined();
    expect(beforeReload.projection.cards.find((item) => item.id === "B")).toMatchObject({ appearanceSkipped: true });
    expectRefreshStable(jamId, beforeReload);
  });
});
