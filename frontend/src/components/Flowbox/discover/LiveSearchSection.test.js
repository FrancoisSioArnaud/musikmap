import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { UserContext } from '../../UserContext';
import { FlowboxSessionContext } from '../runtime/FlowboxSessionContext';

import LiveSearchSection from './LiveSearchSection';

let mockLatestSearchPanelProps = null;

jest.mock('../../Common/Search/SearchPanel', () => ({
  __esModule: true,
  default: (props) => {
    mockLatestSearchPanelProps = props;
    return (
      <div>
        <div data-testid="deposit-flow-status">{props.depositFlowState?.status || 'missing'}</div>
        <div data-testid="deposit-visual-callback">
          {typeof props.onDepositVisualComplete === 'function' ? 'enabled' : 'disabled'}
        </div>
        <button
          type="button"
          onClick={() => props.onSelectSong({ id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' }, 'request-1')}
        >
          Choisir Search song
        </button>
        <button
          type="button"
          onClick={() => props.onDepositVisualComplete?.('request-1')}
        >
          Terminer animation
        </button>
      </div>
    );
  },
}));

jest.mock('../../Security/TokensUtils', () => ({
  getCookie: jest.fn(() => 'csrf-token'),
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="location-search">{location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>Retour navigateur</button>
    </div>
  );
}

function StatefulLiveSearchSection({ onDepositCreated, initialProps }) {
  const [depositState, setDepositState] = React.useState({
    myDeposit: initialProps.myDeposit ?? null,
    successes: initialProps.successes ?? [],
    pointsBalance: initialProps.pointsBalance ?? null,
    depositPointsEarned: initialProps.depositPointsEarned ?? 0,
  });

  const handleDepositCreated = React.useCallback((normalized) => {
    setDepositState({
      myDeposit: normalized.myDeposit,
      successes: normalized.successes,
      pointsBalance: normalized.pointsBalance,
      depositPointsEarned: normalized.depositPointsEarned,
    });
    onDepositCreated(normalized);
  }, [onDepositCreated]);

  return (
    <LiveSearchSection
      {...initialProps}
      {...depositState}
      onDepositCreated={handleDepositCreated}
    />
  );
}

function renderLiveSearchSection(props = {}, options = {}) {
  const setUser = jest.fn();
  const clearBoxSession = jest.fn();
  const onDepositCreated = jest.fn();
  const userContextValue = { user: { id: 1, points: 120 }, setUser, ...(options.userContext || {}) };
  const flowboxContextValue = { clearBoxSession, ...(options.flowboxContext || {}) };
  const initialEntries = options.initialEntries || ['/flowbox/box-a/discover'];
  const initialIndex = options.initialIndex ?? initialEntries.length - 1;
  const liveSearchProps = {
    boxSlug: 'box-a',
    myDeposit: null,
    successes: [],
    pointsBalance: null,
    depositPointsEarned: 0,
    ...props,
  };

  const element = options.syncDepositState ? (
    <StatefulLiveSearchSection
      initialProps={liveSearchProps}
      onDepositCreated={onDepositCreated}
    />
  ) : (
    <LiveSearchSection
      {...liveSearchProps}
      onDepositCreated={onDepositCreated}
    />
  );

  const rendered = render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <UserContext.Provider value={userContextValue}>
        <FlowboxSessionContext.Provider value={flowboxContextValue}>
          <LocationProbe />
          <Routes>
            <Route
              path="/flowbox/:boxSlug/discover"
              element={element}
            />
            <Route path="/flowbox/:boxSlug/closed" element={<div>Closed route</div>} />
          </Routes>
        </FlowboxSessionContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return { ...rendered, setUser, clearBoxSession, onDepositCreated };
}

function mockJsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  };
}

describe('LiveSearchSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestSearchPanelProps = null;
    global.fetch = jest.fn();
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  test('shows a share CTA before deposit and opens the SearchPanel drawer through the URL', async () => {
    renderLiveSearchSection();

    expect(screen.getByRole('heading', { name: /Ajoute une chanson/i, level: 5 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));

    expect(await screen.findByText('Choisis une chanson à partager')).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('drawer=live-search');
  });

  test('browser back closes the URL-driven drawer', async () => {
    renderLiveSearchSection({});

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    expect(await screen.findByText('Choisis une chanson à partager')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retour navigateur'));

    await waitFor(() => {
      expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
  });


  test('fixes LiveSearch below the measured header only before deposit API success', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      my_deposit: { public_key: 'dep-1', song: { title: 'Search song', artist: 'Artist' } },
      successes: [],
      points_balance: 120,
      deposit_points_earned: 0,
    }));

    const header = document.createElement('header');
    document.body.appendChild(header);
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this === header) {
        return { top: 0, height: 72, bottom: 72, left: 0, right: 0, width: 320, x: 0, y: 0, toJSON: () => {} };
      }
      if (this.classList?.contains('liveSearch')) {
        return { top: 72, height: 144, bottom: 216, left: 0, right: 0, width: 320, x: 0, y: 72, toJSON: () => {} };
      }
      if (this.querySelector?.('.liveSearch')) {
        return { top: 64, height: 144, bottom: 208, left: 0, right: 0, width: 320, x: 0, y: 64, toJSON: () => {} };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const { container } = renderLiveSearchSection();
      const liveSearch = container.querySelector('.liveSearch');
      expect(liveSearch).not.toHaveClass('fixed');

      await act(async () => {
        fireEvent.scroll(window);
      });

      await waitFor(() => {
        expect(liveSearch).toHaveClass('fixed');
      });
      expect(liveSearch).toHaveStyle({ top: '72px' });
      expect(liveSearch.parentElement).toHaveStyle({ height: '144px' });

      fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

      await waitFor(() => {
        expect(screen.getByTestId('deposit-flow-status')).toHaveTextContent('success');
      });
      await waitFor(() => {
        expect(liveSearch).not.toHaveClass('fixed');
      });
      expect(liveSearch.parentElement).not.toHaveStyle({ height: '144px' });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      header.remove();
    }
  });

  test('does not scroll when the search drawer closes without a successful deposit', async () => {
    renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    expect(await screen.findByText('Choisis une chanson à partager')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retour navigateur'));

    await waitFor(() => {
      expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
    });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  test('posts selected song, waits for the visual completion, updates user points and closes drawer', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      my_deposit: { public_key: 'dep-1', song: { title: 'Search song', artist: 'Artist' } },
      successes: [{ name: 'total', points: 42 }],
      points_balance: 5060,
      deposit_points_earned: 42,
      already_exists: false,
    }));

    const { onDepositCreated, setUser } = renderLiveSearchSection({}, { syncDepositState: true });

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    expect(await screen.findByTestId('deposit-visual-callback')).toHaveTextContent('enabled');

    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/box-management/box-deposit/?boxSlug=box-a',
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({ option: { id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' } }),
        })
      );
    });
    const [depositUrl, depositInit] = global.fetch.mock.calls[0];
    expect(String(depositUrl)).not.toContain(['get', 'box'].join('-'));
    expect(JSON.parse(depositInit.body)).toEqual({
      option: { id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('deposit-flow-status')).toHaveTextContent('success');
    });
    expect(mockLatestSearchPanelProps.onDepositVisualComplete).toEqual(expect.any(Function));
    expect(onDepositCreated).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByText('Choisis une chanson à partager')).toBeInTheDocument();

    jest.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Terminer animation' }));

      await waitFor(() => {
        expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
      });

      const postDepositTarget = screen.getByTestId('post-deposit-scroll-target');

      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
      expect(HTMLElement.prototype.scrollIntoView.mock.contexts).toContain(postDepositTarget);
      expect(onDepositCreated).not.toHaveBeenCalled();
      expect(setUser).not.toHaveBeenCalled();
      expect(screen.queryByTestId('my-deposit-scroll-target')).not.toBeInTheDocument();
      expect(HTMLElement.prototype.scrollIntoView.mock.contexts).not.toContain(
        document.querySelector('.liveSearchPlaceholder')
      );

      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(onDepositCreated).toHaveBeenCalledWith({
          myDeposit: { public_key: 'dep-1', song: { title: 'Search song', artist: 'Artist' } },
          successes: [{ name: 'total', points: 42 }],
          pointsBalance: 5060,
          depositPointsEarned: 42,
        });
      });

      expect(setUser).toHaveBeenCalledWith(expect.any(Function));
      expect(setUser.mock.calls[0][0]({ id: 1, points: 120 })).toEqual({ id: 1, points: 5060 });
      expect(await screen.findByTestId('my-deposit-scroll-target')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('renders MyDeposit after deposit and does not allow opening search', () => {
    renderLiveSearchSection({
      myDeposit: { song: { title: 'Déjà déposée', artist: 'Artiste', image_url: 'cover.jpg' } },
      successes: [],
    });

    expect(screen.getByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(screen.getByText('Déjà déposée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager une chanson' })).not.toBeInTheDocument();
  });

  test('redirects to closed when the box session is required', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      { code: 'BOX_SESSION_REQUIRED', detail: 'Session requise.' },
      { ok: false, status: 403 }
    ));

    const { clearBoxSession } = renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findByText('Closed route')).toBeInTheDocument();
    expect(clearBoxSession).toHaveBeenCalledWith('box-a', { markExpired: true });
  });

  test('shows a clear message when a deposit already exists', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      { code: 'BOX_SESSION_DEPOSIT_ALREADY_EXISTS' },
      { ok: false, status: 409 }
    ));

    renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findAllByText('Tu as déjà partagé une chanson dans cette session.')).toHaveLength(2);
  });

  test('resynchronizes UI from a deposit already exists conflict payload after visual completion', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      {
        status: 409,
        code: 'BOX_SESSION_DEPOSIT_ALREADY_EXISTS',
        detail: 'Tu as déjà partagé une chanson dans cette session.',
        my_deposit: { public_key: 'dep-existing', song: { title: 'Existing song', artist: 'Artist' } },
        successes: [{ name: 'Total', points: 31 }],
        points_balance: 151,
        deposit_points_earned: 31,
      },
      { ok: false, status: 409 }
    ));

    const { onDepositCreated, setUser } = renderLiveSearchSection({}, { syncDepositState: true });

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    await waitFor(() => {
      expect(screen.getByTestId('deposit-flow-status')).toHaveTextContent('success');
    });
    expect(onDepositCreated).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByText('Choisis une chanson à partager')).toBeInTheDocument();

    jest.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Terminer animation' }));

      await waitFor(() => {
        expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
      });

      const postDepositTarget = screen.getByTestId('post-deposit-scroll-target');

      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(HTMLElement.prototype.scrollIntoView.mock.contexts).toContain(postDepositTarget);
      expect(onDepositCreated).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(onDepositCreated).toHaveBeenCalledWith({
          myDeposit: { public_key: 'dep-existing', song: { title: 'Existing song', artist: 'Artist' } },
          successes: [{ name: 'Total', points: 31 }],
          pointsBalance: 151,
          depositPointsEarned: 31,
        });
      });
      expect(setUser.mock.calls[0][0]({ id: 1, points: 120 })).toEqual({ id: 1, points: 151 });
      expect(await screen.findByTestId('my-deposit-scroll-target')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('shows a MUI error surface for network errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Réseau indisponible.'));

    renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findAllByText('Réseau indisponible.')).toHaveLength(2);
  });
});
