// TTL helpers pour localStorage
// Stocke sous la forme: { value: any, expiresAt: <timestamp ms> }

const DEFAULT_TTL_MINUTES = 20;
const MS = 60 * 1000;

export function setWithTTL(key, value, ttlMinutes = DEFAULT_TTL_MINUTES) {
  try {
    const expiresAt = Date.now() + ttlMinutes * MS;
    const payload = JSON.stringify({ value, expiresAt });
    localStorage.setItem(key, payload);
  } catch {}
}

export function getValid(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.expiresAt !== "number") {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() > obj.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return obj.value;
  } catch {
    return null;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}
