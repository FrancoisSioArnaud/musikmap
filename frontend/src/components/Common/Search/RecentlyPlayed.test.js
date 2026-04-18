import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import RecentlyPlayed from './RecentlyPlayed';
import { UserContext } from '../../UserContext';

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

const ensureValidSpotifyAccessToken = jest.fn();
const fetchRecentPlaysViaProviderClient = jest.fn();
const getProviderConnection = jest.fn();

jest.mock('../../Utils/streaming/SpotifyUtils', () => ({
  ensureValidSpotifyAccessToken: (...args) => ensureValidSpotifyAccessToken(...args),
}));

jest.mock('../../Utils/streaming/providerClient', () => ({
  fetchRecentPlaysViaProviderClient: (...args) => fetchRecentPlaysViaProviderClient(...args),
  getProviderConnection: (...args) => getProviderConnection(...args),
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
    getProviderConnection.mockReturnValue({ connected: true, can_recent_plays: true, access_token: 'token' });
    ensureValidSpotifyAccessToken.mockResolvedValue('token');
  });

  test('shows info alert when there are no recent plays', async () => {
    fetchRecentPlaysViaProviderClient.mockResolvedValueOnce([]);
    renderRecentlyPlayed();

    expect(await screen.findByText('Aucune écoute récente disponible')).toBeInTheDocument();
  });

  test('shows warning when provider connection cannot be used', async () => {
    getProviderConnection.mockReturnValueOnce({ connected: false, can_recent_plays: false, access_token: '' });
    renderRecentlyPlayed();

    expect(await screen.findByText('Connexion à Spotify impossible')).toBeInTheDocument();
  });

  test('shows request error with retry button and retries on click', async () => {
    fetchRecentPlaysViaProviderClient.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([{ title: 'Retry Song' }]);
    renderRecentlyPlayed();

    expect(await screen.findByText('La connexion à Spotify a échoué')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(fetchRecentPlaysViaProviderClient).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Retry Song')).toBeInTheDocument();
  });
});
