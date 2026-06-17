const { getPendingTransactions } = require("./localDb");

function getPendingSyncQueue(jamId) {
  return getPendingTransactions(jamId);
}

module.exports = {
  getPendingSyncQueue,
};
