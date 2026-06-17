const { applyTransaction } = require("./applyEvent");
const { resolveOrderAfterTransaction, sortCardsByCurrentResolvedOrder } = require("./orderResolution");

function materializeCalculatedAppearances(state) {
  return state;
}

function isTransactionActive(transaction) {
  return !(transaction && (transaction.undone || transaction.reverted || transaction.active === false));
}

function buildColumns(state) {
  const cards = Array.isArray(state && state.cards) ? state.cards : [];
  const columns = cards.reduce((acc, card) => {
    const instrumentId = card.columnId || card.instrumentId || card.column || "default";
    if (!acc[instrumentId]) {
      acc[instrumentId] = { instrument: { instrumentId }, instrumentId, cards: [] };
    }
    acc[instrumentId].cards.push(card);
    return acc;
  }, {});
  return {
    ...state,
    columns: Object.values(columns).map((column) => ({
      ...column,
      cards: sortCardsByCurrentResolvedOrder(column.cards),
    })),
  };
}

function projectJamState(initialState = {}, transactions = []) {
  const projected = (Array.isArray(transactions) ? transactions : []).reduce((state, transaction) => {
    if (!isTransactionActive(transaction)) {return state;}

    const applied = applyTransaction(state, transaction);
    const materialized = materializeCalculatedAppearances(applied);
    return resolveOrderAfterTransaction(materialized, { transaction });
  }, initialState);

  return buildColumns(projected);
}

module.exports = {
  projectJamState,
  materializeCalculatedAppearances,
  buildColumns,
};
