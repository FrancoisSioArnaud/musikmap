const TTL_MS = 60 * 60 * 1000;
const PROFILE_PREFIX = "mm_page_state:profile:";

function safeGetStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildPayload(partial) {
  return {
    savedAt: Date.now(),
    ...partial,
  };
}

function isFresh(payload) {
  return Boolean(
    payload &&
      typeof payload.savedAt === "number" &&
      Date.now() - payload.savedAt <= TTL_MS
  );
}

function readRaw(key) {
  const storage = safeGetStorage();
  if (!storage || !key) {return null;}

  try {
    const raw = storage.getItem(key);
    if (!raw) {return null;}
    const parsed = JSON.parse(raw);
    if (!isFresh(parsed)) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(key);
    } catch {}
    return null;
  }
}

function writeRaw(key, payload) {
  const storage = safeGetStorage();
  if (!storage || !key) {return;}

  try {
    storage.setItem(key, JSON.stringify(buildPayload(payload)));
  } catch {}
}

export function getProfilePageStateKey(locationLike) {
  const pathname = locationLike?.pathname || "";
  const search = locationLike?.search || "";
  return `${PROFILE_PREFIX}${pathname}${search}`;
}

export function readPageState(key) {
  return readRaw(key);
}

export function saveProfileTabState(key, tab) {
  const prev = readRaw(key) || {};
  writeRaw(key, {
    ...prev,
    tab: typeof tab === "number" ? tab : 0,
  });
}
