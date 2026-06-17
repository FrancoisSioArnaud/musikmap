const { projectJamState } = require("../projection/projectJamState");
const { addPendingTransaction, getBaseState, getMergedTransactions, getPendingTransactions, persistServerPayload } = require("../sync/localDb");

function reloadFromLocalDb(jamId) {
  const transactions = getMergedTransactions(jamId);
  const projection = projectJamState(getBaseState(jamId), transactions);
  return {
    jamId,
    projection,
    pendingTransactions: getPendingTransactions(jamId),
    transactions,
  };
}

function hydrateFromPayload(jamId, payload) {
  persistServerPayload(jamId, payload);
  return reloadFromLocalDb(jamId);
}

function applyLocalTransaction(jamId, transaction) {
  addPendingTransaction(jamId, transaction);
  return reloadFromLocalDb(jamId);
}

module.exports = {
  applyLocalTransaction,
  hydrateFromPayload,
  reloadFromLocalDb,
};
