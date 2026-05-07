import { act, render, screen } from '@testing-library/react';
import React from 'react';

import { UserContext } from '../../UserContext';

import Search from './Search';

jest.mock('./SongList', () => ({
  __esModule: true,
  default: ({ items = [], isLoading, emptyContent }) => (
    <div>
      <div data-testid="songlist-loading">{isLoading ? 'loading' : 'idle'}</div>
      {!isLoading ? <div data-testid="songlist-items">{items.map((item) => item.title).join(',')}</div> : null}
      {!isLoading ? <div data-testid="songlist-empty">{emptyContent}</div> : null}
    </div>
  ),
}));

jest.mock('../../Utils/streaming/SpotifyUtils', () => ({
  ensureValidSpotifyAccessToken: jest.fn(async () => 'token'),
}));

const mockSearchTracksViaBackend = jest.fn();
const mockSearchTracksViaProviderClient = jest.fn();
const mockGetProviderConnection = jest.fn(() => null);

jest.mock('../../Utils/streaming/providerClient', () => ({
  getProviderConnection: (...args) => mockGetProviderConnection(...args),
  searchTracksViaBackend: (...args) => mockSearchTracksViaBackend(...args),
  searchTracksViaProviderClient: (...args) => mockSearchTracksViaProviderClient(...args),
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

  test('shows loader immediately for a non-empty query but keeps the network debounce', async () => {
    mockSearchTracksViaBackend.mockResolvedValueOnce([{ title: 'Immediate Song' }]);

    renderSearch({ provider: 'none', searchValue: 'Radiohead' });

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('loading');
    expect(mockSearchTracksViaBackend).not.toHaveBeenCalled();
    expect(screen.queryByText('Aucun résultat.')).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(540);
    });

    expect(mockSearchTracksViaBackend).not.toHaveBeenCalled();
    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('loading');

    await act(async () => {
      jest.advanceTimersByTime(20);
      await Promise.resolve();
    });

    expect(mockSearchTracksViaBackend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Immediate Song')).toBeInTheDocument();
    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('idle');
  });

  test('shows inline error alert instead of empty state when backend search fails', async () => {
    mockSearchTracksViaBackend.mockRejectedValueOnce(new Error('boom'));

    renderSearch({ provider: 'none' });

    await act(async () => {
      jest.advanceTimersByTime(560);
    });

    expect(await screen.findByText('Oops, une erreur s’est produite. Réessaie dans un instant.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat.')).not.toBeInTheDocument();
  });

  test('hides previously displayed results before applying cached results for the next query', async () => {
    mockSearchTracksViaBackend
      .mockResolvedValueOnce([{ title: 'Muse Song' }])
      .mockResolvedValueOnce([{ title: 'Queen Song' }]);

    const { rerender } = render(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="Muse" provider="none" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    await act(async () => {
      jest.advanceTimersByTime(560);
      await Promise.resolve();
    });
    expect(await screen.findByText('Muse Song')).toBeInTheDocument();

    rerender(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="Queen" provider="none" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    await act(async () => {
      jest.advanceTimersByTime(560);
      await Promise.resolve();
    });
    expect(await screen.findByText('Queen Song')).toBeInTheDocument();

    rerender(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="Muse" provider="none" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('loading');
    expect(screen.queryByText('Queen Song')).not.toBeInTheDocument();
    expect(screen.queryByText('Muse Song')).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(160);
    });

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('idle');
    expect(screen.getByText('Muse Song')).toBeInTheDocument();
    expect(mockSearchTracksViaBackend).toHaveBeenCalledTimes(2);
  });

  test('reuses cached results with a short loading state', async () => {
    mockSearchTracksViaBackend.mockResolvedValueOnce([{ title: 'Muse Song' }]);

    const { rerender } = render(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="Muse" provider="none" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    await act(async () => {
      jest.advanceTimersByTime(560);
    });

    expect(mockSearchTracksViaBackend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Muse Song')).toBeInTheDocument();

    rerender(
      <UserContext.Provider value={{ user: null, setUser: jest.fn() }}>
        <Search visible searchValue="  Muse  " provider="server" onSelectSong={jest.fn()} />
      </UserContext.Provider>
    );

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('loading');

    await act(async () => {
      jest.advanceTimersByTime(160);
    });

    expect(screen.getByTestId('songlist-loading')).toHaveTextContent('idle');
    expect(mockSearchTracksViaBackend).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Muse Song')).toBeInTheDocument();
  });
});
