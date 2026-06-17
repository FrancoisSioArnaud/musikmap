import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { UserContext } from '../../UserContext';

import RecentlyPlayed from './RecentlyPlayed';

jest.mock('./SongList', () => ({
  __esModule: true,
  default: ({ items = [], isLoading, emptyContent }) => (
    <div>
      <div data-testid="songlist-loading">{isLoading ? 'loading' : 'idle'}</div>
      <div>{items.map((item) => item.title).join(',')}</div>
      {emptyContent}
    </div>
  ),
}));

const mockEnsureValidSpotifyAccessToken = jest.fn();
const mockFetchRecentPlaysViaProviderClient = jest.fn();
const mockGetProviderConnection = jest.fn();

jest.mock('../../Utils/streaming/SpotifyUtils', () => ({
  ensureValidSpotifyAccessToken: (...args) => mockEnsureValidSpotifyAccessToken(...args),
}));

jest.mock('../../Utils/streaming/providerClient', () => ({
  fetchRecentPlaysViaProviderClient: (...args) => mockFetchRecentPlaysViaProviderClient(...args),
  getProviderConnection: (...args) => mockGetProviderConnection(...args),
}));

function renderRecentlyPlayed() {
  return render(
    <UserContext.Provider value={{ user: { provider_connections: [] }, setUser: jest.fn() }}>
      <RecentlyPlayed visible provider="spotify" onSelectSong={jest.fn()} />
    </UserContext.Provider>
  );
}

describe('RecentlyPlayed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProviderConnection.mockReturnValue({ connected: true, can_recent_plays: true, access_token: 'token' });
    mockEnsureValidSpotifyAccessToken.mockResolvedValue('token');
  });

  test('shows info alert when there are no recent plays', async () => {
    mockFetchRecentPlaysViaProviderClient.mockResolvedValueOnce([]);
    renderRecentlyPlayed();

    expect(await screen.findByText('Aucune écoute récente disponible')).toBeInTheDocument();
  });

  test('shows warning when provider connection cannot be used', async () => {
    mockGetProviderConnection.mockReturnValueOnce({ connected: false, can_recent_plays: false, access_token: '' });
    renderRecentlyPlayed();

    expect(await screen.findByText('Connexion à Spotify impossible')).toBeInTheDocument();
  });

  test('shows request error with retry button and retries on click', async () => {
    mockFetchRecentPlaysViaProviderClient.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([{ title: 'Retry Song' }]);
    renderRecentlyPlayed();

    expect(await screen.findByText('La connexion à Spotify a échoué')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(mockFetchRecentPlaysViaProviderClient).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Retry Song')).toBeInTheDocument();
  });
});
