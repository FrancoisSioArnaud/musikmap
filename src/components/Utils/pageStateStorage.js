const TTL_MS = 60 * 60 * 1000;
const DISCOVER_PREFIX = "mm_page_state:discover:";
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
  if (!storage || !key) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
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
  if (!storage || !key) return;

  try {
    storage.setItem(key, JSON.stringify(buildPayload(payload)));
  } catch {}
}

export function getDiscoverPageStateKey(locationLike) {
  const pathname = locationLike?.pathname || "";
  const search = locationLike?.search || "";
  return `${DISCOVER_PREFIX}${pathname}${search}`;
}

export function getProfilePageStateKey(locationLike) {
  const pathname = locationLike?.pathname || "";
  const search = locationLike?.search || "";
  return `${PROFILE_PREFIX}${pathname}${search}`;
}

export function readPageState(key) {
  return readRaw(key);
}

export function savePageScroll(key, y) {
  const prev = readRaw(key) || {};
  writeRaw(key, {
    ...prev,
    scrollY: typeof y === "number" ? y : 0,
  });
}

export function saveProfileTabState(key, tab) {
  const prev = readRaw(key) || {};
  writeRaw(key, {
    ...prev,
    tab: typeof tab === "number" ? tab : 0,
  });
}

export function restoreScrollWhenReady(key, isReady) {
  if (!isReady) return () => {};

  const state = readRaw(key);
  const targetY = typeof state?.scrollY === "number" ? state.scrollY : null;
  if (targetY === null) return () => {};

  let attempts = 0;
  let timeoutId = null;
  let cancelled = false;

  const tryRestore = () => {
    if (cancelled) return;
    window.scrollTo(0, targetY);
    attempts += 1;

    if (attempts < 10) {
      timeoutId = window.setTimeout(tryRestore, 120);
    }
  };

  timeoutId = window.setTimeout(tryRestore, 0);

  return () => {
    cancelled = true;
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  };
}

export function clearStoredDiscoverAndProfilePageStates() {
  const storage = safeGetStorage();
  if (!storage) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      if (key.startsWith(DISCOVER_PREFIX) || key.startsWith(PROFILE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {}
}
