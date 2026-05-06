import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { UserContext } from '../UserContext';

import PinnedSongSection from './PinnedSongSection';

jest.mock('../Common/Deposit', () => ({
  __esModule: true,
  default: ({ dep, footerSlot }) => (
    <div>
      <div data-testid="pinned-public-key">{dep?.public_key || ''}</div>
      {footerSlot}
    </div>
  ),
}));

jest.mock('../Common/Search/SearchPanel', () => ({
  __esModule: true,
  default: ({ onSelectSong }) => <button onClick={() => onSelectSong({ name: 'Pinned song', artist: 'Artist', image_url: '' })}>Choisir ce morceau</button>,
}));

jest.mock('../Common/Search/SearchProviderSelector', () => ({
  NO_PERSONALIZED_RESULTS_PROVIDER: 'server',
  resolveInitialSelectedProvider: jest.fn(() => 'server'),
}));

jest.mock('../Security/TokensUtils', () => ({
  getCookie: jest.fn(() => 'csrftoken'),
}));

jest.mock('../Auth/AuthFlow', () => ({
  buildRelativeLocation: jest.fn(() => '/flowbox/box-a/discover'),
  consumeAuthAction: jest.fn(() => null),
  startAuthPageFlow: jest.fn(),
}));

function renderPinned(boxSlug = 'box-a', contextValue = {}) {
  return render(
    <MemoryRouter>
      <UserContext.Provider value={{ user: null, setUser: jest.fn(), ...contextValue }}>
        <PinnedSongSection boxSlug={boxSlug} />
      </UserContext.Provider>
    </MemoryRouter>
  );
}

describe('PinnedSongSection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('loads active pinned deposit from the pinned-song endpoint', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        active_pinned_deposit: {
          public_key: 'pin-1',
          pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
          pin_duration_minutes: 60,
          deposited_at: new Date().toISOString(),
        },
        price_steps: [],
      }),
    });

    await act(async () => {
      renderPinned();
    });

    expect(await screen.findByTestId('pinned-public-key')).toHaveTextContent('pin-1');
    expect(global.fetch).toHaveBeenCalledWith(
      '/box-management/pinned-song/?boxSlug=box-a',
      expect.any(Object)
    );
  });

  test('loads pin price steps from the pinned-song endpoint before opening the drawer', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        active_pinned_deposit: null,
        price_steps: [{ minutes: 15, points: 100, is_affordable: true }],
      }),
    });

    await act(async () => {
      renderPinned();
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/box-management/pinned-song/?boxSlug=box-a',
      expect.any(Object)
    );

    fireEvent.click(await screen.findByRole('button', { name: /épingler une chanson/i }));
    expect(await screen.findByText('Choisis une chanson à épingler')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir ce morceau' }));
    expect(await screen.findByText('Choisis une durée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Épingler pour 100 points/i })).toBeInTheDocument();
  });

  test('shows error dialog when pin request fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active_pinned_deposit: null, price_steps: [{ minutes: 15, points: 100, is_affordable: true }] }),
    }).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Impossible d’épingler cette chanson.' }),
    });

    await act(async () => {
      renderPinned('box-a', { user: { id: 1, points: 500 } });
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: /épingler une chanson/i }));
    await screen.findByText('Choisis une chanson à épingler');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir ce morceau' }));
    await screen.findByText('Choisis une durée');
    fireEvent.click(screen.getByRole('button', { name: /Épingler pour 100 points/i }));

    expect(await screen.findByText('Impossible d’épingler cette chanson.')).toBeInTheDocument();
  });
});
