import { act, render, screen } from '@testing-library/react';
import React from 'react';

import { UserContext } from '../../UserContext';

import Search from './Search';

jest.mock('./SongList', () => ({
  __esModule: true,
  default: ({ items = [], isLoading, emptyContent }) => (
    <div>
      <div data-testid="songlist-loading">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="songlist-items">{items.map((item) => item.title).join(',')}</div>
      <div data-testid="songlist-empty">{emptyContent}</div>
    </div>
  ),
}));

jest.mock('../../Utils/streaming/SpotifyUtils', () => ({
  ensureValidSpotifyAccessToken: jest.fn(async () => 'token'),
}));

const searchTracksViaBackend = jest.fn();
const searchTracksViaProviderClient = jest.fn();
const getProviderConnection = jest.fn(() => null);

jest.mock('../../Utils/streaming/providerClient', () => ({
  getProviderConnection: (...args) => getProviderConnection(...args),
  searchTracksViaBackend: (...args) => searchTracksViaBackend(...args),
  searchTracksViaProviderClient: (...args) => searchTracksViaProviderClient(...args),
}));

function renderSearch(props = {}, contextValue = {}) {
  return render(
    <UserContext.Provider value={{ user: null, setUser: jest.fn(), ...contextValue }}>
      <Search visible searchValue="Muse" provider="spotify" onSelectSong={jest.fn()} {...props} />
    </UserContext.Provider>
  );
}

describe('Search', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('shows inline error alert instead of empty state when backend search fails', async () => {
    searchTracksViaBackend.mockRejectedValueOnce(new Error('boom'));

    renderSearch({ provider: 'none' });

    await act(async () => {
      jest.advanceTimersByTime(560);
    });

    expect(await screen.findByText('Oops, une erreur s’est produite. Réessaie dans un instant.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat.')).not.toBeInTheDocument();
  });

  test('reuses cached results with a short loading state', async () => {
    searchTracksViaBackend.mockResolvedValueOnce([{ title: 'Muse Song' }]);

    const { rerender } = render(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="Muse" provider="none" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    await act(async () => {
      jest.advanceTimersByTime(560);
    });

    expect(searchTracksViaBackend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Muse Song')).toBeInTheDocument();

    rerender(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="  Muse  " provider="server" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('loading');

    await act(async () => {
      jest.advanceTimersByTime(60);
    });

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('idle');
    expect(searchTracksViaBackend).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Muse Song')).toBeInTheDocument();
  });
});
