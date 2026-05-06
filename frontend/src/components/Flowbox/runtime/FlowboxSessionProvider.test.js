import { act, render } from '@testing-library/react';
import React, { useContext } from 'react';

import { FlowboxSessionContext } from './FlowboxSessionContext';
import FlowboxSessionProvider from './FlowboxSessionProvider';
import { getFlowboxBoxStorageKey } from './flowboxSessionStorage';

function readRuntime(boxSlug) {
  return JSON.parse(localStorage.getItem(getFlowboxBoxStorageKey(boxSlug)) || 'null');
}

describe('FlowboxSessionProvider discover snapshot runtime', () => {
  let contextValue;

  function Harness() {
    contextValue = useContext(FlowboxSessionContext);
    return null;
  }

  beforeEach(() => {
    contextValue = null;
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });
  });

  test('saveDiscoverSnapshot normalizes backend box-content payload to camelCase', () => {
    render(
      <FlowboxSessionProvider>
        <Harness />
      </FlowboxSessionProvider>
    );

    act(() => {
      contextValue.saveDiscoverSnapshot('box-a', {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: { public_key: 'pin-1' },
        my_deposit: null,
        successes: [{ name: 'Total', points: 10 }],
        points_balance: 5060,
      });
    });

    const runtime = readRuntime('box-a');
    expect(runtime.discoverSnapshot.data).toMatchObject({
      boxSlug: 'box-a',
      main: { public_key: 'main-1' },
      olderDeposits: [{ public_key: 'older-1' }],
      olderDepositsNextCursor: '2026-05-06T20:00:00.000000+00:00|123',
      olderDepositsHasMore: true,
      activePinnedDeposit: { public_key: 'pin-1' },
      myDeposit: null,
      successes: [{ name: 'Total', points: 10 }],
      pointsBalance: 5060,
    });
    expect(runtime.discoverSnapshot.data.loadedAt).toEqual(expect.any(String));
    expect(runtime.discoverSnapshot.cachedAt).toBe(runtime.discoverSnapshot.data.loadedAt);
  });

  test('patchDiscoverSnapshot merges deposit patch without replacing existing Discover content', () => {
    render(
      <FlowboxSessionProvider>
        <Harness />
      </FlowboxSessionProvider>
    );

    act(() => {
      contextValue.saveDiscoverSnapshot('box-a', {
        boxSlug: 'box-a',
        loadedAt: '2026-05-06T10:00:00.000Z',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: { public_key: 'pin-1' },
        my_deposit: null,
        successes: [],
        points_balance: 5000,
      });
    });

    act(() => {
      contextValue.patchDiscoverSnapshot('box-a', {
        my_deposit: { public_key: 'mine-1' },
        successes: [{ name: 'Total', points: 60 }],
        points_balance: 5060,
      });
    });

    const snapshot = readRuntime('box-a').discoverSnapshot.data;
    expect(snapshot).toMatchObject({
      boxSlug: 'box-a',
      loadedAt: '2026-05-06T10:00:00.000Z',
      main: { public_key: 'main-1' },
      olderDeposits: [{ public_key: 'older-1' }],
      olderDepositsNextCursor: '2026-05-06T20:00:00.000000+00:00|123',
      olderDepositsHasMore: true,
      activePinnedDeposit: { public_key: 'pin-1' },
      myDeposit: { public_key: 'mine-1' },
      successes: [{ name: 'Total', points: 60 }],
      pointsBalance: 5060,
    });
  });
});
