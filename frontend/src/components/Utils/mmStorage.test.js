import { getValid, removeKey, setWithTTL } from './mmStorage';

describe('mmStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('setWithTTL stores a payload with expiration and getValid returns the value before expiry', () => {
    setWithTTL('demo', { ok: true }, 20);

    expect(getValid('demo')).toEqual({ ok: true });
  });

  test('getValid removes expired payloads', () => {
    localStorage.setItem('expired', JSON.stringify({ value: { stale: true }, expiresAt: 10 }));
    Date.now.mockReturnValue(20);

    expect(getValid('expired')).toBeNull();
    expect(localStorage.getItem('expired')).toBeNull();
  });

  test('getValid purges invalid json payloads gracefully', () => {
    localStorage.setItem('broken', '{not-json');

    expect(getValid('broken')).toBeNull();
  });

  test('removeKey deletes the key', () => {
    setWithTTL('demo', 'x', 20);
    removeKey('demo');
    expect(localStorage.getItem('demo')).toBeNull();
  });
});
