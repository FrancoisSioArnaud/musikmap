const jams = new Map();

function transactionId(transaction) {
  return transaction && (transaction.transactionId || transaction.id || transaction.clientTransactionId);
}

function transactionSequence(transaction, fallbackIndex) {
  const serverSequence = transaction && (transaction.serverSequenceNumberStart ?? transaction.serverSequenceNumber);
  if (Number.isFinite(serverSequence)) {return [0, serverSequence, fallbackIndex];}
  const localSequence = transaction && (transaction.localSequence ?? transaction.localCreatedAt ?? transaction.createdAt);
  return [1, Number.isFinite(localSequence) ? localSequence : fallbackIndex, fallbackIndex];
}

function compareTransactions(left, right) {
  const leftKey = transactionSequence(left.transaction, left.index);
  const rightKey = transactionSequence(right.transaction, right.index);
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] < rightKey[index]) {return -1;}
    if (leftKey[index] > rightKey[index]) {return 1;}
  }
  return String(transactionId(left.transaction)).localeCompare(String(transactionId(right.transaction)));
}

function normalizeBaseState(payload) {
  if (payload && payload.initialState) {return payload.initialState;}
  if (payload && payload.state) {return payload.state;}
  if (payload && payload.cards) {return { cards: payload.cards };}
  return { cards: [] };
}

function serverTransactionsFromPayload(payload) {
  return Array.isArray(payload && payload.transactions) ? payload.transactions : [];
}

function getJamRecord(jamId) {
  const key = String(jamId);
  if (!jams.has(key)) {
    jams.set(key, { baseState: { cards: [] }, transactions: new Map(), insertionIndex: 0 });
  }
  return jams.get(key);
}

function cloneTransaction(transaction) {
  return { ...transaction, events: Array.isArray(transaction && transaction.events) ? transaction.events.map((event) => ({ ...event, payload: { ...(event.payload || {}) } })) : [] };
}

function putTransaction(record, transaction, defaults = {}) {
  const id = transactionId(transaction);
  if (!id) {return;}
  const previous = record.transactions.get(id);
  const insertionIndex = previous ? previous.insertionIndex : record.insertionIndex;
  record.transactions.set(id, {
    transaction: { ...(previous && previous.transaction), ...cloneTransaction(transaction), ...defaults },
    insertionIndex,
  });
  if (!previous) {record.insertionIndex += 1;}
}

function resetLocalDb() {
  jams.clear();
}

function addPendingTransaction(jamId, transaction) {
  const record = getJamRecord(jamId);
  putTransaction(record, transaction, { syncStatus: "pending" });
}

function persistServerPayload(jamId, payload) {
  const record = getJamRecord(jamId);
  record.baseState = normalizeBaseState(payload);
  serverTransactionsFromPayload(payload).forEach((transaction) => {
    putTransaction(record, transaction, { syncStatus: "synced" });
  });
}

function getMergedTransactions(jamId) {
  const record = getJamRecord(jamId);
  return [...record.transactions.values()]
    .map((entry) => ({ transaction: entry.transaction, index: entry.insertionIndex }))
    .sort(compareTransactions)
    .map((entry) => cloneTransaction(entry.transaction));
}

function getPendingTransactions(jamId) {
  return getMergedTransactions(jamId).filter((transaction) => transaction.syncStatus === "pending");
}

function getBaseState(jamId) {
  return getJamRecord(jamId).baseState;
}

module.exports = {
  addPendingTransaction,
  getBaseState,
  getMergedTransactions,
  getPendingTransactions,
  persistServerPayload,
  resetLocalDb,
  transactionId,
};
